// Aetheria — wire up the AuthService at boot.
//
// Resolves several pluggable dependencies:
//   - refresh-token store : Redis (if REDIS_URL) else in-memory
//   - one-shot token store: same — used by password-reset + email-verify
//   - mailer              : Resend (if RESEND_API_KEY) else console
//   - oauth config        : per-provider (CLIENT_ID toggles availability)

import { Redis } from "ioredis";

import { mysql } from "@aetheria/schema-db/mysql";
import {
  AuthService,
  consoleMailer,
  defaultTokenTtl,
  inMemoryOneShotStore,
  inMemoryRefreshStore,
  redisOneShotStore,
  redisRefreshStore,
  resendMailer,
  type AccountRateLimiter,
  type Mailer,
  type OAuthConfig,
  type OneShotTokenStore,
  type RefreshTokenStore,
  type TokenConfig,
} from "@aetheria/domain-auth";

import type { Env } from "../env.js";

export interface AuthBundle {
  readonly service: AuthService;
  /**
   * Redis client the bundle created and is responsible for closing. `null`
   * when (a) Redis is disabled, or (b) the caller passed in a shared client
   * — in case (b) the caller owns shutdown, we only borrowed the handle.
   */
  readonly ownedRedis: Redis | null;
  /** Read-only view of the redis client used (owned or shared). */
  readonly redis: Redis | null;
  /** Exposed so other domains (account.deleteAccount) can revoke sessions. */
  readonly refreshStore: RefreshTokenStore;
}

export const buildAuth = (env: Env, sharedRedis?: Redis | null): AuthBundle => {
  const tokenConfig: TokenConfig = {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTtlSeconds: defaultTokenTtl.accessTtlSeconds,
    refreshTtlSeconds: defaultTokenTtl.refreshTtlSeconds,
  };

  let ownedRedis: Redis | null = null;
  let redis: Redis | null = null;
  let refreshStore: RefreshTokenStore;
  let oneShotStore: OneShotTokenStore;
  if (sharedRedis) {
    redis = sharedRedis;
    refreshStore = redisRefreshStore(sharedRedis);
    oneShotStore = redisOneShotStore(sharedRedis);
  } else if (env.REDIS_URL) {
    const r = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    ownedRedis = r;
    redis = r;
    refreshStore = redisRefreshStore(r);
    oneShotStore = redisOneShotStore(r);
  } else {
    refreshStore = inMemoryRefreshStore();
    oneShotStore = inMemoryOneShotStore();
  }

  const mailer: Mailer = env.RESEND_API_KEY
    ? resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
    : consoleMailer();

  const oauth: OAuthConfig = {
    ...(env.GOOGLE_CLIENT_ID ? { google: { clientId: env.GOOGLE_CLIENT_ID } } : {}),
    ...(env.DISCORD_CLIENT_ID ? { discord: {} } : {}),
  };

  // Per-account brute-force limiter — 8 attempts / 15 min per (scope, email).
  // Cluster-safe via Redis, single-process fallback otherwise. Defeats the
  // credential-stuffing botnet pattern that rotates IPs against one target.
  const accountRateLimiter: AccountRateLimiter = redis
    ? redisAccountLimiter(redis, { maxAttempts: 8, windowMs: 15 * 60_000 })
    : inMemoryAccountLimiter({ maxAttempts: 8, windowMs: 15 * 60_000 });

  const service = new AuthService({
    mysql,
    refreshStore,
    oneShotStore,
    mailer,
    tokenConfig,
    oauth,
    accountRateLimiter,
    passwordReset: { redirectUrl: env.PASSWORD_RESET_URL },
    emailVerification: { redirectUrl: env.EMAIL_VERIFICATION_URL },
  });

  return { service, ownedRedis, redis, refreshStore };
};

// ── Per-account rate limiter implementations ─────────────────────────
//
// Distinct from the global per-IP fastify bucket in plugins.ts — that one
// caps *all* auth traffic from a single source IP, but a botnet renting
// thousands of IPs can still hit one email N times. This limiter is keyed
// by `sha256(email)` so the attacker can't rotate around it without
// changing their target.

interface AccountLimiterCfg {
  readonly maxAttempts: number;
  readonly windowMs: number;
}

const redisAccountLimiter = (
  redis: Redis,
  cfg: AccountLimiterCfg,
): AccountRateLimiter => ({
  async check(accountKey) {
    const k = `aetheria:rl:acct:${accountKey}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.pexpire(k, cfg.windowMs);
    if (count > cfg.maxAttempts) {
      const ttl = await redis.pttl(k);
      return { ok: false, retryS: Math.max(1, Math.ceil(ttl / 1000)) };
    }
    return { ok: true };
  },
});

const inMemoryAccountLimiter = (cfg: AccountLimiterCfg): AccountRateLimiter => {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async check(accountKey) {
      const now = Date.now();
      const b = buckets.get(accountKey);
      if (!b || b.resetAt <= now) {
        buckets.set(accountKey, { count: 1, resetAt: now + cfg.windowMs });
        return { ok: true };
      }
      if (b.count >= cfg.maxAttempts) {
        return { ok: false, retryS: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
      }
      b.count++;
      return { ok: true };
    },
  };
};
