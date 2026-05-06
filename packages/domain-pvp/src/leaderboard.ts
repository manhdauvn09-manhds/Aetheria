// Aetheria — Leaderboard service.
//
// Live snapshot lives in Redis as a sorted set per (mode, seasonId):
//   key:    `aetheria:lb:{mode}:{seasonId}`
//   score:  player's current MMR (rating, integer)
//   member: userId stringified
//
// `recordResult` is called by MmrService after every match. `top` and
// `aroundUser` are read paths used by the leaderboard UI. The MySQL
// `leaderboards` snapshot table is owned by a worker (Phase 4-I) and not
// touched here.

import type { Redis } from "ioredis";

import type { PvpMode } from "./types.js";

export type LbRedisClient = Pick<
  Redis,
  "zadd" | "zrevrange" | "zrevrank" | "zcard" | "zscore"
>;

export interface LeaderboardDeps {
  readonly redis: LbRedisClient;
  /** Default season when callers don't supply one. */
  readonly seasonId?: string;
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly userId: string;
  readonly mmr: number;
}

export const lbKey = (mode: PvpMode, seasonId: string): string =>
  `aetheria:lb:${mode}:${seasonId}`;

/**
 * Resolve a [low, high] window centred on `rank` (0-indexed) of width
 * `2*radius + 1`, clamped at the ZSET's bounds. Pure.
 */
export const slidingWindow = (
  rank: number,
  radius: number,
  total: number,
): { low: number; high: number } => {
  if (total <= 0) return { low: 0, high: -1 };
  const r = Math.max(0, radius | 0);
  const t = total - 1;
  const low = Math.max(0, rank - r);
  const high = Math.min(t, rank + r);
  return { low, high };
};

const parseEntries = (raw: readonly string[], baseRank: number): LeaderboardEntry[] => {
  const out: LeaderboardEntry[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const member = raw[i];
    const score = raw[i + 1];
    if (member === undefined || score === undefined) continue;
    const mmr = Number.parseInt(score, 10);
    if (!Number.isFinite(mmr)) continue;
    out.push({ rank: baseRank + i / 2, userId: member, mmr });
  }
  return out;
};

export class LeaderboardService {
  private readonly redis: LbRedisClient;
  private readonly defaultSeasonId: string;

  constructor(deps: LeaderboardDeps) {
    this.redis = deps.redis;
    this.defaultSeasonId = deps.seasonId ?? "1";
  }

  /** Idempotent: ZADD overwrites the score so re-applying is safe. */
  async recordResult(params: {
    readonly userId: bigint;
    readonly mode: PvpMode;
    readonly mmr: number;
    readonly seasonId?: string;
  }): Promise<void> {
    const key = lbKey(params.mode, params.seasonId ?? this.defaultSeasonId);
    await this.redis.zadd(key, params.mmr, params.userId.toString());
  }

  async top(
    mode: PvpMode,
    limit = 50,
    seasonId?: string,
  ): Promise<readonly LeaderboardEntry[]> {
    const cap = Math.min(500, Math.max(1, limit | 0));
    const key = lbKey(mode, seasonId ?? this.defaultSeasonId);
    const raw = await this.redis.zrevrange(key, 0, cap - 1, "WITHSCORES");
    return parseEntries(raw, 0);
  }

  async aroundUser(
    userId: bigint,
    mode: PvpMode,
    radius = 5,
    seasonId?: string,
  ): Promise<{
    rank: number | null;
    mmr: number | null;
    entries: readonly LeaderboardEntry[];
  }> {
    const key = lbKey(mode, seasonId ?? this.defaultSeasonId);
    const member = userId.toString();
    const [rankRaw, scoreRaw, totalRaw] = await Promise.all([
      this.redis.zrevrank(key, member),
      this.redis.zscore(key, member),
      this.redis.zcard(key),
    ]);
    if (rankRaw === null) {
      return { rank: null, mmr: null, entries: [] };
    }
    const rank = rankRaw;
    const total = totalRaw;
    const window = slidingWindow(rank, radius, total);
    const raw = await this.redis.zrevrange(key, window.low, window.high, "WITHSCORES");
    return {
      rank,
      mmr: scoreRaw === null ? null : Number.parseInt(scoreRaw, 10),
      entries: parseEntries(raw, window.low),
    };
  }
}
