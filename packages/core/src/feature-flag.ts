// Aetheria — feature flag reader.
//
// Flags live in MySQL `feature_flags`. Two read paths:
//   - `isOn(key)` for global on/off (default false if missing)
//   - `isOn(key, userId)` for percentage rollouts using a stable hash bucket
//
// Reads are TTL-cached in-process for FF_CACHE_MS (default 60_000 ms) so a
// hot path is one map lookup, not a SQL round-trip.
//
// Flag value shape (JSON column):
//   { "enabled": true }                                  → on for all
//   { "enabled": true, "rollout": 25 }                   → on for 25% of users
//   { "enabled": false }                                 → off
//
// `rollout` ∈ [0, 100]; bucket = fnv1a(`<key>:<userId>`) % 100.

import { mysql } from "@aetheria/schema-db/mysql";
import type { UserId } from "@aetheria/shared-types";

interface FlagValue {
  readonly enabled: boolean;
  readonly rollout?: number; // 0..100
}

const FF_CACHE_MS = Number(process.env.AETHERIA_FF_CACHE_MS ?? 60_000);

interface CacheEntry {
  readonly value: FlagValue | null; // null = key missing
  readonly fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

const isFresh = (entry: CacheEntry | undefined): entry is CacheEntry =>
  entry !== undefined && Date.now() - entry.fetchedAt < FF_CACHE_MS;

const fetchFlag = async (key: string): Promise<FlagValue | null> => {
  const row = await mysql.featureFlag.findUnique({ where: { key } });
  if (!row) return null;
  // `value` is JSON; trust the writer (admin) but defensively coerce.
  const v = row.value as { enabled?: unknown; rollout?: unknown };
  return {
    enabled: v.enabled === true,
    ...(typeof v.rollout === "number" ? { rollout: Math.max(0, Math.min(100, v.rollout)) } : {}),
  };
};

/** FNV-1a 32-bit hash. Stable, fast, not cryptographic. */
const fnv1a = (str: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // unsigned
  return hash >>> 0;
};

const inRolloutBucket = (key: string, userId: UserId | bigint, rollout: number): boolean => {
  if (rollout >= 100) return true;
  if (rollout <= 0) return false;
  const bucket = fnv1a(`${key}:${String(userId)}`) % 100;
  return bucket < rollout;
};

export const featureFlag = {
  /** Return the flag's effective on/off for the given user (or globally if no user). */
  async isOn(key: string, userId?: UserId | bigint): Promise<boolean> {
    const cached = cache.get(key);
    let value: FlagValue | null;
    if (isFresh(cached)) {
      value = cached.value;
    } else {
      value = await fetchFlag(key);
      cache.set(key, { value, fetchedAt: Date.now() });
    }
    if (!value?.enabled) return false;
    if (value.rollout === undefined || userId === undefined) return value.enabled;
    return inRolloutBucket(key, userId, value.rollout);
  },

  /** Drop the in-process cache (admin tools, tests). */
  invalidate(key?: string): void {
    if (key === undefined) cache.clear();
    else cache.delete(key);
  },
};
