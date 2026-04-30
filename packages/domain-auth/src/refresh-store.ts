// Aetheria — refresh-token store.
//
// Stores a server-side record per active refresh token (`jti`):
//   { userId, expiresAt }
// On `auth.refreshToken` we look the jti up; if it's missing or expired the
// token is rejected. On `auth.logout` we delete by jti. On password reset or
// suspicious activity, `revokeAllForUser` clears every jti for a user.
//
// Two implementations:
//   - inMemoryRefreshStore() — Map-backed; for tests & dev when no Redis.
//     Single-process only; restarts wipe state.
//   - redisRefreshStore(redis) — uses Redis keys
//       refresh:{jti}        -> userId           (TTL = expiresAt - now)
//       refresh:user:{uid}   -> SET<jti>          (so we can revoke en masse)

import type { Redis } from "ioredis";

export interface RefreshRecord {
  readonly userId: bigint;
  readonly expiresAt: number; // epoch ms
}

export interface RefreshTokenStore {
  put(jti: string, record: RefreshRecord): Promise<void>;
  get(jti: string): Promise<RefreshRecord | null>;
  revoke(jti: string): Promise<void>;
  revokeAllForUser(userId: bigint): Promise<void>;
}

// ── In-memory ────────────────────────────────────────────────────────

export const inMemoryRefreshStore = (): RefreshTokenStore => {
  const byJti = new Map<string, RefreshRecord>();
  const byUser = new Map<string, Set<string>>();

  const userKey = (userId: bigint): string => userId.toString();

  return {
    put(jti, record) {
      byJti.set(jti, record);
      const k = userKey(record.userId);
      let bucket = byUser.get(k);
      if (!bucket) {
        bucket = new Set();
        byUser.set(k, bucket);
      }
      bucket.add(jti);
      return Promise.resolve();
    },
    get(jti) {
      const rec = byJti.get(jti);
      if (!rec) return Promise.resolve(null);
      if (rec.expiresAt <= Date.now()) {
        byJti.delete(jti);
        byUser.get(userKey(rec.userId))?.delete(jti);
        return Promise.resolve(null);
      }
      return Promise.resolve(rec);
    },
    revoke(jti) {
      const rec = byJti.get(jti);
      if (!rec) return Promise.resolve();
      byJti.delete(jti);
      byUser.get(userKey(rec.userId))?.delete(jti);
      return Promise.resolve();
    },
    revokeAllForUser(userId) {
      const bucket = byUser.get(userKey(userId));
      if (!bucket) return Promise.resolve();
      for (const jti of bucket) byJti.delete(jti);
      byUser.delete(userKey(userId));
      return Promise.resolve();
    },
  };
};

// ── Redis ────────────────────────────────────────────────────────────

export const redisRefreshStore = (redis: Redis): RefreshTokenStore => {
  const jtiKey = (jti: string): string => `refresh:${jti}`;
  const userKey = (userId: bigint): string => `refresh:user:${userId.toString()}`;

  return {
    async put(jti, record) {
      const ttlSec = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000));
      const pipeline = redis.multi();
      pipeline.set(jtiKey(jti), record.userId.toString(), "EX", ttlSec);
      pipeline.sadd(userKey(record.userId), jti);
      pipeline.expire(userKey(record.userId), ttlSec);
      await pipeline.exec();
    },
    async get(jti) {
      const userIdStr = await redis.get(jtiKey(jti));
      if (userIdStr === null) return null;
      const ttl = await redis.pttl(jtiKey(jti));
      // Without a TTL Redis returns -1; treat that as "no record".
      if (ttl < 0) return null;
      return { userId: BigInt(userIdStr), expiresAt: Date.now() + ttl };
    },
    async revoke(jti) {
      const userIdStr = await redis.get(jtiKey(jti));
      if (userIdStr === null) return;
      await redis
        .multi()
        .del(jtiKey(jti))
        .srem(userKey(BigInt(userIdStr)), jti)
        .exec();
    },
    async revokeAllForUser(userId) {
      const k = userKey(userId);
      const jtis = await redis.smembers(k);
      if (jtis.length === 0) return;
      const pipeline = redis.multi();
      for (const j of jtis) pipeline.del(jtiKey(j));
      pipeline.del(k);
      await pipeline.exec();
    },
  };
};
