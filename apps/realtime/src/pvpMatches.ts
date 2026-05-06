// Aetheria — realtime PvP match runtime.
//
// Subscribes to `aetheria:pvp:match.start` (written by apps/api when
// a proposal is created) and bootstraps an in-memory match state.
// Both players' user-rooms get an `auto-join` push for `match:<id>`,
// then `pvp:action` events drive the turn loop. End conditions:
//   • surrender / completion → publish `aetheria:pvp:match.end` for
//     apps/api to persist via `PvpMatchService.complete/forfeit`.
//   • turn deadline miss → forfeit current turn-holder.

import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { Server as IoServer, Socket } from "socket.io";

import {
  REDIS_PVP_MATCH_CHANNEL,
  REDIS_PVP_MATCH_END_CHANNEL,
} from "@aetheria/domain-pvp";

import {
  buildInitialState,
  evaluateAction,
  onDeadlineMiss,
  parseMatchStart,
  parsePvpAction,
  TURN_TIMEOUT_MS,
  type MatchState,
} from "./pvp.js";

export interface PvpMatchesRuntime {
  readonly close: () => Promise<void>;
}

export const matchRoom = (matchId: string): string => `match:${matchId}`;

export const attachPvpMatches = (
  io: IoServer,
  startSubClient: Redis,
  endPubClient: Redis,
  log: Logger,
): PvpMatchesRuntime => {
  const states = new Map<string, MatchState>();
  const deadlineTimers = new Map<string, NodeJS.Timeout>();

  const armDeadline = (state: MatchState): void => {
    const prior = deadlineTimers.get(state.matchId);
    if (prior) clearTimeout(prior);
    const remaining = Math.max(0, state.turnDeadline - Date.now());
    const t = setTimeout(() => {
      const cur = states.get(state.matchId);
      if (!cur || cur.status === "ended") return;
      // R8: re-check the deadline at fire time. A `pvp:action` may have
      // pushed `turnDeadline` forward between the timer being armed and
      // it firing; if the fresh state isn't actually expired, bail and
      // re-arm.
      if (cur.turnDeadline > Date.now()) {
        armDeadline(cur);
        return;
      }
      const { winnerUserId, loserUserId } = onDeadlineMiss(cur);
      states.set(cur.matchId, { ...cur, status: "ended" });
      io.to(matchRoom(cur.matchId)).emit("pvp:end", {
        matchId: cur.matchId,
        reason: "timeout",
        winnerUserId,
        loserUserId,
      });
      // R9: drop in-memory state once the match is finalised so a long
      // server uptime doesn't accumulate ended matches forever.
      states.delete(cur.matchId);
      deadlineTimers.delete(cur.matchId);
      void endPubClient
        .publish(
          REDIS_PVP_MATCH_END_CHANNEL,
          JSON.stringify({
            matchId: cur.matchId,
            reason: "timeout",
            winnerUserId,
            loserUserId,
            endedAt: new Date().toISOString(),
          }),
        )
        .catch((e: unknown) => {
          log.warn({ err: e, matchId: cur.matchId }, "match-end publish failed");
        });
    }, remaining);
    t.unref();
    deadlineTimers.set(state.matchId, t);
  };

  const handleStart = (raw: string): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log.warn("dropped malformed match.start payload");
      return;
    }
    const evt = parseMatchStart(parsed);
    if (!evt) {
      log.warn("dropped invalid match.start shape");
      return;
    }
    const state = buildInitialState(evt, Date.now());
    if (!state) return;
    states.set(state.matchId, state);

    // Push players into their match room. They're already in their
    // `user:<id>` rooms thanks to `server.ts` connection handler, so we
    // can target them directly. This works even before they emit any
    // socket event of their own.
    for (const userId of evt.players) {
      io.in(`user:${userId}`).socketsJoin(matchRoom(state.matchId));
    }
    io.to(matchRoom(state.matchId)).emit("pvp:start", {
      matchId: state.matchId,
      players: state.players,
      turnUserId: state.turnUserId,
      turnNumber: state.turnNumber,
      turnDeadline: state.turnDeadline,
      mode: state.mode,
      region: state.region,
    });
    armDeadline(state);
  };

  void startSubClient.subscribe(REDIS_PVP_MATCH_CHANNEL).catch((e: unknown) => {
    log.error({ err: e }, "pvp match.start subscribe failed");
  });
  startSubClient.on("message", (channel, raw) => {
    if (channel !== REDIS_PVP_MATCH_CHANNEL) return;
    handleStart(raw);
  });

  const onConnection = (socket: Socket): void => {
    socket.on("pvp:action", (payload: unknown, ack?: (resp: unknown) => void) => {
      const userId = socket.auth?.userId;
      if (!userId) {
        ack?.({ ok: false, reason: "unauthenticated" });
        return;
      }
      const action = parsePvpAction(payload);
      if (!action) {
        ack?.({ ok: false, reason: "bad_request" });
        return;
      }
      const state = states.get(action.matchId);
      if (!state) {
        ack?.({ ok: false, reason: "no_match" });
        return;
      }
      const result = evaluateAction(state, userId, action, Date.now());
      if (!result.ok) {
        ack?.({ ok: false, reason: result.reason });
        return;
      }
      states.set(state.matchId, result.nextState);
      io.to(matchRoom(state.matchId)).emit("pvp:state", {
        matchId: state.matchId,
        action,
        actorUserId: userId,
        turnUserId: result.nextState.turnUserId,
        turnNumber: result.nextState.turnNumber,
        turnDeadline: result.nextState.turnDeadline,
      });
      if (result.ended) {
        const prior = deadlineTimers.get(state.matchId);
        if (prior) clearTimeout(prior);
        deadlineTimers.delete(state.matchId);
        // R9: drop in-memory state on resolved-via-action paths too.
        states.delete(state.matchId);
        const loser =
          result.ended.reason === "forfeit"
            ? state.players.find((p) => p !== result.ended?.winnerUserId) ?? null
            : null;
        io.to(matchRoom(state.matchId)).emit("pvp:end", {
          matchId: state.matchId,
          reason: result.ended.reason,
          winnerUserId: result.ended.winnerUserId,
          loserUserId: loser,
        });
        void endPubClient
          .publish(
            REDIS_PVP_MATCH_END_CHANNEL,
            JSON.stringify({
              matchId: state.matchId,
              reason: result.ended.reason,
              winnerUserId: result.ended.winnerUserId,
              loserUserId: loser,
              endedAt: new Date().toISOString(),
            }),
          )
          .catch((e: unknown) => {
            log.warn({ err: e, matchId: state.matchId }, "match-end publish failed");
          });
      } else if (action.kind !== "heartbeat") {
        armDeadline(result.nextState);
      }
      ack?.({ ok: true });
    });
  };
  io.on("connection", onConnection);

  return {
    close: async (): Promise<void> => {
      for (const t of deadlineTimers.values()) clearTimeout(t);
      deadlineTimers.clear();
      states.clear();
      io.off("connection", onConnection);
      try {
        await startSubClient.unsubscribe(REDIS_PVP_MATCH_CHANNEL);
      } catch (e) {
        log.warn({ err: e }, "pvp match.start unsubscribe failed");
      }
      await startSubClient.quit();
    },
  };
};

// Re-export so server.ts can use it as a default deadline reference.
export { TURN_TIMEOUT_MS };
