// Aetheria — item stats cache.
//
// Items are static (admin-only changes) but frequently looked up during
// reward distribution (quests, battlepass) and inventory operations.
// Cache hits with a simple in-memory Map + Redis as a second layer.

import type { Redis } from "ioredis";

export interface ItemStats {
  readonly id: bigint;
  readonly maxStack: number;
  /**
   * Item.effect column — Prisma JSON. Callers that need the parsed
   * recipe / effect shape narrow it themselves (e.g. via `parseRecipe`).
   * Kept as `unknown` so Prisma's JsonValue assigns without a cast.
   */
  readonly effect?: unknown;
}

const memoryCache = new Map<bigint, ItemStats>();

export interface CacheMetrics {
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
 *
 * `fn` may return `null` (e.g. Prisma's `findUnique` shape) — the cache
 * propagates that null back to the caller so callers can map it to a
 * domain-specific "item not found" error.
 */
export async function getItemStats(
  itemId: bigint,
  redis: Redis | null,
  fn: () => Promise<ItemStats | null>,
): Promise<ItemStats | null> {
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
        const raw = JSON.parse(cached) as ItemStats;
        // Restore bigint from string (JSON doesn't support bigint). The
        // interface marks `id` readonly so we construct a fresh object
        // rather than mutating the parsed shape in place.
        const stats: ItemStats = { ...raw, id: BigInt(raw.id) };
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
  // Don't cache misses — caller decides whether a missing row is an error
  // (most do throw notFound). Returning null here also matches the
  // Prisma findUnique convention.
  if (stats === null) return null;

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
