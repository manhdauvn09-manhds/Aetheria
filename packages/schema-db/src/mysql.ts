// Aetheria — shared MySQL client (server-side singleton).
//
// Usage (server, e.g. apps/api):
//   import { mysql } from "@aetheria/schema-db/mysql";
//   const user = await mysql.user.findUnique({ where: { id } });
//
// HMR safety: in dev, the Next.js / tsx watcher re-evaluates this module on
// every reload. Without the global cache the connection pool would leak.

import { PrismaClient } from "./generated/mysql/index.js";

export type MysqlClient = PrismaClient;
export { PrismaClient as MysqlPrismaClient } from "./generated/mysql/index.js";
export * as MysqlPrisma from "./generated/mysql/index.js";

const buildClient = (): PrismaClient =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

declare global {
  var __aetheriaMysql: PrismaClient | undefined;
}

export const mysql: PrismaClient =
  globalThis.__aetheriaMysql ?? (globalThis.__aetheriaMysql = buildClient());

if (process.env.NODE_ENV !== "production") {
  globalThis.__aetheriaMysql = mysql;
}

export const disconnectMysql = async (): Promise<void> => {
  await mysql.$disconnect();
  globalThis.__aetheriaMysql = undefined;
};
