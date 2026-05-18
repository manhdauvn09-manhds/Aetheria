// Aetheria — one-shot token store.
//
// Used by password-reset + email-verification flows. The shape is the
// same for both: a random opaque string maps to a small JSON record
// `{userId, purpose, expiresAt, ...}`. Tokens are single-use — `take`
// returns the record AND deletes it atomically.
//
// Two impls:
//   - inMemoryOneShotStore() — Map-backed; restarts wipe state.
//   - redisOneShotStore(redis) — keys `oneshot:{purpose}:{token}` with TTL.

import { randomBytes } from "node:crypto";

import type { Redis } from "ioredis";

export type OneShotPurpose = "password_reset" | "email_verification";

export interface OneShotRecord {
  readonly userId: bigint;
  readonly purpose: OneShotPurpose;
  readonly expiresAt: number; // epoch ms
  /** Optional payload — currently unused; reserved for things like
   *  the email being verified, when it differs from `users.email`. */
  readonly meta?: Readonly<Record<string, string>>;
}

export interface OneShotTokenStore {
  put(token: string, record: OneShotRecord): Promise<void>;
  /** Look up + delete in one shot. Returns null on miss/expired. */
  take(purpose: OneShotPurpose, token: string): Promise<OneShotRecord | null>;
  /**
   * Invalidate every outstanding token for a (userId, purpose) pair.
   * Called by AuthService before minting a new reset/verification token
   * so that requesting a fresh token implicitly retires the old one
   * (closes the "two valid tokens at once" replay window).
   */
  revokeForUser(purpose: OneShotPurpose, userId: bigint): Promise<void>;
}

/** Generate a URL-safe random token. 32 bytes ≈ 256 bits of entropy. */
export const generateOneShotToken = (): string =>
  randomBytes(32)
    .toString("base64url")
    // Belt-and-braces: base64url should already be URL-safe, but trim any
    // padding that some encoders leave behind.
    .replace(/=+$/, "");

const keyOf = (purpose: OneShotPurpose, token: string): string =>
  `oneshot:${purpose}:${token}`;

// Index key for "what tokens belong to this user+purpose right now".
// Lets us implement revokeForUser without scanning every token.
const userIndexKey = (purpose: OneShotPurpose, userId: bigint): string =>
  `oneshot:user:${purpose}:${userId.toString()}`;

// ── In-memory ────────────────────────────────────────────────────────

export const inMemoryOneShotStore = (): OneShotTokenStore => {
  const map = new Map<string, OneShotRecord>();
  // userIndex: userIndexKey(purpose, userId) → Set<token-key>
  const userIndex = new Map<string, Set<string>>();
  return {
    put(token, record) {
      const k = keyOf(record.purpose, token);
      map.set(k, record);
      const idx = userIndexKey(record.purpose, record.userId);
      let bucket = userIndex.get(idx);
      if (!bucket) {
        bucket = new Set<string>();
        userIndex.set(idx, bucket);
      }
      bucket.add(k);
      return Promise.resolve();
    },
    take(purpose, token) {
      const k = keyOf(purpose, token);
      const rec = map.get(k);
      if (!rec) return Promise.resolve(null);
      map.delete(k);
      const idx = userIndexKey(rec.purpose, rec.userId);
      userIndex.get(idx)?.delete(k);
      if (rec.expiresAt <= Date.now()) return Promise.resolve(null);
      return Promise.resolve(rec);
    },
    revokeForUser(purpose, userId) {
      const idx = userIndexKey(purpose, userId);
      const bucket = userIndex.get(idx);
      if (!bucket) return Promise.resolve();
      for (const k of bucket) map.delete(k);
      userIndex.delete(idx);
      return Promise.resolve();
    },
  };
};

// ── Redis ────────────────────────────────────────────────────────────

export const redisOneShotStore = (redis: Redis): OneShotTokenStore => {
  return {
    async put(token, record) {
      const ttlSec = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000));
      const tokenKey = keyOf(record.purpose, token);
      const idxKey = userIndexKey(record.purpose, record.userId);
      // Pipeline: store the token + add to user-index set with same TTL.
      // The index lets revokeForUser invalidate every outstanding token
      // for this user+purpose in O(N) without scanning all keys.
      await redis
        .multi()
        .set(
          tokenKey,
          JSON.stringify({
            userId: record.userId.toString(),
            purpose: record.purpose,
            expiresAt: record.expiresAt,
            meta: record.meta ?? {},
          }),
          "EX",
          ttlSec,
        )
        .sadd(idxKey, tokenKey)
        .expire(idxKey, ttlSec)
        .exec();
    },
    async take(purpose, token) {
      const k = keyOf(purpose, token);
      // GETDEL is the atomic primitive for "fetch then delete".
      const raw = await redis.getdel(k);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as {
          userId: string;
          purpose: OneShotPurpose;
          expiresAt: number;
          meta?: Record<string, string>;
        };
        // Best-effort prune from the user-index set (token was already
        // single-use consumed; cleaning the index is cosmetic).
        await redis.srem(userIndexKey(parsed.purpose, BigInt(parsed.userId)), k);
        if (parsed.expiresAt <= Date.now()) return null;
        return {
          userId: BigInt(parsed.userId),
          purpose: parsed.purpose,
          expiresAt: parsed.expiresAt,
          ...(parsed.meta ? { meta: parsed.meta } : {}),
        };
      } catch {
        return null;
      }
    },
    async revokeForUser(purpose, userId) {
      const idxKey = userIndexKey(purpose, userId);
      const tokenKeys = await redis.smembers(idxKey);
      if (tokenKeys.length === 0) return;
      const pipeline = redis.multi();
      for (const k of tokenKeys) pipeline.del(k);
      pipeline.del(idxKey);
      await pipeline.exec();
    },
  };
};
