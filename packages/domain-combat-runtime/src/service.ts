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
  HEX_DIRS,
  hashState,
  hexDistance,
  hydrate,
  replayActions,
  serializeState,
  type Action,
  type Actor,
  type BattleState,
  type Coord,
  type CreateBattleInput,
  type Event,
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
  readonly revision: number;
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
    // Optimistic concurrency: only update if the row's revision still
    // matches what we loaded. updateMany returns a count of 0 if some
    // other request raced ahead — we surface that as a conflict so the
    // client can retry with a fresh load.
    const cas = await this.deps.mysql.run.updateMany({
      where: { id: ref.runId, revision: run.revision },
      data: {
        // hydrate() expects the SerializedState envelope `{schemaVersion, state}`,
        // not raw BattleState. Use serializeState() to keep the contract.
        snapshot: serializeState(fresh) as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: [] as unknown as MysqlPrisma.Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
    if (cas.count === 0) {
      throw AppError.conflict("Combat state changed concurrently — retry");
    }
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

    const appendedActions: Action[] = [action];
    const aggregatedEvents: Event[] = [...result.events];

    // ── Server-side enemy AI ─────────────────────────────────────────
    // While it's the enemy's turn, pick + apply one action per enemy
    // actor until we either bounce back to the player or the battle
    // ends. AI is intentionally simple (chase → attack-if-adjacent →
    // end-turn fallback) so the player has a moving opponent without
    // depending on a real-time client tick.
    let aiSafetyBudget = 24; // worst-case 6 enemies × 4 actions
    while (
      aiSafetyBudget-- > 0 &&
      result.state.phase === "enemy_turn" &&
      result.state.activeActorId
    ) {
      const enemyAction = pickEnemyAction(result.state, result.state.activeActorId);
      if (!enemyAction) break;
      let aiResult: ReturnType<typeof applyAction>;
      try {
        aiResult = applyAction(result.state, enemyAction);
      } catch {
        // AI picked something the engine rejected — fall back to
        // ending the enemy's turn so we don't loop forever.
        try {
          aiResult = applyAction(result.state, {
            kind: "end_turn",
            actorId: result.state.activeActorId,
          });
        } catch {
          break;
        }
      }
      appendedActions.push(enemyAction);
      aggregatedEvents.push(...aiResult.events);
      result = aiResult;
    }

    const nextLog = [...log, ...appendedActions];
    const phase = result.state.phase;
    const runStatus: RunStatus =
      phase === "victory" ? "completed"
        : phase === "defeat" ? "failed"
        : phase === "draw" ? "completed"
        : "in_progress";

    // CAS write — only commit if revision still matches the one we
    // loaded above. Prevents concurrent submitAction calls from
    // clobbering each other's snapshot/actionLog/status.
    const cas = await this.deps.mysql.run.updateMany({
      where: { id: ref.runId, revision: run.revision },
      data: {
        snapshot: serializeState(result.state) as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: nextLog as unknown as MysqlPrisma.Prisma.InputJsonValue,
        status: runStatus,
        revision: { increment: 1 },
        ...(runStatus === "in_progress" ? {} : { endedAt: new Date() }),
      },
    });
    if (cas.count === 0) {
      throw AppError.conflict(
        "Combat state changed concurrently — refresh and retry",
        { runId: String(ref.runId), atRevision: run.revision },
      );
    }

    await audit.write({
      actor: ref.userId,
      action: "combat.submit_action",
      targetType: "run",
      targetId: ref.runId,
      payload: {
        kind: action.kind,
        actorId: action.actorId,
        events: aggregatedEvents.length,
        aiActions: appendedActions.length - 1,
        phase,
      },
    });
    return { state: result.state, events: aggregatedEvents, runStatus };
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
        revision: true,
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

// Roster used for the synthesised encounter. Difficulty scales with level
// number so progression feels visible even before the level-designer
// pipeline lands. Indexes 0..7 mirror the 8-character roster from the
// game guideline (Aevra, Kyo, Lyra, Brann, Mira, Vex, Solen, Null).
const HERO_ROSTER: ReadonlyArray<{
  readonly id: string;
  readonly unit: string;
  readonly element: "verdant" | "ember" | "frost" | "tide" | "sky" | "void";
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}> = [
  { id: "aevra", unit: "Aevra",  element: "ember",   atk: 32, def: 10, spd: 65 },
  { id: "kyo",   unit: "Kyo",    element: "void",    atk: 28, def: 15, spd: 55 },
  { id: "lyra",  unit: "Lyra",   element: "sky",     atk: 36, def:  8, spd: 60 },
  { id: "brann", unit: "Brann",  element: "verdant", atk: 24, def: 22, spd: 45 },
];

const ENEMY_ARCHETYPES: ReadonlyArray<{
  readonly id: string;
  readonly unit: string;
  readonly element: "verdant" | "ember" | "frost" | "tide" | "sky" | "void";
}> = [
  { id: "frost_wraith", unit: "Frost Wraith", element: "frost"   },
  { id: "ember_husk",   unit: "Ember Husk",   element: "ember"   },
  { id: "void_stalker", unit: "Void Stalker", element: "void"    },
  { id: "tide_brute",   unit: "Tide Brute",   element: "tide"    },
];

const synthesiseInit = (
  ref: RunRef,
  level: { levelNumber: number; name: string },
): CreateBattleInput => {
  const tiles: Tile[] = [];
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 4; r++) {
      // Sprinkle some visual variety: forest fringe on top row, plain elsewhere
      const terrain: Tile["terrain"] =
        r === 0 && (q === 1 || q === 4) ? "forest" :
        r === 3 && q === 5             ? "shrine" :
                                         "plain";
      tiles.push({ q, r, terrain, elev: 0 });
    }
  }
  // Hero rotates through roster by levelNumber so each level shows variety.
  const heroIdx = Math.max(0, (level.levelNumber - 1)) % HERO_ROSTER.length;
  const enemyIdx = Math.max(0, (level.levelNumber - 1)) % ENEMY_ARCHETYPES.length;
  const heroSpec = HERO_ROSTER[heroIdx]!;
  const enemySpec = ENEMY_ARCHETYPES[enemyIdx]!;
  // HP scales gently with level so higher levels feel meatier.
  const heroHp = 80 + Math.min(40, level.levelNumber * 2);
  const enemyHp = 50 + Math.min(60, level.levelNumber * 3);
  const player = synthActor(
    heroSpec.id, heroSpec.unit, "player", heroSpec.element,
    { q: 0, r: 1 }, heroHp,
    { atk: heroSpec.atk, def: heroSpec.def, spd: heroSpec.spd },
  );
  const enemy = synthActor(
    enemySpec.id, enemySpec.unit, "enemy", enemySpec.element,
    { q: 4, r: 2 }, enemyHp,
    { atk: 24 + level.levelNumber, def: 8, spd: 48 },
  );
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
  unit: string,
  side: "player" | "enemy",
  element: "verdant" | "ember" | "frost" | "tide" | "sky" | "void",
  pos: { q: number; r: number },
  hp: number,
  combat: { atk: number; def: number; spd: number },
): Actor => ({
  id,
  side,
  unit,
  element,
  stats: {
    hp,
    maxHp: hp,
    ap: 3,
    apRegen: 3,
    atk: combat.atk,
    def: combat.def,
    spd: combat.spd,
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

// serializeState is now used in start() + submitAction() (snapshot must be the
// `{schemaVersion, state}` envelope, not raw BattleState).

// ── Enemy AI ──────────────────────────────────────────────────────────
//
// Pick the next action for a single enemy actor. Strategy:
//   1. Find the closest live player-side actor.
//   2. If adjacent → attack.
//   3. If we have AP + move budget → step one hex toward the target along
//      a hex direction that brings us closer and lands on a tile that
//      isn't occupied.
//   4. Otherwise → end_turn.
//
// This is intentionally one of the simplest AIs that actually puts
// pressure on the player. Better behaviours (kiting, status synergy,
// element-wheel preference) land later.

const pickEnemyAction = (state: BattleState, actorId: string): Action | null => {
  const me = state.actors.find((a) => a.id === actorId);
  if (!me || me.defeated || me.side !== "enemy") {
    return { kind: "end_turn", actorId };
  }
  const target = nearestPlayer(state, me);
  if (!target) {
    return { kind: "end_turn", actorId };
  }
  const dist = hexDistance(me.pos, target.pos);

  // Adjacent + has AP for attack: strike.
  if (dist === 1 && me.stats.ap >= 1) {
    return { kind: "attack", actorId, targetId: target.id };
  }

  // Try to move one hex closer if we have AP + at least one move budget.
  if (me.stats.ap >= 1 && me.stats.move >= 1) {
    const step = stepToward(state, me, target.pos);
    if (step) {
      return { kind: "move", actorId, path: [step] };
    }
  }

  return { kind: "end_turn", actorId };
};

const nearestPlayer = (state: BattleState, from: Actor): Actor | null => {
  let best: Actor | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of state.actors) {
    if (a.side !== "player" || a.defeated) continue;
    const d = hexDistance(from.pos, a.pos);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
};

const stepToward = (state: BattleState, me: Actor, target: Coord): Coord | null => {
  const occupied = new Set<string>();
  for (const a of state.actors) {
    if (!a.defeated && a.id !== me.id) {
      occupied.add(`${String(a.pos.q)},${String(a.pos.r)}`);
    }
  }
  const tileSet = new Set<string>(
    state.tiles.map((t) => `${String(t.q)},${String(t.r)}`),
  );
  let best: Coord | null = null;
  let bestDist = hexDistance(me.pos, target);
  for (const d of HEX_DIRS) {
    const next: Coord = { q: me.pos.q + d.q, r: me.pos.r + d.r };
    const key = `${String(next.q)},${String(next.r)}`;
    if (!tileSet.has(key)) continue;          // off-map
    if (occupied.has(key)) continue;          // blocked by another actor
    const nd = hexDistance(next, target);
    if (nd < bestDist) {
      bestDist = nd;
      best = next;
    }
  }
  return best;
};
