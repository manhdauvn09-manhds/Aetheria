// Aetheria — WorldService.
//
// Surfaces the catalog (realms, levels) plus run lifecycle:
//   - realms()              list of realms (id, name, theme, color, order)
//   - levelsForRealm(id)    levels in that realm
//   - startLevel(input)     creates a `runs` row in MySQL
//   - resumeRun(input)      fetches an in-progress run
//   - abandonRun(input)     marks a run abandoned
//
// Catalog source: MySQL `realms` / `levels`. When the MySQL row count for
// either is zero (fresh dev DB before any seed), we fall back to the
// JSON files in `@aetheria/game-assets`. This keeps the single-player
// shell playable on an empty database, which is a common dev case.
//
// Run state lives in the shared MySQL `runs` table (one row per attempt,
// scoped by `user_id`). The dual-DB sync layer was removed in the 1-DB
// migration; CombatRunService writes the same row directly.

import { audit } from "@aetheria/core";
import {
  type Level as AssetLevel,
  loadAllLevels,
} from "@aetheria/game-assets";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

export type WorldMysqlClient = Pick<MysqlClient, "realm" | "level" | "run">;

export interface WorldDeps {
  readonly mysql: WorldMysqlClient;
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
  constructor(private readonly deps: WorldDeps) {}

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
    const created = await this.deps.mysql.run.create({
      data: {
        userId: input.userId,
        levelId: BigInt(detail.id),
        status: "in_progress",
        score: 0,
        stars: 0,
        actionLog: [] as unknown as MysqlPrisma.Prisma.InputJsonValue,
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        score: true,
        stars: true,
        snapshot: true,
      },
    });

    await audit.write({
      actor: input.userId,
      action: "world.run.start",
      targetType: "level",
      targetId: BigInt(detail.id),
      payload: { runId: created.id.toString(), levelNumber: detail.levelNumber },
    });

    return {
      run: {
        id: created.id.toString(),
        levelId: detail.id,
        levelNumber: detail.levelNumber,
        status: castStatus(created.status),
        startedAt: created.startedAt,
        endedAt: created.endedAt,
        score: created.score,
        stars: created.stars,
        snapshot: snapshotAsObject(created.snapshot),
      },
      level: detail,
    };
  }

  async resumeRun(input: ResumeRunInput): Promise<StartLevelResult> {
    // Scope by userId so users can't resume someone else's run.
    const row = await this.deps.mysql.run.findFirst({
      where: { id: input.runId, userId: input.userId },
      select: {
        id: true,
        levelId: true,
        status: true,
        startedAt: true,
        endedAt: true,
        score: true,
        stars: true,
        snapshot: true,
        level: { select: { levelNumber: true } },
      },
    });
    if (!row) throw AppError.notFound("run", input.runId);
    if (row.status !== "in_progress") {
      throw AppError.invalidAction("Run is not resumable", { status: row.status });
    }

    const detail = await this.loadLevelDetail(row.level.levelNumber);

    return {
      run: {
        id: row.id.toString(),
        levelId: row.levelId.toString(),
        levelNumber: row.level.levelNumber,
        status: castStatus(row.status),
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        score: row.score,
        stars: row.stars,
        snapshot: snapshotAsObject(row.snapshot),
      },
      level: detail,
    };
  }

  async abandonRun(input: AbandonRunInput): Promise<{ ok: true }> {
    const row = await this.deps.mysql.run.findFirst({
      where: { id: input.runId, userId: input.userId },
      select: { status: true },
    });
    if (!row) throw AppError.notFound("run", input.runId);
    if (row.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: row.status });
    }
    await this.deps.mysql.run.update({
      where: { id: input.runId },
      data: { status: "abandoned", endedAt: new Date() },
    });
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
}

// ── Pure helpers ─────────────────────────────────────────────────────

const castStatus = (s: string): RunOut["status"] => {
  if (s === "in_progress" || s === "completed" || s === "failed" || s === "abandoned") return s;
  return "in_progress";
};

const snapshotAsObject = (raw: unknown): Readonly<Record<string, unknown>> | null => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Readonly<Record<string, unknown>>;
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
