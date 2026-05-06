// Aetheria — no-op Redis stub for PvP matchmaking when REDIS_URL is unset.
//
// Implements just the `PvpRedisClient` surface (`zadd` / `zrem` / `zrange`
// / `zcard` / `zscore`). Every call returns the empty/zero answer so
// `queue()` "succeeds" with nothing happening and `tick()` finds no
// pairs. The matcher loop is not started in this mode.

import type { PvpRedisClient } from "@aetheria/domain-pvp";

const zero = (): Promise<number> => Promise.resolve(0);
const empty = (): Promise<string[]> => Promise.resolve([]);
const nullish = (): Promise<string | null> => Promise.resolve(null);

export const noopRedis: PvpRedisClient = {
  zadd: zero,
  zrem: zero,
  zrange: empty,
  zcard: zero,
  zscore: nullish,
} as unknown as PvpRedisClient;
