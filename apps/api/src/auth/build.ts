// Aetheria — wire up the AuthService at boot.
//
// Resolves the refresh-token store: Redis if `REDIS_URL` is set, otherwise
// in-memory (dev / test only — single-process, restarts wipe sessions).

import { Redis } from "ioredis";

import { mysql } from "@aetheria/schema-db/mysql";
import {
  AuthService,
  defaultTokenTtl,
  inMemoryRefreshStore,
  redisRefreshStore,
  type OAuthConfig,
  type TokenConfig,
  type RefreshTokenStore,
} from "@aetheria/domain-auth";

import type { Env } from "../env.js";

export interface AuthBundle {
  readonly service: AuthService;
  readonly redis: Redis | null;
}

export const buildAuth = (env: Env): AuthBundle => {
  const tokenConfig: TokenConfig = {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTtlSeconds: defaultTokenTtl.accessTtlSeconds,
    refreshTtlSeconds: defaultTokenTtl.refreshTtlSeconds,
  };

  let redis: Redis | null = null;
  let store: RefreshTokenStore;
  if (env.REDIS_URL) {
    const r = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    redis = r;
    store = redisRefreshStore(r);
  } else {
    store = inMemoryRefreshStore();
  }

  const oauth: OAuthConfig = {
    ...(env.GOOGLE_CLIENT_ID ? { google: { clientId: env.GOOGLE_CLIENT_ID } } : {}),
    ...(env.DISCORD_CLIENT_ID ? { discord: {} } : {}),
  };

  const service = new AuthService({
    mysql,
    refreshStore: store,
    tokenConfig,
    oauth,
  });

  return { service, redis };
};
