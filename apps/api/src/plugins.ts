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

  // Strict per-IP throttle on auth-sensitive procedures (B1, B4 in AUDIT.md).
  // Brute-force protection above the global limit. In-memory bucket is
  // sufficient single-instance; swap to Redis when scaling out.
  const AUTH_PROCS = [
    "auth.login",
    "auth.signup",
    "auth.refreshToken",
    "auth.requestPasswordReset",
    "auth.confirmPasswordReset",
    "auth.requestEmailVerification",
  ];
  const AUTH_MAX    = 10;       // 10 attempts per window
  const AUTH_WINDOW = 60_000;   // 1 min
  const buckets = new Map<string, { count: number; resetAt: number }>();
  app.addHook("onRequest", (req, reply, done) => {
    const url = req.url;
    const matched = AUTH_PROCS.some((p) => url.includes(p));
    if (!matched) return done();
    const key = `auth:${req.ip}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + AUTH_WINDOW });
      return done();
    }
    if (b.count >= AUTH_MAX) {
      const retryS = Math.ceil((b.resetAt - now) / 1000);
      reply.code(429).send({
        error: { code: "RATE_LIMITED", message: `Too many auth attempts. Retry in ${String(retryS)}s.` },
      });
      return;
    }
    b.count++;
    done();
  });
};
