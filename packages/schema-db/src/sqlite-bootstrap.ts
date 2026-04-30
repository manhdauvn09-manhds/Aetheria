// Aetheria — per-user SQLite bootstrap.
//
// Applies the per-player schema to a fresh (or existing) SQLite file.
// All DDL uses `CREATE … IF NOT EXISTS`, so re-running is a no-op.
//
// Why we hand-roll a statement splitter instead of `prisma migrate deploy`:
// `prisma migrate` is a CLI tool — running it programmatically per user
// would fork a Node process per login. The schema is small and stable;
// reading it once and applying via `$executeRawUnsafe` is faster.
//
// The splitter is BEGIN/END-aware so trigger bodies (which contain inner
// `;`) survive intact. It also strips `--` line comments and respects
// single-quoted string literals (with `''` escapes).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { PrismaClient } from "./generated/sqlite/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve a path relative to the monorepo root. Walk up until `db/` is found. */
const monorepoFile = (relative: string): string => {
  let cur = HERE;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(cur, "db");
    try {
      // Probe by attempting to read; if it works we have the right root.
      readFileSync(resolve(candidate, "sqlite/01_init.sql"));
      return resolve(cur, relative);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  throw new Error(`Could not locate monorepo root containing db/ from ${HERE}`);
};

let cachedSql: { init: string; seed: string } | null = null;

const loadSqlOnce = (): { init: string; seed: string } => {
  if (cachedSql) return cachedSql;
  cachedSql = {
    init: readFileSync(monorepoFile("db/sqlite/01_init.sql"), "utf8"),
    seed: readFileSync(monorepoFile("db/sqlite/02_seed.sql"), "utf8"),
  };
  return cachedSql;
};

/**
 * Split a SQLite script into individual statements. Handles:
 *   - `--` line comments (stripped before splitting)
 *   - single-quoted strings, including `''` escapes
 *   - `BEGIN … END;` trigger blocks (don't split on inner `;`)
 */
export const splitSqliteStatements = (src: string): string[] => {
  const isWordChar = (c: string | undefined): boolean =>
    c !== undefined && /[A-Za-z0-9_]/.test(c);

  const matchKeyword = (s: string, i: number, word: string): boolean => {
    if (s.slice(i, i + word.length).toUpperCase() !== word) return false;
    if (isWordChar(s[i - 1])) return false;
    if (isWordChar(s[i + word.length])) return false;
    return true;
  };

  // 1) Strip line comments. We must respect string literals so we don't
  //    truncate `'foo -- bar'`.
  const stripped: string[] = [];
  for (const line of src.split("\n")) {
    let inStr = false;
    let cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inStr) {
        if (ch === "'") {
          if (line[i + 1] === "'") {
            i++;
            continue;
          }
          inStr = false;
        }
      } else if (ch === "'") {
        inStr = true;
      } else if (ch === "-" && line[i + 1] === "-") {
        cut = i;
        break;
      }
    }
    stripped.push(line.slice(0, cut));
  }
  const noComments = stripped.join("\n");

  // 2) Walk and split on top-level `;`.
  const stmts: string[] = [];
  let buf = "";
  let inStr = false;
  let depth = 0;

  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === undefined) break; // unreachable; guards noUncheckedIndexedAccess
    if (inStr) {
      buf += ch;
      if (ch === "'") {
        if (noComments[i + 1] === "'") {
          buf += "'";
          i++;
          continue;
        }
        inStr = false;
      }
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inStr = true;
      continue;
    }
    if (matchKeyword(noComments, i, "BEGIN")) {
      buf += noComments.slice(i, i + 5);
      i += 4;
      depth++;
      continue;
    }
    if (matchKeyword(noComments, i, "END")) {
      buf += noComments.slice(i, i + 3);
      i += 2;
      if (depth > 0) depth--;
      continue;
    }
    if (ch === ";" && depth === 0) {
      const stmt = buf.trim();
      if (stmt.length > 0) stmts.push(stmt);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail.length > 0) stmts.push(tail);
  return stmts;
};

/**
 * Apply the per-player schema + seed against an opened Prisma SQLite
 * client. Idempotent — safe to call on every login.
 */
export const applyInitSchema = async (db: PrismaClient): Promise<void> => {
  // PRAGMA statements are session-scoped on SQLite; re-set on every connect.
  // `journal_mode = WAL` returns the new mode as a row, so we have to
  // route it through $queryRawUnsafe — Prisma rejects $executeRawUnsafe
  // when the engine produces output.
  await db.$queryRawUnsafe("PRAGMA foreign_keys = ON");
  await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await db.$queryRawUnsafe("PRAGMA synchronous = NORMAL");

  const { init, seed } = loadSqlOnce();
  for (const stmt of splitSqliteStatements(init)) {
    if (stmt.toUpperCase().startsWith("PRAGMA")) continue; // already applied above
    await db.$executeRawUnsafe(stmt);
  }
  for (const stmt of splitSqliteStatements(seed)) {
    await db.$executeRawUnsafe(stmt);
  }
};
