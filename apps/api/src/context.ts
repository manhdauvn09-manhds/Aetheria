// Aetheria — Fastify-backed tRPC context factory.
//
// Returns @aetheria/schema-api's BaseContext: { request, auth | null }.
// Auth is null for missing/invalid tokens — protectedProcedure rejects
// unauthenticated calls in the tRPC layer, not here. This keeps health
// endpoints reachable for monitoring even without a token.

import type { FastifyRequest } from "fastify";

import type { BaseContext } from "@aetheria/schema-api";

import type { Env } from "./env.js";
import { extractBearer, verifyAccessToken } from "./auth/jwt.js";

export type ApiContext = BaseContext;

export const buildContextFactory = (env: Env) => {
  const jwtCfg = {
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  };

  return async (req: FastifyRequest): Promise<ApiContext> => {
    const token = extractBearer(req.headers.authorization);
    let auth: BaseContext["auth"] = null;
    if (token !== null) {
      try {
        const verified = await verifyAccessToken(token, jwtCfg);
        auth = { userId: verified.userId, roles: verified.roles };
      } catch {
        // Swallow: tRPC's protectedProcedure will reject if a procedure
        // requires auth. Public procedures still work.
        auth = null;
      }
    }
    return {
      request: {
        ip: req.ip,
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
        requestId: req.id,
      },
      auth,
    };
  };
};
