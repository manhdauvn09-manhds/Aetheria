// Aetheria — combat runtime service.
//
// Bridges the pure-domain engine (`@aetheria/domain-combat`) to the
// per-user SQLite `runs` table. Three flows:
//
//   start({runId})         build a fresh BattleState from the run's
//                          level + a synthesised party / encounter,
//                          persist into runs.snapshot + reset action_log
//   submitAction({runId, action})
//                          load → hydrate → applyAction → persist;
//                          server-authoritative validation (illegal
//                          actions reject without state change)
//   replay({runId})        re-run runs.action_log against a fresh init
//                          and compare the final hash to the stored
//                          snapshot's hash; flags tampering
//
// We treat the run row as the canonical source of truth: snapshot is
// the live BattleState, action_log is the append-only history.

import { audit } from "@aetheria/core";
import {
  applyAction,
  createBattle,
  EngineError,
  hashState,
  hydrate,
  replayActions,
  serializeState,
  stringifyState,
  type Action,
  type Actor,
  type BattleState,
  type CreateBattleInput,
  type Tile,
} from "@aetheria/domain-combat";
import { AppError } from "@aetheria/schema-api";
import type { SqliteClient } from "@aetheria/schema-db";
import { applyInitSchema, sqliteFor } from "@aetheria/schema-db";

export interface CombatRunDeps {
  /** Override the per-user SQLite resolver. Tests stub this. */
  readonly sqliteFor?: (userId: bigint) => Promise<SqliteClient>;
}

export interface RunRef {
  readonly userId: bigint;
  readonly runId: bigint;
}

export interface CombatStartResult {
  readonly state: BattleState;
}

export interface CombatSubmitResult {
  readonly state: BattleState;
  readonly events: ReturnType<typeof applyAction>["events"];
  readonly runStatus: RunStatus;
}

export interface CombatReplayResult {
  readonly ok: boolean;
  readonly expected: string;
  readonly actual: string;
}

type RunStatus = "in_progress" | "completed" | "failed" | "abandoned";

interface RunRow {
  id: bigint | number;
  level_id: bigint | number;
  status: string;
  action_log: string;
  snapshot: string | null;
}

interface LevelRow {
  id: bigint | number;
  level_number: bigint | number;
  name: string;
}

export class CombatRunService {
  private readonly openSqlite: (userId: bigint) => Promise<SqliteClient>;
  private readonly schemaApplied = new Set<string>();

  constructor(deps: CombatRunDeps = {}) {
    this.openSqlite = deps.sqliteFor ?? ((id) => sqliteFor(id));
  }

  // ── Public flows ──────────────────────────────────────────────────

  async start(ref: RunRef): Promise<CombatStartResult> {
    const db = await this.openUserDb(ref.userId);
    const run = await this.loadRun(db, ref.runId);
    if (run.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: run.status });
    }
    const level = await this.loadLevel(db, BigInt(run.level_id));
    const init = synthesiseInit(ref, level);
    const fresh = createBattle(init);
    await db.$executeRawUnsafe(
      `UPDATE runs SET snapshot = ?, action_log = '[]', dirty = 1 WHERE id = ?`,
      stringifyState(fresh),
      Number(ref.runId),
    );
    await audit.write({
      actor: ref.userId,
      action: "combat.start",
      targetType: "run",
      targetId: ref.runId,
      payload: { battleId: fresh.battleId, levelNumber: Number(level.level_number) },
    });
    return { state: fresh };
  }

  async submitAction(
    ref: RunRef,
    action: Action,
  ): Promise<CombatSubmitResult> {
    const db = await this.openUserDb(ref.userId);
    const run = await this.loadRun(db, ref.runId);
    if (run.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: run.status });
    }
    const state = this.hydrateOrThrow(run);
    const log = parseActionLog(run.action_log);

    let result: ReturnType<typeof applyAction>;
    try {
      result = applyAction(state, action);
    } catch (e) {
      if (e instanceof EngineError) {
        throw AppError.invalidAction(`combat: ${e.code}`, {
          code: e.code,
          message: e.message,
          details: e.details ?? null,
        });
      }
      throw AppError.internal("combat engine failure", e);
    }

    const nextLog = [...log, action];
    const phase = result.state.phase;
    const runStatus: RunStatus =
      phase === "victory" ? "completed"
        : phase === "defeat" ? "failed"
        : phase === "draw" ? "completed"
        : "in_progress";

    await db.$executeRawUnsafe(
      `UPDATE runs
          SET snapshot = ?, action_log = ?, status = ?, dirty = 1,
              ended_at = CASE WHEN ? = 'in_progress' THEN ended_at
                              ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
        WHERE id = ?`,
      stringifyState(result.state),
      JSON.stringify(nextLog),
      runStatus,
      runStatus,
      Number(ref.runId),
    );
    await audit.write({
      actor: ref.userId,
      action: "combat.submit_action",
      targetType: "run",
      targetId: ref.runId,
      payload: {
        kind: action.kind,
        actorId: action.actorId,
        events: result.events.length,
        phase,
      },
    });
    return { state: result.state, events: result.events, runStatus };
  }

  async replay(ref: RunRef): Promise<CombatReplayResult> {
    const db = await this.openUserDb(ref.userId);
    const run = await this.loadRun(db, ref.runId);
    const level = await this.loadLevel(db, BigInt(run.level_id));
    const log = parseActionLog(run.action_log);
    const stored = this.hydrateOrThrow(run);
    const init = synthesiseInit(ref, level);
    // Replay against the same init seed, then compare against the
    // snapshot's serialized hash. Mismatch ⇒ tampered run.
    const replayed = replayActions({ init, actions: log });
    const expected = hashState(stored);
    return {
      ok: replayed.hash === expected,
      expected,
      actual: replayed.hash,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────

  private async openUserDb(userId: bigint): Promise<SqliteClient> {
    const db = await this.openSqlite(userId);
    const key = userId.toString();
    if (!this.schemaApplied.has(key)) {
      await applyInitSchema(db);
      this.schemaApplied.add(key);
    }
    return db;
  }

  private async loadRun(db: SqliteClient, runId: bigint): Promise<RunRow> {
    const rows = await db.$queryRawUnsafe<RunRow[]>(
      `SELECT id, level_id, status, action_log, snapshot
         FROM runs
        WHERE id = ?
        LIMIT 1`,
      Number(runId),
    );
    const row = rows[0];
    if (!row) throw AppError.notFound("run", runId);
    return row;
  }

  private async loadLevel(db: SqliteClient, levelId: bigint): Promise<LevelRow> {
    const rows = await db.$queryRawUnsafe<LevelRow[]>(
      `SELECT id, level_number, name FROM levels WHERE id = ? LIMIT 1`,
      Number(levelId),
    );
    const row = rows[0];
    if (!row) throw AppError.notFound("level", levelId);
    return row;
  }

  private hydrateOrThrow(run: RunRow): BattleState {
    if (!run.snapshot) {
      throw AppError.invalidAction("Combat hasn't started for this run", {
        runId: String(run.id),
      });
    }
    try {
      const raw: unknown = JSON.parse(run.snapshot);
      return hydrate(raw);
    } catch (e) {
      throw AppError.internal("Run snapshot is corrupted", e);
    }
  }
}

// ── Synthesis helpers ─────────────────────────────────────────────────
//
// 4.27 ships a server-authoritative shell. Real per-level encounter
// data + party loading lands in 4-E (`progression`). For now we
// synthesise a 6×4 plain grid with one player + one enemy so the
// engine has a valid starting state that's deterministic per run.

const synthesiseInit = (ref: RunRef, _level: LevelRow): CreateBattleInput => {
  const tiles: Tile[] = [];
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 4; r++) {
      tiles.push({ q, r, terrain: "plain", elev: 0 });
    }
  }
  const player = synthActor("hero", "player", "ember", { q: 0, r: 0 }, 80);
  const enemy = synthActor("foe", "enemy", "frost", { q: 4, r: 2 }, 60);
  // `seed` omitted on purpose — `createBattle` derives it from `battleId`.
  return {
    battleId: `run-${ref.runId.toString()}`,
    config: { width: 6, height: 4, turnLimit: 30, defaultApRegen: 3 },
    tiles,
    actors: [player, enemy],
    firstTurn: "player",
  };
};

const synthActor = (
  id: string,
  side: "player" | "enemy",
  element: "ember" | "frost",
  pos: { q: number; r: number },
  hp: number,
): Actor => ({
  id,
  side,
  unit: id,
  element,
  stats: {
    hp,
    maxHp: hp,
    ap: 3,
    apRegen: 3,
    atk: 30,
    def: 10,
    spd: side === "player" ? 60 : 50,
    move: 2,
  },
  pos,
  facing: 0,
  statuses: [],
  skills: [],
  cooldowns: {},
  defeated: false,
});

const parseActionLog = (raw: string): readonly Action[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as readonly Action[];
  } catch {
    return [];
  }
};

void serializeState; // keep import warm for stable JSON contract reference
