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

// ── In-memory ────────────────────────────────────────────────────────

export const inMemoryOneShotStore = (): OneShotTokenStore => {
  const map = new Map<string, OneShotRecord>();
  return {
    put(token, record) {
      map.set(keyOf(record.purpose, token), record);
      return Promise.resolve();
    },
    take(purpose, token) {
      const k = keyOf(purpose, token);
      const rec = map.get(k);
      if (!rec) return Promise.resolve(null);
      map.delete(k);
      if (rec.expiresAt <= Date.now()) return Promise.resolve(null);
      return Promise.resolve(rec);
    },
  };
};

// ── Redis ────────────────────────────────────────────────────────────

export const redisOneShotStore = (redis: Redis): OneShotTokenStore => {
  return {
    async put(token, record) {
      const ttlSec = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000));
      await redis.set(
        keyOf(record.purpose, token),
        JSON.stringify({
          userId: record.userId.toString(),
          purpose: record.purpose,
          expiresAt: record.expiresAt,
          meta: record.meta ?? {},
        }),
        "EX",
        ttlSec,
      );
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
  };
};
