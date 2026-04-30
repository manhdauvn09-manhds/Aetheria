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
import { dirname, isAbsolute, resolve } from "node:path";

import type { UserId } from "@aetheria/shared-types";
import { PrismaClient } from "./generated/sqlite/index.js";

export type SqliteClient = PrismaClient;
export { PrismaClient as SqlitePrismaClient } from "./generated/sqlite/index.js";
export * as SqlitePrisma from "./generated/sqlite/index.js";

const DEFAULT_DIR =
  process.env.AETHERIA_SQLITE_DIR ?? resolve(process.cwd(), ".dev/sqlite");

/** Resolve the on-disk file path for a given user. */
export const sqlitePathFor = (userId: UserId | bigint | string): string => {
  const safeId = String(userId).replace(/[^0-9A-Za-z_-]/g, "");
  if (safeId.length === 0) throw new Error("sqlitePathFor: invalid userId");
  const base = isAbsolute(DEFAULT_DIR) ? DEFAULT_DIR : resolve(process.cwd(), DEFAULT_DIR);
  return `${base}/player_${safeId}.db`;
};

const cache = new Map<string, PrismaClient>();

const buildClient = (filePath: string): PrismaClient => {
  mkdirSync(dirname(filePath), { recursive: true });
  return new PrismaClient({
    datasources: { db: { url: `file:${filePath}` } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
};

/** Open (or reuse) the SQLite client for a given user. */
export const sqliteFor = async (userId: UserId | bigint | string): Promise<PrismaClient> => {
  const filePath = sqlitePathFor(userId);
  let client = cache.get(filePath);
  if (!client) {
    client = buildClient(filePath);
    cache.set(filePath, client);
    await client.$connect();
  }
  return client;
};

/** Open against an arbitrary file path (tests, admin tools). */
export const openSqliteAt = async (filePath: string): Promise<PrismaClient> => {
  const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  let client = cache.get(abs);
  if (!client) {
    client = buildClient(abs);
    cache.set(abs, client);
    await client.$connect();
  }
  return client;
};

export const closeSqliteFor = async (userId: UserId | bigint | string): Promise<void> => {
  const filePath = sqlitePathFor(userId);
  const client = cache.get(filePath);
  if (!client) return;
  cache.delete(filePath);
  await client.$disconnect();
};

export const closeAllSqlite = async (): Promise<void> => {
  const clients = Array.from(cache.values());
  cache.clear();
  await Promise.all(clients.map((c) => c.$disconnect()));
};
