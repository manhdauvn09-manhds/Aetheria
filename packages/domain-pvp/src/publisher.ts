// Aetheria — match-start realtime publisher.
//
// Mirrors `domain-social/chat/publisher`: ChatService publishes per-message,
// MatchService publishes per-match-start so apps/realtime can pre-create
// the per-match room and notify both players.

import type { Redis } from "ioredis";

import type { MatchEndEvent, MatchStartEvent, PvpMatchRow } from "./types.js";

export const REDIS_PVP_MATCH_CHANNEL = "aetheria:pvp:match.start";
export const REDIS_PVP_MATCH_END_CHANNEL = "aetheria:pvp:match.end";

export interface MatchPublisher {
  publish: (evt: MatchStartEvent) => Promise<void>;
}

export interface MatchEndPublisher {
  publishEnd: (evt: MatchEndEvent) => Promise<void>;
}

export const toMatchStartEvent = (row: PvpMatchRow): MatchStartEvent => ({
  matchId: row.matchId.toString(),
  mode: row.mode,
  region: row.region,
  players: row.players.map((p) => p.userId.toString()),
  startedAt: row.startedAt.toISOString(),
});

export const redisMatchPublisher = (
  redis: Redis,
  log?: { warn: (obj: unknown, msg?: string) => void },
): MatchPublisher => ({
  publish: async (evt): Promise<void> => {
    try {
      await redis.publish(REDIS_PVP_MATCH_CHANNEL, JSON.stringify(evt));
    } catch (e) {
      log?.warn({ err: e, matchId: evt.matchId }, "pvp match publish failed");
    }
  },
});

export const redisMatchEndPublisher = (
  redis: Redis,
  log?: { warn: (obj: unknown, msg?: string) => void },
): MatchEndPublisher => ({
  publishEnd: async (evt): Promise<void> => {
    try {
      await redis.publish(REDIS_PVP_MATCH_END_CHANNEL, JSON.stringify(evt));
    } catch (e) {
      log?.warn({ err: e, matchId: evt.matchId }, "pvp match-end publish failed");
    }
  },
});
