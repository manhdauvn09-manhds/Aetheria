// Aetheria — match-end Redis consumer.
//
// Subscribes to `aetheria:pvp:match.end` (written by apps/realtime when a
// match completes / forfeits / times out) and finalises the durable
// state via PvpMatchService.complete or .forfeit. Idempotent: if the
// match is already non-active the service rejects and we swallow.

import type { Redis } from "ioredis";

import {
  REDIS_PVP_MATCH_END_CHANNEL,
  type MatchEndEvent,
  type PvpMatchService,
} from "@aetheria/domain-pvp";

const isMatchEnd = (raw: unknown): raw is MatchEndEvent => {
  if (raw === null || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.matchId === "string" &&
    (r.reason === "completed" || r.reason === "forfeit" || r.reason === "timeout") &&
    (r.winnerUserId === null || typeof r.winnerUserId === "string") &&
    (r.loserUserId === null || typeof r.loserUserId === "string") &&
    typeof r.endedAt === "string"
  );
};

export interface MatchEndConsumer {
  readonly close: () => Promise<void>;
}

export const attachMatchEndConsumer = (
  sub: Redis,
  service: PvpMatchService,
  log: { warn: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void },
): MatchEndConsumer => {
  void sub.subscribe(REDIS_PVP_MATCH_END_CHANNEL).catch((e: unknown) => {
    log.error({ err: e }, "match.end subscribe failed");
  });

  sub.on("message", (channel, raw) => {
    if (channel !== REDIS_PVP_MATCH_END_CHANNEL) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log.warn({ raw: raw.slice(0, 200) }, "dropped malformed match.end payload");
      return;
    }
    if (!isMatchEnd(parsed)) {
      log.warn({}, "dropped invalid match.end shape");
      return;
    }
    const matchId = BigInt(parsed.matchId);
    const winner = parsed.winnerUserId === null ? null : BigInt(parsed.winnerUserId);
    const reason = parsed.reason;

    const op =
      reason === "forfeit" && parsed.loserUserId !== null
        ? service.forfeit(matchId, BigInt(parsed.loserUserId))
        : service.complete(matchId, winner, reason);
    op.catch((e: unknown) => {
      log.warn({ err: e, matchId: parsed.matchId }, "match-end finalise failed");
    });
  });

  return {
    close: async (): Promise<void> => {
      try {
        await sub.unsubscribe(REDIS_PVP_MATCH_END_CHANNEL);
      } catch (e) {
        log.warn({ err: e }, "match.end unsubscribe failed");
      }
      await sub.quit();
    },
  };
};
