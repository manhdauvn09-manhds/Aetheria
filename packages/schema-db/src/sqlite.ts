// Aetheria — per-user SQLite client factory.
//
// One DB file per player. The api opens (and caches) a client per userId,
// so a single Node process can hold many concurrent users without rebuilding
// Prisma's heavy internals on each request.
//
// Usage (server, e.g. apps/api):
//   import { sqliteFor, closeSqliteFor } from "@aetheria/schema-db/sqlite";
//   const db = await sqliteFor(userId);          // opens / reuses
//   await db.saveState.upsert({ ... });
//   await closeSqliteFor(userId);                // on logout

import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";

import type { UserId } from "@aetheria/shared-types";
import { PrismaClient } from "./generated/sqlite/index.js";

export type SqliteClient = PrismaClient;
export { PrismaClient as SqlitePrismaClient } from "./generated/sqlite/index.js";
export * as SqlitePrisma from "./generated/sqlite/index.js";

/**
 * Resolve, normalise, and freeze the per-user SQLite root **once at module
 * load**. A later mutation of `process.env.AETHERIA_SQLITE_DIR` (or any
 * post-boot tampering) cannot redirect future writes — once we cache the
 * absolute root we never re-read the env. This closes the path-injection
 * surface flagged by the audit (item #10).
 */
const resolveBaseDir = (): string => {
  const raw = process.env.AETHERIA_SQLITE_DIR ?? resolve(process.cwd(), ".dev/sqlite");
  const abs = isAbsolute(raw) ? resolve(raw) : resolve(process.cwd(), raw);
  // Defence-in-depth: reject suspicious roots that look like system paths
  // even if env is somehow tampered with at boot time.
  const banned = ["/", "/etc", "/var", "/usr", "/bin", "/root", "C:\\", "C:\\Windows"];
  if (banned.includes(abs)) {
    throw new Error(`AETHERIA_SQLITE_DIR refuses unsafe root: ${abs}`);
  }
  return abs;
};

const BASE_DIR = resolveBaseDir();

/** Resolve the on-disk file path for a given user. */
export const sqlitePathFor = (userId: UserId | bigint | string): string => {
  const safeId = String(userId).replace(/[^0-9A-Za-z_-]/g, "");
  if (safeId.length === 0) throw new Error("sqlitePathFor: invalid userId");
  const candidate = resolve(BASE_DIR, `player_${safeId}.db`);
  // Re-prove the resolved path stays under the frozen root. Belt + braces
  // against a future change to safeId's allowed charset.
  const root = BASE_DIR.endsWith(sep) ? BASE_DIR : BASE_DIR + sep;
  if (!candidate.startsWith(root)) {
    throw new Error(`sqlitePathFor: refused path-traversal candidate: ${candidate}`);
  }
  return candidate;
};

/**
 * LRU cache for per-user PrismaClient handles. Without a cap the Map grows
 * unboundedly: every active player keeps an open file descriptor + Prisma's
 * heavy internals. The eviction path also runs `wal_checkpoint(TRUNCATE)`
 * before disconnect so the WAL sidecar file doesn't grow forever (audit
 * findings #2 + #6).
 *
 * Default sizing:
 *   - Fly shared-cpu 512MB: 48–64 (~300–400 MB RAM + ~150–200 fds)
 *   - VPS 2GB: 96–128 (600–1000 MB RAM + 300–400 fds)
 *   - VPS 4GB+: 200–256 (1.5–3 GB RAM + 600–768 fds)
 *
 * Typical production target for Fly: 96 clients (low contention, good cache hit).
 * Set AETHERIA_SQLITE_MAX_CLIENTS env var to override.
 */
const MAX_CACHED_CLIENTS = Number(
  process.env["AETHERIA_SQLITE_MAX_CLIENTS"] ?? "96",
);

interface CachedClient {
  readonly client: PrismaClient;
  lastUsed: number;
}

const cache = new Map<string, CachedClient>();

// Track eviction events for capacity planning alerts.
let evictionCount = 0;
let lastEvictionWarningAt = 0;

// Log effective cache cap on module load.
if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
  console.log(`[sqlite] per-user client LRU cache cap: ${MAX_CACHED_CLIENTS} (env AETHERIA_SQLITE_MAX_CLIENTS)`);
}

const touch = (path: string, entry: CachedClient): void => {
  entry.lastUsed = Date.now();
  // Re-insert to move to the end of the Map iteration order (LRU tail).
  cache.delete(path);
  cache.set(path, entry);
};

/** Best-effort WAL truncate. Safe to call before disconnect. */
const checkpointWal = async (client: PrismaClient): Promise<void> => {
  try {
    await client.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // Non-WAL journal mode (or corrupt file) — checkpoint is advisory.
  }
};

const closeOne = async (path: string): Promise<void> => {
  const entry = cache.get(path);
  if (!entry) return;
  cache.delete(path);
  await checkpointWal(entry.client);
  await entry.client.$disconnect();
};

/** Evict the least-recently-used entry until cache fits the cap. */
const evictIfFull = async (): Promise<void> => {
  while (cache.size >= MAX_CACHED_CLIENTS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) return;
    evictionCount++;
    // Warn once per minute if evictions are happening frequently — ops
    // should increase AETHERIA_SQLITE_MAX_CLIENTS or reduce load.
    const now = Date.now();
    if (evictionCount % 10 === 0 && now - lastEvictionWarningAt > 60_000) {
      lastEvictionWarningAt = now;
      console.warn(
        `[sqlite] cache evictions in flight: ${evictionCount} total. ` +
        `If frequent, increase AETHERIA_SQLITE_MAX_CLIENTS (currently ${MAX_CACHED_CLIENTS})`
      );
    }
    await closeOne(oldestKey);
  }
};

const buildClient = (filePath: string): PrismaClient => {
  mkdirSync(dirname(filePath), { recursive: true });
  return new PrismaClient({
    datasources: { db: { url: `file:${filePath}` } },
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });
};

const openCached = async (path: string): Promise<PrismaClient> => {
  const existing = cache.get(path);
  if (existing) {
    touch(path, existing);
    return existing.client;
  }
  await evictIfFull();
  const client = buildClient(path);
  await client.$connect();
  cache.set(path, { client, lastUsed: Date.now() });
  return client;
};

/** Open (or reuse) the SQLite client for a given user. */
export const sqliteFor = async (userId: UserId | bigint | string): Promise<PrismaClient> =>
  openCached(sqlitePathFor(userId));

/** Open against an arbitrary file path (tests, admin tools). */
export const openSqliteAt = async (filePath: string): Promise<PrismaClient> => {
  const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  return openCached(abs);
};

export const closeSqliteFor = async (userId: UserId | bigint | string): Promise<void> => {
  await closeOne(sqlitePathFor(userId));
};

export const closeAllSqlite = async (): Promise<void> => {
  const paths = Array.from(cache.keys());
  await Promise.all(paths.map((p) => closeOne(p)));
};

// Best-effort drain on natural process exit (tests / scripts). Idempotent.
process.once("beforeExit", () => {
  void closeAllSqlite().catch(() => undefined);
});
