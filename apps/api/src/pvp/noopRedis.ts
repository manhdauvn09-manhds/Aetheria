// Aetheria — no-op Redis stub for PvP when REDIS_URL is unset.
//
// Covers both `PvpRedisClient` (matchmaker) and `LbRedisClient`
// (leaderboard). Every call returns the empty/zero answer so the API
// boots and queue/leaderboard endpoints reply but no real state is
// kept. The matcher loop + leaderboard writes are no-ops in this mode.

import type { LbRedisClient, PvpRedisClient } from "@aetheria/domain-pvp";

const zero = (): Promise<number> => Promise.resolve(0);
const nullishNumber = (): Promise<number | null> => Promise.resolve(null);
const empty = (): Promise<string[]> => Promise.resolve([]);
const nullish = (): Promise<string | null> => Promise.resolve(null);

const okString = (): Promise<string> => Promise.resolve("OK");

export const noopRedis: PvpRedisClient & LbRedisClient = {
  zadd: zero,
  zrem: zero,
  zrange: empty,
  zrevrange: empty,
  zrevrank: nullishNumber,
  zcard: zero,
  zscore: nullish,
  // R7: fake `set NX` always wins so dev mode doesn't deadlock the queue.
  set: okString,
  del: zero,
} as unknown as PvpRedisClient & LbRedisClient;
