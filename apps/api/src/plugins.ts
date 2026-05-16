// Aetheria — Fastify plugin registration (security + traffic shaping).

import { createHash } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

import { CF_CONNECTING_IP_HEADER } from "@aetheria/core";

import type { Env } from "./env.js";

// Hash the bearer token so two distinct tokens with overlapping prefixes
// never share a rate-limit bucket. Take 16 hex chars (64 bits) — collision-
// safe for the bucket-key search space.
const tokenBucketKey = (auth: string): string => {
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return `tok:${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
};

const buildRateLimitKey = (req: { headers: Record<string, unknown>; ip: string }): string => {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return tokenBucketKey(auth);
  return `ip:${req.ip}`;
};

const AUTH_PROCS = [
  "auth.login",
  "auth.signup",
  "auth.refreshToken",
  "auth.requestPasswordReset",
  "auth.confirmPasswordReset",
  "auth.requestEmailVerification",
] as const;

const AUTH_MAX = 10;       // 10 attempts per window
const AUTH_WINDOW_MS = 60_000;

const isAuthRoute = (url: string): boolean => AUTH_PROCS.some((p) => url.includes(p));

// Production CSP for a JSON-only API. helmet's defaults assume an HTML
// origin; we tighten because every legitimate response is `application/json`.
const apiCspDirectives = {
  "default-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
} as const;

export interface PluginDeps {
  /** When set, the strict auth-route bucket is backed by Redis (cluster-safe). */
  readonly redis?: Redis | null;
}

export const registerPlugins = async (
  app: FastifyInstance,
  env: Env,
  deps: PluginDeps = {},
): Promise<void> => {
  // Security headers. In prod we hand helmet a real CSP for the JSON API;
  // in dev we leave it relaxed so the Fastify error pages still render.
  await app.register(
    helmet,
    env.NODE_ENV === "production"
      ? {
          contentSecurityPolicy: {
            useDefaults: false,
            directives: apiCspDirectives,
          },
          crossOriginResourcePolicy: { policy: "same-site" },
          referrerPolicy: { policy: "no-referrer" },
        }
      : { contentSecurityPolicy: false },
  );

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // `x-aetheria-client` tags the caller (web / web-route / web-nextauth)
    // — set by every browser-side tRPC link in apps/web. Must be in the
    // preflight allow-list or Chrome blocks the actual request with
    // "Failed to fetch".
    allowedHeaders: [
      "content-type",
      "authorization",
      "x-request-id",
      "x-aetheria-client",
    ],
    maxAge: 86_400,
  });

  // Cloudflare-front-door enforcement (production by default).
  // 1. Forces traffic through CF — direct-to-origin attackers get 403.
  // 2. Replaces req.ip with `cf-connecting-ip` so per-IP rate-limit and
  //    per-IP audit fields reflect the real client, not a Cloudflare edge.
  if (env.ENFORCE_CLOUDFLARE) {
    app.addHook("onRequest", (req, reply, done) => {
      // Liveness probes hit /health directly from the platform — exempt.
      if (req.url === "/health") return done();
      const cfIp = req.headers[CF_CONNECTING_IP_HEADER];
      if (typeof cfIp !== "string" || cfIp.length === 0) {
        reply.code(403).send({
          error: { code: "CDN_REQUIRED", message: "Direct-to-origin traffic is not allowed." },
        });
        return;
      }
      // Override Fastify's derived ip so downstream rate-limit + audit log
      // record the real client, not a CF edge IP.
      Object.defineProperty(req, "ip", { value: cfIp, configurable: true });
      done();
    });
  }

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Skip the public `/health` probe so monitors don't burn the budget.
    allowList: (req) => req.url === "/health",
    keyGenerator: (req) => buildRateLimitKey(req),
    errorResponseBuilder: (_req, ctx) => ({
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Retry in ${Math.ceil(ctx.ttl / 1000)}s.`,
      },
    }),
  });

  // Strict per-IP throttle on auth-sensitive procedures (B1, B4 in AUDIT.md).
  // Brute-force protection above the global limit. Backed by Redis when
  // available so the limit holds across api instances; falls back to an
  // in-memory bucket for single-process dev.
  if (deps.redis) {
    const redis = deps.redis;
    app.addHook("onRequest", async (req, reply) => {
      if (!isAuthRoute(req.url)) return;
      const key = `aetheria:rl:auth:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, AUTH_WINDOW_MS);
      if (count > AUTH_MAX) {
        const ttl = await redis.pttl(key);
        const retryS = Math.ceil(Math.max(ttl, 0) / 1000);
        reply.code(429).send({
          error: {
            code: "RATE_LIMITED",
            message: `Too many auth attempts. Retry in ${String(retryS)}s.`,
          },
        });
      }
    });
  } else {
    const buckets = new Map<string, { count: number; resetAt: number }>();
    app.addHook("onRequest", (req, reply, done) => {
      if (!isAuthRoute(req.url)) return done();
      const key = `auth:${req.ip}`;
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
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
  }
};
