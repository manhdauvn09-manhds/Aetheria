// Aetheria — Redis-backed distributed lock primitives.
//
// Pattern: `SET <key> <token> NX PX <ttlMs>`. Release uses a Lua CAS so
// we never delete a token that's been re-acquired by another worker.
//
// Used by `runLocked(name, ttlMs, fn)` — the canonical wrapper that
// every job uses to ensure single-fire semantics across a worker fleet.

import { randomUUID } from "node:crypto";

import type { Redis } from "ioredis";

export type LockRedisClient = Pick<Redis, "set" | "eval">;

export const lockKey = (name: string): string => `aetheria:worker:lock:${name}`;

const RELEASE_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export interface AcquiredLock {
  readonly key: string;
  readonly token: string;
}

/** Try once. Returns the lock handle on success, null on contention. */
export const acquire = async (
  redis: LockRedisClient,
  name: string,
  ttlMs: number,
): Promise<AcquiredLock | null> => {
  const key = lockKey(name);
  const token = randomUUID();
  const res = await redis.set(key, token, "PX", ttlMs, "NX");
  return res === "OK" ? { key, token } : null;
};

/** CAS-safe release. Returns true when this caller actually held the lock. */
export const release = async (
  redis: LockRedisClient,
  lock: AcquiredLock,
): Promise<boolean> => {
  const result = await redis.eval(RELEASE_LUA, 1, lock.key, lock.token);
  return result === 1;
};

/**
 * Run `fn` while holding the lock. If contention prevents acquisition the
 * call is a silent no-op (returns `false`). Errors inside `fn` propagate
 * **after** the lock is released.
 */
export const runLocked = async <T>(
  redis: LockRedisClient,
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> => {
  const lock = await acquire(redis, name, ttlMs);
  if (!lock) return { ran: false };
  try {
    const result = await fn();
    return { ran: true, result };
  } finally {
    try {
      await release(redis, lock);
    } catch {
      // Swallow — the TTL will reap the lock if release fails.
    }
  }
};
