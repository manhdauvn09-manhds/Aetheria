// Aetheria — WorldService.
//
// Surfaces the catalog (realms, levels) plus run lifecycle:
//   - realms()              list of realms (id, name, theme, color, order)
//   - levelsForRealm(id)    levels in that realm
//   - startLevel(input)     creates a `runs` row in the user's SQLite
//   - resumeRun(input)      fetches an in-progress run
//   - abandonRun(input)     marks a run abandoned
//
// Catalog source: MySQL `realms` / `levels`. When the MySQL row count for
// either is zero (fresh dev DB before any seed), we fall back to the
// JSON files in `@aetheria/game-assets`. This keeps the single-player
// shell playable on an empty database, which is a common dev case.
//
// Run state is per-user → it lives in the user's SQLite file, opened via
// `sqliteFor(userId)`.

import { audit } from "@aetheria/core";
import {
  type Level as AssetLevel,
  loadAllLevels,
} from "@aetheria/game-assets";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, SqliteClient } from "@aetheria/schema-db";
import { applyInitSchema, sqliteFor } from "@aetheria/schema-db";

export type WorldMysqlClient = Pick<MysqlClient, "realm" | "level">;

export interface WorldDeps {
  readonly mysql: WorldMysqlClient;
  /**
   * Override the per-user SQLite resolver. Tests stub this; production
   * uses the schema-db default.
   */
  readonly sqliteFor?: (userId: bigint) => Promise<SqliteClient>;
}

// ── Result shapes ────────────────────────────────────────────────────

export interface RealmOut {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly colorHex: string;
  readonly orderIndex: number;
}

export interface LevelSummaryOut {
  readonly id: string;
  readonly slug: string;
  readonly realmId: string;
  readonly levelNumber: number;
  readonly name: string;
  readonly type: string;
  readonly difficulty: number;
  readonly minAccountLevel: number;
  readonly version: number;
}

export interface LevelDetailOut extends LevelSummaryOut {
  readonly map: unknown;
  readonly encounter: unknown;
  readonly rewards: unknown;
  readonly discoverySecrets: unknown;
}

export interface RunOut {
  readonly id: string;
  readonly levelId: string;
  readonly levelNumber: number;
  readonly status: "in_progress" | "completed" | "failed" | "abandoned";
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly score: number;
  readonly stars: number;
  readonly snapshot: Readonly<Record<string, unknown>> | null;
}

export interface StartLevelInput {
  readonly userId: bigint;
  readonly levelNumber: number;
}

export interface ResumeRunInput {
  readonly userId: bigint;
  readonly runId: bigint;
}

export interface AbandonRunInput {
  readonly userId: bigint;
  readonly runId: bigint;
}

export interface StartLevelResult {
  readonly run: RunOut;
  readonly level: LevelDetailOut;
}

// ── Service ──────────────────────────────────────────────────────────

export class WorldService {
  private readonly openSqlite: (userId: bigint) => Promise<SqliteClient>;
  /** Track which per-user SQLite files have had `applyInitSchema` run
   *  this process. Idempotent at the SQL level, but skipping the work on
   *  every call keeps `startLevel` cheap. */
  private readonly schemaApplied = new Set<string>();

  constructor(private readonly deps: WorldDeps) {
    this.openSqlite = deps.sqliteFor ?? ((id) => sqliteFor(id));
  }

  private async openUserDb(userId: bigint): Promise<SqliteClient> {
    const db = await this.openSqlite(userId);
    const key = userId.toString();
    if (!this.schemaApplied.has(key)) {
      await applyInitSchema(db);
      this.schemaApplied.add(key);
    }
    return db;
  }

  async realms(): Promise<readonly RealmOut[]> {
    // Dev fallback when MySQL is empty OR unreachable — keeps the
    // single-player shell playable while the catalog seeder is offline.
    const rows = await tolerateDbMiss(() =>
      this.deps.mysql.realm.findMany({
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          name: true,
          theme: true,
          colorHex: true,
          orderIndex: true,
        },
      }),
    );
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        id: r.id.toString(),
        name: r.name,
        theme: r.theme,
        colorHex: r.colorHex,
        orderIndex: r.orderIndex,
      }));
    }
    return DEV_FALLBACK_REALMS;
  }

  async levelsForRealm(realmId: bigint): Promise<readonly LevelSummaryOut[]> {
    const rows = await tolerateDbMiss(() =>
      this.deps.mysql.level.findMany({
        where: { realmId },
        orderBy: { levelNumber: "asc" },
        select: {
          id: true,
          realmId: true,
          levelNumber: true,
          name: true,
          type: true,
          difficulty: true,
          minAccountLevel: true,
          version: true,
        },
      }),
    );
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        id: r.id.toString(),
        slug: slugFromName(r.name, r.levelNumber),
        realmId: r.realmId.toString(),
        levelNumber: r.levelNumber,
        name: r.name,
        type: r.type,
        difficulty: r.difficulty,
        minAccountLevel: r.minAccountLevel,
        version: r.version,
      }));
    }
    return loadAllLevels()
      .filter((l) => BigInt(l.realmId) === realmId)
      .map(assetToSummary);
  }

  async startLevel(input: StartLevelInput): Promise<StartLevelResult> {
    const detail = await this.loadLevelDetail(input.levelNumber);

    const db = await this.openUserDb(input.userId);
    // Prisma's SQLite `level` table mirrors the catalog cache. We assume
    // the catalog has been pulled (or the dev fallback path inserts a stub
    // row on demand). For now write a minimal row so the FK on `runs.levelId`
    // is satisfied even on a fresh SQLite file.
    await this.ensureLevelCacheRow(db, detail);

    // Raw SQL: the DDL stores timestamps as ISO TEXT but Prisma's
    // generated SQLite client wants epoch-ms numerics for `DateTime`.
    // We control format here so reads + writes stay consistent.
    const startedAtIso = new Date().toISOString();
    const insertedId = await db.$queryRawUnsafe<{ id: bigint }[]>(
      `INSERT INTO runs (level_id, status, started_at, score, stars, action_log, snapshot, dirty)
       VALUES (?, 'in_progress', ?, 0, 0, '[]', NULL, 1)
       RETURNING id`,
      Number(BigInt(detail.id)),
      startedAtIso,
    );
    const runId = insertedId[0]?.id;
    if (runId === undefined) {
      throw AppError.internal("Run insert returned no id");
    }

    await audit.write({
      actor: input.userId,
      action: "world.run.start",
      targetType: "level",
      targetId: BigInt(detail.id),
      payload: { runId: runId.toString(), levelNumber: detail.levelNumber },
    });

    return {
      run: {
        id: runId.toString(),
        levelId: detail.id,
        levelNumber: detail.levelNumber,
        status: "in_progress",
        startedAt: new Date(startedAtIso),
        endedAt: null,
        score: 0,
        stars: 0,
        snapshot: null,
      },
      level: detail,
    };
  }

  async resumeRun(input: ResumeRunInput): Promise<StartLevelResult> {
    const db = await this.openUserDb(input.userId);
    const rows = await db.$queryRawUnsafe<RunRow[]>(
      `SELECT r.id AS id, r.level_id AS level_id, r.status AS status,
              r.started_at AS started_at, r.ended_at AS ended_at,
              r.score AS score, r.stars AS stars, r.snapshot AS snapshot,
              l.level_number AS level_number
         FROM runs r JOIN levels l ON l.id = r.level_id
        WHERE r.id = ? LIMIT 1`,
      Number(input.runId),
    );
    const row = rows[0];
    if (!row) throw AppError.notFound("run", input.runId);
    if (row.status !== "in_progress") {
      throw AppError.invalidAction("Run is not resumable", { status: row.status });
    }

    const detail = await this.loadLevelDetail(Number(row.level_number));

    return {
      run: {
        id: row.id.toString(),
        levelId: String(row.level_id),
        levelNumber: Number(row.level_number),
        status: castStatus(row.status),
        startedAt: parseSqliteDate(row.started_at),
        endedAt: row.ended_at !== null ? parseSqliteDate(row.ended_at) : null,
        score: Number(row.score),
        stars: Number(row.stars),
        snapshot: parseSnapshot(row.snapshot),
      },
      level: detail,
    };
  }

  async abandonRun(input: AbandonRunInput): Promise<{ ok: true }> {
    const db = await this.openUserDb(input.userId);
    const rows = await db.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM runs WHERE id = ? LIMIT 1`,
      Number(input.runId),
    );
    const row = rows[0];
    if (!row) throw AppError.notFound("run", input.runId);
    if (row.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: row.status });
    }
    await db.$executeRawUnsafe(
      `UPDATE runs SET status = 'abandoned', ended_at = ?, dirty = 1 WHERE id = ?`,
      new Date().toISOString(),
      Number(input.runId),
    );
    await audit.write({
      actor: input.userId,
      action: "world.run.abandon",
      targetType: "run",
      targetId: input.runId,
      payload: {},
    });
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async loadLevelDetail(levelNumber: number): Promise<LevelDetailOut> {
    const row = await tolerateDbMiss(() =>
      this.deps.mysql.level.findUnique({
        where: { levelNumber },
        select: {
          id: true,
          realmId: true,
          levelNumber: true,
          name: true,
          type: true,
          difficulty: true,
          minAccountLevel: true,
          version: true,
          map: true,
          encounter: true,
          rewards: true,
          discoverySecrets: true,
        },
      }),
    );
    if (row) {
      return {
        id: row.id.toString(),
        slug: slugFromName(row.name, row.levelNumber),
        realmId: row.realmId.toString(),
        levelNumber: row.levelNumber,
        name: row.name,
        type: row.type,
        difficulty: row.difficulty,
        minAccountLevel: row.minAccountLevel,
        version: row.version,
        map: row.map,
        encounter: row.encounter,
        rewards: row.rewards,
        discoverySecrets: row.discoverySecrets ?? null,
      };
    }
    // Dev fallback: pick from the asset JSONs.
    const asset = loadAllLevels().find((l) => l.levelNumber === levelNumber);
    if (!asset) throw AppError.notFound("level", levelNumber);
    return assetToDetail(asset);
  }

  /**
   * The per-user SQLite has FK `runs.level_id → levels.id`. On a fresh
   * file the catalog cache is empty until the sync pull runs, so we
   * upsert a minimal row here so `startLevel` doesn't break in dev.
   */
  private async ensureLevelCacheRow(db: SqliteClient, detail: LevelDetailOut): Promise<void> {
    // Insert order matters: levels FK → realms, runs FK → levels.
    // We use raw SQL here because the Prisma generated SQLite client maps
    // `cached_at` to a `DateTime` and writes it as epoch millis, which then
    // fails to round-trip as a string. The DDL stores timestamps as ISO
    // text — letting the column default fire keeps both sides consistent.
    const realmStub = realmStubFor(BigInt(detail.realmId));
    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO realms (id, name, theme, color_hex, order_index) VALUES (?, ?, ?, ?, ?)`,
      Number(realmStub.id),
      realmStub.name,
      realmStub.theme,
      realmStub.colorHex,
      realmStub.orderIndex,
    );
    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO levels
         (id, realm_id, level_number, name, type, map, encounter, rewards,
          difficulty, min_account_level, discovery_secrets, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Number(BigInt(detail.id)),
      Number(BigInt(detail.realmId)),
      detail.levelNumber,
      detail.name,
      detail.type,
      JSON.stringify(detail.map),
      JSON.stringify(detail.encounter),
      JSON.stringify(detail.rewards),
      detail.difficulty,
      detail.minAccountLevel,
      detail.discoverySecrets !== null
        ? JSON.stringify(detail.discoverySecrets)
        : null,
      detail.version,
    );
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────

const castStatus = (s: string): RunOut["status"] => {
  if (s === "in_progress" || s === "completed" || s === "failed" || s === "abandoned") return s;
  return "in_progress";
};

const parseSnapshot = (raw: string | null): Readonly<Record<string, unknown>> | null => {
  if (raw === null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Readonly<Record<string, unknown>>;
  } catch {
    return null;
  }
};

const slugFromName = (name: string, levelNumber: number): string =>
  `level-${String(levelNumber)}-${name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)}`;

const assetToSummary = (l: AssetLevel): LevelSummaryOut => ({
  id: String(l.levelNumber),
  slug: l.slug,
  realmId: String(l.realmId),
  levelNumber: l.levelNumber,
  name: l.name,
  type: l.type,
  difficulty: l.difficulty,
  minAccountLevel: l.minAccountLevel,
  version: l.version,
});

const assetToDetail = (l: AssetLevel): LevelDetailOut => ({
  ...assetToSummary(l),
  map: l.map,
  encounter: l.encounter,
  rewards: l.rewards,
  discoverySecrets: l.discoverySecrets ?? null,
});

const DEV_FALLBACK_REALMS: readonly RealmOut[] = [
  { id: "1", name: "Verdant Reach", theme: "forest", colorHex: "#2E7D32", orderIndex: 1 },
  { id: "2", name: "Ashen Wastes", theme: "volcanic", colorHex: "#B71C1C", orderIndex: 2 },
  { id: "3", name: "Aetheric Spires", theme: "sky", colorHex: "#1565C0", orderIndex: 3 },
  { id: "4", name: "Sunken Hollow", theme: "ocean", colorHex: "#006064", orderIndex: 4 },
  { id: "5", name: "Hollow Vault", theme: "void", colorHex: "#311B92", orderIndex: 5 },
];

const realmStubFor = (
  id: bigint,
): { id: bigint; name: string; theme: string; colorHex: string; orderIndex: number } => {
  const found = DEV_FALLBACK_REALMS.find((r) => r.id === id.toString());
  if (found) {
    return {
      id,
      name: found.name,
      theme: found.theme,
      colorHex: found.colorHex,
      orderIndex: found.orderIndex,
    };
  }
  return { id, name: `Realm ${id.toString()}`, theme: "unknown", colorHex: "#444444", orderIndex: Number(id) };
};

/**
 * Treat any thrown DB error (no MySQL host, schema missing, …) as
 * "table empty" so callers can fall back to game-assets data. Real
 * production traffic should hit a populated DB and never reach the
 * fallback branch.
 */
const tolerateDbMiss = async <T>(call: () => Promise<T>): Promise<T | null> => {
  try {
    return await call();
  } catch (e) {
    console.warn("[world] catalog DB unavailable, using game-assets fallback", e);
    return null;
  }
};

/** Shape of a `runs JOIN levels` row from raw SQL. */
interface RunRow {
  id: bigint | number;
  level_id: bigint | number;
  level_number: bigint | number;
  status: string;
  started_at: string;
  ended_at: string | null;
  score: bigint | number;
  stars: bigint | number;
  snapshot: string | null;
}

/** Our DDL stores timestamps as ISO TEXT. Parse defensively in case a
 *  legacy row holds an epoch number from earlier (broken) writes. */
const parseSqliteDate = (raw: string): Date => {
  if (/^\d+$/.test(raw)) return new Date(Number(raw));
  return new Date(raw);
};
