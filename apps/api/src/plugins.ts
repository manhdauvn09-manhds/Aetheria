// Aetheria — Fastify plugin registration (security + traffic shaping).

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

import type { Env } from "./env.js";

export const registerPlugins = async (app: FastifyInstance, env: Env): Promise<void> => {
  // Security headers (CSP relaxed by default — tighten when web origin is fixed).
  await app.register(
    helmet,
    env.NODE_ENV === "production" ? {} : { contentSecurityPolicy: false },
  );

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-request-id"],
    maxAge: 86_400,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Skip the public `/health` probe so monitors don't burn the budget.
    allowList: (req) => req.url === "/health",
    keyGenerator: (req) => {
      // Prefer authenticated user when present (Bearer token); else fall back to IP.
      const auth = req.headers.authorization;
      if (typeof auth === "string" && auth.startsWith("Bearer ")) return `tok:${auth.slice(7, 47)}`;
      return `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => ({
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Retry in ${Math.ceil(ctx.ttl / 1000)}s.`,
      },
    }),
  });
};
