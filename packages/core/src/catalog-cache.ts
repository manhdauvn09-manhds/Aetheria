// Aetheria — static catalog caching.
//
// Quests, shop items, skills, items — data that changes rarely (admin-only)
// but are read on every session. Redis cache with time-based keys so we
// reuse results for the duration of the cache window (TTL). No invalidation
// mechanism needed: key rotates hourly, old entries expire naturally.

import type { Redis } from "ioredis";

export interface CatalogCacheOptions {
  readonly redis: Redis | null;
  /** Cache TTL in seconds. Default: 3600 (1 hour). */
  readonly ttlSeconds?: number;
}

interface CatalogMetrics {
  hits: number;
  misses: number;
  noRedis: number;
}

const metrics: CatalogMetrics = {
  hits: 0,
  misses: 0,
  noRedis: 0,
};

/**
 * Cached read of a catalog that rarely changes.
 *
 * Usage:
 *   const quests = await catalogCache.get(
 *     redis,
 *     "quest:daily",  // unique catalog key
 *     async () => db.quest.findMany({ where: { type: "daily" } })
 *   );
 */
export const catalogCache = {
  async get<T>(
    redis: Redis | null,
    catalogKey: string,
    fn: () => Promise<T>,
    ttlSeconds = 3600,
  ): Promise<T> {
    if (!redis) {
      // No Redis: always recompute. Dev/test fallback.
      metrics.noRedis++;
      return fn();
    }

    // Cache key includes current hour so entries rotate hourly.
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const cacheKey = `catalog:${catalogKey}:${hourKey}`;

    // Try cache hit.
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        metrics.hits++;
        return JSON.parse(cached) as T;
      } catch {
        // Malformed cache entry — recompute and re-cache.
      }
    }

    // Cache miss: fetch fresh.
    metrics.misses++;
    const result = await fn();
    const serialized = JSON.stringify(result);

    // Fire-and-forget cache write. Failure doesn't block the caller.
    void redis.setex(cacheKey, ttlSeconds, serialized).catch(() => {
      // Silently ignore: cache write failure shouldn't fail the request.
    });

    return result;
  },
};

export function getCatalogCacheMetrics(): CatalogMetrics {
  return { ...metrics };
}
