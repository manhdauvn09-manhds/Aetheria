// Aetheria — combat engine.
//
// Two pure functions:
//   - createBattle(input)         build a fresh BattleState
//   - applyAction(state, action)  validate + dispatch + emit events
//
// Both are deterministic: every call that consumes randomness threads
// `state.rng` through and returns a new state. Replay = re-running
// applyAction over the same `(state, action[])` always yields identical
// `events[]`. The engine also throws `EngineError` for illegal moves so
// the server can reject cheaters and the client can surface UX feedback.

import {
  apCost,
  elementAdvantage,
  lineOfSight,
  rangeReachable,
  resonanceCheck,
} from "./helpers.js";
import { chance, makeRng, nextInt, rollDice, seedFromString, type RngState } from "./rng.js";
import { endTurn } from "./turn.js";
import {
  HEX_DIRS,
  hexDistance,
  sameCoord,
  type Action,
  type Actor,
  type ActorId,
  type ActorMovedEvent,
  type ActorDefeatedEvent,
  type AttackAction,
  type BattleConfig,
  type BattleState,
  type Coord,
  type DamageDealtEvent,
  type DefendAction,
  type EndTurnAction,
  type Event,
  type MoveAction,
  type ResonanceTriggeredEvent,
  type Side,
  type StatusEffect,
  type Tile,
  type UseSkillAction,
} from "./types.js";

// ── Errors ────────────────────────────────────────────────────────────

export type EngineErrorCode =
  | "ACTOR_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "WRONG_TURN"
  | "INSUFFICIENT_AP"
  | "INVALID_PATH"
  | "OUT_OF_RANGE"
  | "NO_LINE_OF_SIGHT"
  | "ALREADY_DEFEATED"
  | "BATTLE_OVER";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

// ── createBattle ──────────────────────────────────────────────────────

export interface CreateBattleInput {
  readonly battleId: string;
  /** Optional explicit seed; otherwise derived from `battleId`. */
  readonly seed?: number;
  readonly config?: Partial<BattleConfig>;
  readonly tiles: readonly Tile[];
  readonly actors: readonly Actor[];
  /** Side that acts first. Defaults to "player". */
  readonly firstTurn?: Side;
}

const DEFAULT_CONFIG: BattleConfig = {
  width: 8,
  height: 6,
  turnLimit: 0,
  defaultApRegen: 3,
};

export const createBattle = (input: CreateBattleInput): BattleState => {
  const config: BattleConfig = { ...DEFAULT_CONFIG, ...input.config };
  const rng: RngState = makeRng(input.seed ?? seedFromString(input.battleId));
  const firstSide: Side = input.firstTurn ?? "player";
  // Lowest-spd actor on the chosen side is the first activeActor; tiebreak
  // by id so two seeds with the same actor list converge.
  const orderable = input.actors.filter((a) => a.side === firstSide && !a.defeated);
  const sorted = [...orderable].sort((a, b) => b.stats.spd - a.stats.spd || a.id.localeCompare(b.id));
  const activeActorId = sorted[0]?.id ?? null;

  return {
    battleId: input.battleId,
    config,
    tiles: [...input.tiles],
    actors: input.actors.map(cloneActor),
    turn: 1,
    phase: firstSide === "player" ? "player_turn" : "enemy_turn",
    activeActorId,
    rng,
    log: [],
  };
};

// ── applyAction ───────────────────────────────────────────────────────

export interface ApplyResult {
  readonly state: BattleState;
  readonly events: readonly Event[];
}

export const applyAction = (state: BattleState, action: Action): ApplyResult => {
  if (state.phase === "victory" || state.phase === "defeat" || state.phase === "draw") {
    throw new EngineError("BATTLE_OVER", "Battle already ended", { phase: state.phase });
  }
  const actor = mustFindActor(state, action.actorId);
  if (actor.defeated) {
    throw new EngineError("ALREADY_DEFEATED", "Actor is defeated", { actorId: actor.id });
  }
  if (state.activeActorId !== actor.id) {
    throw new EngineError("WRONG_TURN", "Not this actor's turn", {
      activeActorId: state.activeActorId,
      attempted: actor.id,
    });
  }

  // Each handler does its own action-specific validation FIRST (so a
  // wall step in a move path surfaces INVALID_PATH rather than the
  // less-helpful INSUFFICIENT_AP — apCost would otherwise return ∞ for
  // an impassable step), then confirms AP, then applies the effect.
  switch (action.kind) {
    case "move":
      return applyMove(state, actor, action);
    case "attack":
      return applyAttack(state, actor, action);
    case "use_skill":
      return applyUseSkill(state, actor, action);
    case "defend":
      return applyDefend(state, actor, action);
    case "end_turn":
      return applyEndTurn(state, actor, action);
  }
};

/** Throw INSUFFICIENT_AP if `cost > actor.stats.ap` or non-finite. */
const requireAp = (actor: Actor, cost: number): void => {
  if (!Number.isFinite(cost) || cost > actor.stats.ap) {
    throw new EngineError("INSUFFICIENT_AP", "Not enough AP", {
      have: actor.stats.ap,
      need: cost,
    });
  }
};

// ── Move ──────────────────────────────────────────────────────────────

const applyMove = (
  state: BattleState,
  actor: Actor,
  action: MoveAction,
): ApplyResult => {
  if (action.path.length === 0) {
    throw new EngineError("INVALID_PATH", "Empty path");
  }
  // Each step must be adjacent to the previous and not collide with
  // another live actor or impassable tile.
  let prev: Coord = actor.pos;
  const blockers = new Set<string>();
  for (const a of state.actors) {
    if (a.defeated || a.id === actor.id) continue;
    blockers.add(coordKey(a.pos));
  }
  const tileMap = new Map<string, Tile>();
  for (const t of state.tiles) tileMap.set(coordKey(t), t);

  for (const step of action.path) {
    if (!isAdjacent(prev, step)) {
      throw new EngineError("INVALID_PATH", "Path step is not adjacent", {
        from: prev,
        to: step,
      });
    }
    const tile = tileMap.get(coordKey(step));
    if (!tile) throw new EngineError("INVALID_PATH", "Step is off the map", { step });
    if (tile.terrain === "wall" || tile.terrain === "void") {
      throw new EngineError("INVALID_PATH", "Step blocked by terrain", { step, terrain: tile.terrain });
    }
    if (blockers.has(coordKey(step))) {
      throw new EngineError("INVALID_PATH", "Step blocked by another actor", { step });
    }
    prev = step;
  }
  const finalCoord = action.path[action.path.length - 1];
  if (!finalCoord) throw new EngineError("INVALID_PATH", "Empty path");

  const cost = apCost(state, action);
  requireAp(actor, cost);

  const events: Event[] = [
    {
      type: "actor_moved",
      t: state.log.length,
      actorId: actor.id,
      from: actor.pos,
      to: finalCoord,
      path: [...action.path],
      apSpent: cost,
    } satisfies ActorMovedEvent,
  ];

  const next = mutateActor(state, actor.id, (a) => ({
    ...a,
    pos: finalCoord,
    stats: { ...a.stats, ap: a.stats.ap - cost },
  }));
  return { state: appendLog(next, events), events };
};

// ── Attack ────────────────────────────────────────────────────────────

const applyAttack = (
  state: BattleState,
  attacker: Actor,
  action: AttackAction,
): ApplyResult => {
  const target = mustFindActor(state, action.targetId);
  if (target.defeated) {
    throw new EngineError("ALREADY_DEFEATED", "Target is defeated", { targetId: target.id });
  }
  // Range: melee=1 hex by default. Skills add range; basic attack is 1.
  const dist = hexDistance(attacker.pos, target.pos);
  if (dist > 1) {
    throw new EngineError("OUT_OF_RANGE", "Target out of melee range", { dist });
  }
  if (!lineOfSight(state, attacker.pos, target.pos)) {
    throw new EngineError("NO_LINE_OF_SIGHT", "Target obscured");
  }
  const cost = apCost(state, action);
  requireAp(attacker, cost);

  // Damage formula: base = max(1, atk - def)
  // variance: 1d4 → maps to 0.85..1.15 multiplier
  // element: elementAdvantage(att, def) = 0.75 / 1.0 / 1.25
  // crit: 5% chance × 1.5 (resonance: 1.5 if matched)
  const base = Math.max(1, attacker.stats.atk - target.stats.def);
  let rng = state.rng;

  const v = rollDice(rng, 1, 4);
  rng = v.state;
  const variance = 0.85 + (v.value - 1) * 0.1; // 0.85, 0.95, 1.05, 1.15

  const advantage = elementAdvantage(attacker.element, target.element);

  const c = chance(rng, 0.05);
  rng = c.state;
  const crit = c.value;
  const critMul = crit ? 1.5 : 1;

  const reson = resonanceCheck(state);
  const resonMul = reson?.element === attacker.element ? reson.bonusMultiplier : 1;

  const raw = Math.round(base * variance * advantage * critMul * resonMul);
  const damage = Math.max(1, raw);
  const newHp = Math.max(0, target.stats.hp - damage);

  const events: Event[] = [];
  if (resonMul > 1 && reson) {
    events.push({
      type: "resonance_triggered",
      t: state.log.length + events.length,
      actors: [...reson.actors],
      element: reson.element,
      bonusMultiplier: reson.bonusMultiplier,
    } satisfies ResonanceTriggeredEvent);
  }
  events.push({
    type: "damage_dealt",
    t: state.log.length + events.length,
    attackerId: attacker.id,
    targetId: target.id,
    amount: damage,
    mitigated: Math.max(0, base - damage), // crude — for UI hint only
    element: attacker.element,
    crit,
  } satisfies DamageDealtEvent);
  if (newHp === 0) {
    events.push({
      type: "actor_defeated",
      t: state.log.length + events.length,
      actorId: target.id,
      killerId: attacker.id,
    } satisfies ActorDefeatedEvent);
  }

  let next = mutateActor(state, attacker.id, (a) => ({
    ...a,
    stats: { ...a.stats, ap: a.stats.ap - cost },
  }));
  next = mutateActor(next, target.id, (t) => ({
    ...t,
    stats: { ...t.stats, hp: newHp },
    defeated: newHp === 0,
  }));
  next = { ...next, rng };
  return { state: appendLog(next, events), events };
};

// ── Use skill (shell) ─────────────────────────────────────────────────
//
// Step 4.23 lays the dispatch and AP accounting; full per-skill logic
// (target validation, AoE, status application by skill key) lands with
// the skill catalog later in Phase 4-D / 4-E.

const applyUseSkill = (
  state: BattleState,
  actor: Actor,
  action: UseSkillAction,
): ApplyResult => {
  // Cooldown check — the catalog drives durations; default cooldown 0.
  const cd = actor.cooldowns[action.skillId] ?? 0;
  if (cd > 0) {
    throw new EngineError("INSUFFICIENT_AP", "Skill on cooldown", {
      skillId: action.skillId,
      cd,
    });
  }
  const cost = apCost(state, action);
  requireAp(actor, cost);
  // Spend AP, set 1-turn cooldown so the same skill can't double-fire
  // within a turn. Real values come from the skill catalog later.
  const next = mutateActor(state, actor.id, (a) => ({
    ...a,
    stats: { ...a.stats, ap: a.stats.ap - cost },
    cooldowns: { ...a.cooldowns, [action.skillId]: 1 },
  }));
  // No event emitted yet — replay still works because the state diff
  // (AP + cooldown) is captured on the actor.
  void action;
  return { state: next, events: [] };
};

// ── Defend ────────────────────────────────────────────────────────────

const applyDefend = (
  state: BattleState,
  actor: Actor,
  action: DefendAction,
): ApplyResult => {
  const cost = apCost(state, action);
  requireAp(actor, cost);
  // Defending consumes AP and grants a 1-turn `stagger`-resistant buff.
  // We model this with a synthetic status of kind `aether_surge` at low
  // potency until the full status system lands; it's already in the
  // enum.
  const buff: StatusEffect = {
    kind: "aether_surge",
    turns: 1,
    potency: 0,
    source: actor.id,
  };
  const next = mutateActor(state, actor.id, (a) => ({
    ...a,
    stats: { ...a.stats, ap: a.stats.ap - cost },
    statuses: [...a.statuses.filter((s) => !(s.kind === buff.kind && s.source === actor.id)), buff],
  }));
  return { state: next, events: [] };
};

// ── End turn ──────────────────────────────────────────────────────────

const applyEndTurn = (
  state: BattleState,
  actor: Actor,
  _action: EndTurnAction,
): ApplyResult => {
  // 1. Emit `turn_ended` and clear the active pointer.
  const turnEnded: Event = {
    type: "turn_ended",
    t: state.log.length,
    turn: state.turn,
    side: actor.side,
    actorId: actor.id,
  };
  const working: BattleState = appendLog({ ...state, activeActorId: null }, [turnEnded]);

  // 2. Hand off to the rotation/status orchestrator which ticks the
  //    outgoing actor's statuses, picks the next actor, refreshes AP,
  //    and may declare victory/defeat/draw.
  const rotated = endTurn(working, actor.id);
  return {
    state: rotated.state,
    events: [turnEnded, ...rotated.events],
  };
};

// ── Internals ─────────────────────────────────────────────────────────

const mustFindActor = (state: BattleState, id: ActorId): Actor => {
  for (const a of state.actors) {
    if (a.id === id) return a;
  }
  throw new EngineError("ACTOR_NOT_FOUND", `actor '${id}' not in battle`, { id });
};

const mutateActor = (
  state: BattleState,
  id: ActorId,
  fn: (a: Actor) => Actor,
): BattleState => ({
  ...state,
  actors: state.actors.map((a) => (a.id === id ? fn(a) : a)),
});

const appendLog = (state: BattleState, events: readonly Event[]): BattleState => ({
  ...state,
  log: [...state.log, ...events],
});

const cloneActor = (a: Actor): Actor => ({
  ...a,
  stats: { ...a.stats },
  pos: { ...a.pos },
  statuses: [...a.statuses],
  skills: [...a.skills],
  cooldowns: { ...a.cooldowns },
});

const coordKey = (c: Coord): string => `${String(c.q)},${String(c.r)}`;

const isAdjacent = (a: Coord, b: Coord): boolean => {
  for (const d of HEX_DIRS) {
    if (a.q + d.q === b.q && a.r + d.r === b.r) return true;
  }
  return false;
};

// ── Re-exports useful for tests / future phases ───────────────────────

export const __internals = {
  isAdjacent,
  coordKey,
  cloneActor,
  rangeReachable,
  sameCoord,
  nextInt,
};
