// Aetheria — combat runtime service.
//
// Bridges the pure-domain engine (`@aetheria/domain-combat`) to the shared
// MySQL `runs` table. Three flows:
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
// We treat the run row as the canonical source of truth: snapshot is the
// live BattleState (serialized to a stable JSON envelope), action_log is
// the append-only history. Both columns are MySQL `JSON` type.
//
// Authorisation note: every query is scoped by `userId` so a user can't
// touch another user's run even if they discover a numeric runId.
//
// B13 note (integrity): the replay-hash check defeats client-driven
// tampering of action_log + snapshot — they have to remain self-
// consistent under deterministic replay, which is intractable without
// knowing the engine seed. Operator-level tampering (DB row edit) is out
// of scope for this layer.

import { audit } from "@aetheria/core";
import {
  applyAction,
  createBattle,
  EngineError,
  hashState,
  hydrate,
  replayActions,
  serializeState,
  type Action,
  type Actor,
  type BattleState,
  type CreateBattleInput,
  type Tile,
} from "@aetheria/domain-combat";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

export type CombatMysqlClient = Pick<MysqlClient, "run">;

export interface CombatRunDeps {
  readonly mysql: CombatMysqlClient;
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
  readonly id: bigint;
  readonly levelId: bigint;
  readonly status: string;
  readonly actionLog: unknown;
  readonly snapshot: unknown;
  readonly level: { readonly levelNumber: number; readonly name: string };
}

export class CombatRunService {
  constructor(private readonly deps: CombatRunDeps) {}

  // ── Public flows ──────────────────────────────────────────────────

  async start(ref: RunRef): Promise<CombatStartResult> {
    const run = await this.loadRun(ref);
    if (run.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: run.status });
    }
    const init = synthesiseInit(ref, run.level);
    const fresh = createBattle(init);
    await this.deps.mysql.run.update({
      where: { id: ref.runId },
      data: {
        snapshot: fresh as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: [] as unknown as MysqlPrisma.Prisma.InputJsonValue,
      },
    });
    await audit.write({
      actor: ref.userId,
      action: "combat.start",
      targetType: "run",
      targetId: ref.runId,
      payload: { battleId: fresh.battleId, levelNumber: run.level.levelNumber },
    });
    return { state: fresh };
  }

  async submitAction(ref: RunRef, action: Action): Promise<CombatSubmitResult> {
    const run = await this.loadRun(ref);
    if (run.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: run.status });
    }
    const state = this.hydrateOrThrow(run);
    const log = parseActionLog(run.actionLog);

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

    await this.deps.mysql.run.update({
      where: { id: ref.runId },
      data: {
        snapshot: result.state as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: nextLog as unknown as MysqlPrisma.Prisma.InputJsonValue,
        status: runStatus,
        ...(runStatus === "in_progress" ? {} : { endedAt: new Date() }),
      },
    });

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
    const run = await this.loadRun(ref);
    const log = parseActionLog(run.actionLog);
    const stored = this.hydrateOrThrow(run);
    const init = synthesiseInit(ref, run.level);
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

  private async loadRun(ref: RunRef): Promise<RunRow> {
    const row = await this.deps.mysql.run.findFirst({
      where: { id: ref.runId, userId: ref.userId },
      select: {
        id: true,
        levelId: true,
        status: true,
        actionLog: true,
        snapshot: true,
        level: { select: { levelNumber: true, name: true } },
      },
    });
    if (!row) throw AppError.notFound("run", ref.runId);
    return row;
  }

  private hydrateOrThrow(run: RunRow): BattleState {
    if (run.snapshot === null || run.snapshot === undefined) {
      throw AppError.invalidAction("Combat hasn't started for this run", {
        runId: String(run.id),
      });
    }
    try {
      return hydrate(run.snapshot);
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

const synthesiseInit = (
  ref: RunRef,
  _level: { levelNumber: number; name: string },
): CreateBattleInput => {
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

const parseActionLog = (raw: unknown): readonly Action[] => {
  // MySQL JSON column returns a parsed value already, but tolerate the
  // legacy string form in case a stale row lingers from before the
  // 1-DB consolidation.
  if (Array.isArray(raw)) return raw as readonly Action[];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as readonly Action[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

void serializeState; // keep import warm for stable JSON contract reference
