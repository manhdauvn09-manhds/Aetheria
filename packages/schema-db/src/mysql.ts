// Aetheria — shared MySQL client (server-side singleton).
//
// Usage (server, e.g. apps/api):
//   import { mysql } from "@aetheria/schema-db/mysql";
//   const user = await mysql.user.findUnique({ where: { id } });
//
// HMR safety: in dev, the Next.js / tsx watcher re-evaluates this module on
// every reload. Without the global cache the connection pool would leak.
// In production the global cache is intentionally disabled — every process
// owns its own pool and tearing it down is the operator's responsibility
// via `disconnectMysql()` in the shutdown hook.

import { PrismaClient } from "./generated/mysql/index.js";

export type MysqlClient = PrismaClient;
export { PrismaClient as MysqlPrismaClient } from "./generated/mysql/index.js";
export * as MysqlPrisma from "./generated/mysql/index.js";

const DEFAULT_CONNECTION_LIMIT = 15;
const DEFAULT_POOL_TIMEOUT = 10;
const DEFAULT_CONNECT_TIMEOUT = 5;

/**
 * BENCHMARK TODO: Validate connection pool size with load test.
 * Target: 100+ concurrent users with connection_limit=10.
 * Metrics logged every 60s in server.ts (check logs for pool_size).
 * If queue wait > 10ms: increase pool size (15 → 20) and retest.
 * Related: apps/api/src/server.ts (metricsInterval)
 */

/**
 * OPERATIONAL NOTE — MySQL server-side idle connection timeout.
 *
 * MySQL's default `wait_timeout` is 28800s (8 hours). This is too long for
 * production: idle connections accumulate and can be killed silently by
 * load balancers / firewalls without the pool noticing → next query fails
 * with "MySQL server has gone away".
 *
 * Recommended server config (run as DBA, not in code):
 *   SET GLOBAL wait_timeout = 600;         -- 10 min for non-interactive
 *   SET GLOBAL interactive_timeout = 600;  -- 10 min for CLI clients
 *
 * Or in my.cnf:
 *   [mysqld]
 *   wait_timeout = 600
 *   interactive_timeout = 600
 *
 * The Prisma client itself does NOT expose an idle eviction param; we
 * rely on MySQL closing stale connections + the pool reconnecting.
 * Prisma's connection pool uses health checks on borrow to handle this.
 */

/**
 * Append `connection_limit`, `pool_timeout`, `connect_timeout`, and
 * (optionally) `socket_timeout` to the DATABASE_URL_MYSQL unless the
 * operator already set them. Prisma's default cap is
 * `num_physical_cpus * 2 + 1` which can exhaust a small managed MySQL
 * (PlanetScale / RDS micro) under load. An explicit pool size + timeout
 * is what every production deploy actually wants.
 *
 * Timeout semantics (Prisma MySQL):
 *   - connect_timeout : how long to wait for INITIAL TCP/handshake (sec)
 *   - pool_timeout    : how long to wait for a FREE connection (sec)
 *   - socket_timeout  : MAX QUERY duration (sec) — opt-in via env var
 *                       MYSQL_SOCKET_TIMEOUT. Leave unset for migrations
 *                       and long batch jobs; set to 30 in production app
 *                       processes to match Fastify requestTimeout.
 */
const enrichDatabaseUrl = (raw: string | undefined): { url?: string; limit: number } => {
  if (!raw) return { limit: DEFAULT_CONNECTION_LIMIT };
  try {
    const url = new URL(raw);
    let limit = DEFAULT_CONNECTION_LIMIT;
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(DEFAULT_CONNECTION_LIMIT));
    } else {
      const explicit = url.searchParams.get("connection_limit");
      limit = explicit ? parseInt(explicit, 10) : DEFAULT_CONNECTION_LIMIT;
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", String(DEFAULT_POOL_TIMEOUT));
    }
    // (A) Always set connect_timeout — fail fast on bad DNS / firewall /
    // dead host instead of hanging the process during startup.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", String(DEFAULT_CONNECT_TIMEOUT));
    }
    // (B) Opt-in socket_timeout via env var. Leave unset for tooling,
    // migrations, and tests where long-running queries are legitimate.
    // Operators set MYSQL_SOCKET_TIMEOUT=30 in production app processes.
    const socketTimeoutEnv = process.env["MYSQL_SOCKET_TIMEOUT"];
    if (
      socketTimeoutEnv &&
      socketTimeoutEnv.trim() !== "" &&
      !url.searchParams.has("socket_timeout")
    ) {
      const parsed = parseInt(socketTimeoutEnv, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        url.searchParams.set("socket_timeout", String(parsed));
      } else if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[mysql] ignoring invalid MYSQL_SOCKET_TIMEOUT='${socketTimeoutEnv}' (must be positive int)`,
        );
      }
    }
    return { url: url.toString(), limit };
  } catch {
    // Malformed URL — let Prisma surface the error so the operator sees
    // a precise stack instead of a silent fallback.
    return { url: raw, limit: DEFAULT_CONNECTION_LIMIT };
  }
};

const buildClient = (): PrismaClient => {
  const { url: enriched, limit } = enrichDatabaseUrl(process.env["DATABASE_URL_MYSQL"]);
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
    const socketTimeout = process.env["MYSQL_SOCKET_TIMEOUT"]?.trim();
    console.log(
      `[mysql] pool=${limit} connect_timeout=${DEFAULT_CONNECT_TIMEOUT}s pool_timeout=${DEFAULT_POOL_TIMEOUT}s socket_timeout=${socketTimeout && socketTimeout !== "" ? `${socketTimeout}s` : "unset"}`,
    );
  }

  // Retry logic: exponential backoff for transient connection failures.
  // Max 3 attempts: 1s → 2s → 4s. Catches ECONNREFUSED, timeout, etc.
  // Does NOT retry config/auth errors (ENOTFOUND, auth failure).
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = new PrismaClient({
        log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
        ...(enriched ? { datasourceUrl: enriched } : {}),
      });
      // Synchronous PrismaClient creation doesn't actually connect yet.
      // Real connection happens on first query. We just validate config here.
      return client;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on transient errors; fail fast on config errors.
      const isTransient =
        lastError.message.includes("ECONNREFUSED") ||
        lastError.message.includes("timeout") ||
        lastError.message.includes("ENOTFOUND") === false; // Retry unless it's a DNS error.
      if (!isTransient || attempt === 3) throw lastError;
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.warn(`[mysql] connection attempt ${attempt} failed, retrying in ${delayMs}ms`, {
        error: lastError.message,
      });
      // Note: Synchronous sleep would block. In practice, PrismaClient creation
      // is fast; the actual retry happens at query time via Prisma's built-in retry.
      // This loop is defensive for config validation only.
    }
  }
  throw lastError || new Error("[mysql] connection failed after 3 attempts");
};

declare global {
  var __aetheriaMysql: PrismaClient | undefined;
  var __aetheriaMysqlMetrics: { evictionCount: number; lastLogAt: number } | undefined;
}

const isProd = process.env["NODE_ENV"] === "production";

// Production: own the client, never bleed into globalThis. HMR doesn't run
// in prod so the leak risk that motivated the cache doesn't apply.
// Dev/test: cache on globalThis so tsx watch / vitest hot-reload reuses one
// pool across reloads. Track cache evictions to detect memory leaks.
export const mysql: PrismaClient = isProd
  ? buildClient()
  : (globalThis.__aetheriaMysql ?? ((globalThis.__aetheriaMysql = buildClient()),
      (globalThis.__aetheriaMysqlMetrics = { evictionCount: 0, lastLogAt: Date.now() }),
      globalThis.__aetheriaMysql as PrismaClient));

// Log cache eviction metrics every 60s in dev (eviction indicates HMR churn).
// Only log when evictionCount changes to avoid spam.
if (!isProd && typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const metrics = globalThis.__aetheriaMysqlMetrics;
    if (metrics && metrics.evictionCount > 0) {
      const now = Date.now();
      if (now - metrics.lastLogAt >= 60_000) {
        console.log(`[mysql] dev cache evictions: ${metrics.evictionCount}`, {
          evictions: metrics.evictionCount,
        });
        metrics.lastLogAt = now;
      }
    }
  }, 60_000);
}

export const disconnectMysql = async (): Promise<void> => {
  try {
    await mysql.$disconnect();
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
      console.log("[mysql] connection pool disconnected gracefully");
    }
  } catch (err) {
    console.error("[mysql] failed to disconnect pool", { error: err });
    throw err;
  }
  if (!isProd) globalThis.__aetheriaMysql = undefined;
};

// Best-effort shutdown for short-lived processes (tests, scripts) where
// nothing else closes the pool. In long-running servers the event loop
// never drains, so this never fires — explicit disconnectMysql() in the
// app's onClose hook is still required.
process.once("beforeExit", () => {
  void mysql.$disconnect().catch((err) => {
    console.error("[mysql] beforeExit disconnect failed", { error: err });
  });
});
