// Aetheria — item stats cache.
//
// Items are static (admin-only changes) but frequently looked up during
// reward distribution (quests, battlepass) and inventory operations.
// Cache hits with a simple in-memory Map + Redis as a second layer.

import type { Redis } from "ioredis";

export interface ItemStats {
  readonly id: bigint;
  readonly maxStack: number;
  readonly effect?: string | null;
}

const memoryCache = new Map<bigint, ItemStats>();

interface CacheMetrics {
  memoryHits: number;
  redisHits: number;
  dbMisses: number;
}

const metrics: CacheMetrics = {
  memoryHits: 0,
  redisHits: 0,
  dbMisses: 0,
};

/**
 * Get item stats with two-level caching: in-memory first (instant),
 * Redis second (warm start across processes), database last (slow).
 */
export async function getItemStats(
  itemId: bigint,
  redis: Redis | null,
  fn: () => Promise<ItemStats>,
): Promise<ItemStats> {
  // Memory cache hit (instant).
  const inMem = memoryCache.get(itemId);
  if (inMem) {
    metrics.memoryHits++;
    return inMem;
  }

  // Redis cache hit (process miss but warm).
  if (redis) {
    const cacheKey = `item:${itemId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const stats = JSON.parse(cached) as ItemStats;
        // Restore bigint from string (JSON doesn't support bigint).
        stats.id = BigInt(stats.id);
        memoryCache.set(itemId, stats);
        metrics.redisHits++;
        return stats;
      } catch {
        // Malformed cache entry.
      }
    }
  }

  // Cache miss: fetch from database.
  const stats = await fn();
  metrics.dbMisses++;

  // Write to both layers. Fire-and-forget Redis write.
  memoryCache.set(itemId, stats);
  if (redis) {
    void redis
      .setex(`item:${itemId}`, 3600, JSON.stringify(stats))
      .catch(() => {
        // Silently ignore cache write failures.
      });
  }

  return stats;
}

export function getItemCacheMetrics(): CacheMetrics {
  return { ...metrics };
}
