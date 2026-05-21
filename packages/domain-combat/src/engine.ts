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
  type SkillId,
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
  | "INVALID_ACTION"
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

// ── Skill catalog (engine-local) ──────────────────────────────────────
// Pure data describing each skill's mechanics. Kept in the engine so
// replay is deterministic regardless of how the runtime wires actors'
// `skills[]` arrays.
//
// Effect kinds:
//   - "ranged_attack" → damages targeted enemy at range (range>1), uses
//                        attack damage formula × dmgMul.
//   - "heal"          → restores % of maxHp to targeted ally (or self).
//   - "self_buff"     → applies status to self (e.g. defense up).
//   - "ally_buff"     → applies status to targeted adjacent ally.

interface SkillSpec {
  readonly id: SkillId;
  readonly name: string;
  readonly apCost: number;
  readonly cooldown: number;
  readonly kind: "ranged_attack" | "heal" | "self_buff" | "ally_buff";
  readonly range: number;       // hex distance for target validation
  readonly dmgMul?: number;     // for ranged_attack
  readonly healPct?: number;    // for heal (fraction of target.maxHp)
  readonly statusKind?: StatusEffect["kind"];
  readonly statusTurns?: number;
  readonly statusPotency?: number;
}

const SKILL_CATALOG: Readonly<Record<string, SkillSpec>> = {
  power_strike: {
    id: "power_strike",
    name: "Power Strike",
    apCost: 2,
    cooldown: 1,
    kind: "ranged_attack",
    range: 2,
    dmgMul: 1.6,
  },
  // Ranged attack that ALSO applies a damage-over-time burn. Burn ticks
  // are handled by turn.tickStatuses — each tick deals `potency` raw
  // damage at the start of the target's turn until the counter expires.
  firebolt: {
    id: "firebolt",
    name: "Firebolt",
    apCost: 2,
    cooldown: 2,
    kind: "ranged_attack",
    range: 2,
    dmgMul: 1.2,
    statusKind: "burn",
    statusTurns: 2,
    statusPotency: 6,
  },
  // Ranged attack + poison DOT — slower stacking damage source.
  venom_dart: {
    id: "venom_dart",
    name: "Venom Dart",
    apCost: 2,
    cooldown: 2,
    kind: "ranged_attack",
    range: 2,
    dmgMul: 1.0,
    statusKind: "poison",
    statusTurns: 3,
    statusPotency: 4,
  },
  heal: {
    id: "heal",
    name: "Heal",
    apCost: 2,
    cooldown: 2,
    kind: "heal",
    range: 2,
    healPct: 0.35,
  },
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    apCost: 1,
    cooldown: 2,
    kind: "self_buff",
    range: 0,
    statusKind: "aether_surge",
    statusTurns: 2,
    statusPotency: 50,
  },
  bless: {
    id: "bless",
    name: "Bless",
    apCost: 2,
    cooldown: 2,
    kind: "ally_buff",
    range: 1,
    statusKind: "aether_surge",
    statusTurns: 2,
    statusPotency: 30,
  },
};

/** Public lookup so the runtime can validate skill IDs at synth time. */
export const findSkillSpec = (id: string): SkillSpec | undefined => SKILL_CATALOG[id];

const applyUseSkill = (
  state: BattleState,
  actor: Actor,
  action: UseSkillAction,
): ApplyResult => {
  // Skill must be in catalog AND in the actor's known skills.
  const spec = SKILL_CATALOG[action.skillId];
  if (!spec) {
    throw new EngineError("INVALID_ACTION", "Unknown skill id", { skillId: action.skillId });
  }
  if (!actor.skills.includes(action.skillId)) {
    throw new EngineError("INVALID_ACTION", "Actor does not know this skill", {
      actorId: actor.id, skillId: action.skillId,
    });
  }
  // Cooldown check
  const cd = actor.cooldowns[action.skillId] ?? 0;
  if (cd > 0) {
    throw new EngineError("INSUFFICIENT_AP", "Skill on cooldown", {
      skillId: action.skillId, cd,
    });
  }
  requireAp(actor, spec.apCost);

  // Resolve target by skill kind
  let targetActor: Actor | undefined;
  if (spec.kind === "ranged_attack") {
    if (typeof action.target !== "string") {
      throw new EngineError("INVALID_ACTION", "Skill requires actor target", { skillId: spec.id });
    }
    targetActor = mustFindActor(state, action.target);
    if (targetActor.side === actor.side) {
      throw new EngineError("INVALID_ACTION", "Skill target must be enemy", { skillId: spec.id });
    }
    if (targetActor.defeated) {
      throw new EngineError("ALREADY_DEFEATED", "Target is defeated", { targetId: targetActor.id });
    }
    const dist = hexDistance(actor.pos, targetActor.pos);
    if (dist > spec.range) {
      throw new EngineError("OUT_OF_RANGE", "Target out of skill range", { dist, range: spec.range });
    }
  } else if (spec.kind === "heal" || spec.kind === "ally_buff") {
    if (typeof action.target !== "string") {
      // Self-target heal/buff is allowed if no target passed
      targetActor = actor;
    } else {
      targetActor = mustFindActor(state, action.target);
      if (targetActor.side !== actor.side) {
        throw new EngineError("INVALID_ACTION", "Skill target must be ally", { skillId: spec.id });
      }
      if (targetActor.defeated) {
        throw new EngineError("ALREADY_DEFEATED", "Target is defeated", { targetId: targetActor.id });
      }
      const dist = hexDistance(actor.pos, targetActor.pos);
      if (dist > spec.range) {
        throw new EngineError("OUT_OF_RANGE", "Target out of skill range", { dist, range: spec.range });
      }
    }
  } else {
    // self_buff
    targetActor = actor;
  }

  const events: Event[] = [];
  let next = state;

  if (spec.kind === "ranged_attack") {
    // Reuse attack damage formula × dmgMul. No element advantage stacking
    // for now — skills inherit the actor's element.
    const tgt = targetActor!;
    const base = Math.max(1, actor.stats.atk - tgt.stats.def);
    let rng = state.rng;
    const v = rollDice(rng, 1, 4);
    rng = v.state;
    const variance = 0.85 + (v.value - 1) * 0.1;
    const advantage = elementAdvantage(actor.element, tgt.element);
    const c = chance(rng, 0.05);
    rng = c.state;
    const critMul = c.value ? 1.5 : 1;
    const damage = Math.max(1, Math.round(base * variance * advantage * critMul * (spec.dmgMul ?? 1)));
    const newHp = Math.max(0, tgt.stats.hp - damage);
    events.push({
      type: "damage_dealt",
      t: state.log.length + events.length,
      attackerId: actor.id,
      targetId: tgt.id,
      amount: damage,
      mitigated: 0,
      element: actor.element,
      crit: c.value,
    } satisfies DamageDealtEvent);
    if (newHp === 0) {
      events.push({
        type: "actor_defeated",
        t: state.log.length + events.length,
        actorId: tgt.id,
        killerId: actor.id,
      } satisfies ActorDefeatedEvent);
    }
    next = mutateActor(next, tgt.id, (a) => {
      const updated: Actor = {
        ...a,
        stats: { ...a.stats, hp: newHp },
        defeated: newHp === 0,
      };
      // If the skill specifies a status (e.g. firebolt → burn,
      // venom_dart → poison) and the target survived, apply it. The
      // existing turn.tickStatuses handler will DOT them on their next
      // turn boundary.
      if (newHp > 0 && spec.statusKind && spec.statusTurns && spec.statusPotency !== undefined) {
        const incoming: StatusEffect = {
          kind: spec.statusKind,
          turns: spec.statusTurns,
          potency: spec.statusPotency,
          source: actor.id,
        };
        // Refresh existing stack from the same source rather than pile up
        const filtered = a.statuses.filter(
          (s) => !(s.kind === incoming.kind && s.source === incoming.source),
        );
        updated.statuses = [...filtered, incoming];
      }
      return updated;
    });
    // Emit status_applied event if a status landed (target still alive).
    if (newHp > 0 && spec.statusKind && spec.statusTurns && spec.statusPotency !== undefined) {
      events.push({
        type: "status_applied",
        t: state.log.length + events.length,
        targetId: tgt.id,
        status: spec.statusKind,
        turns: spec.statusTurns,
        potency: spec.statusPotency,
        sourceId: actor.id,
      });
    }
    next = { ...next, rng };
  } else if (spec.kind === "heal") {
    const tgt = targetActor!;
    const amount = Math.max(1, Math.round(tgt.stats.maxHp * (spec.healPct ?? 0.3)));
    const newHp = Math.min(tgt.stats.maxHp, tgt.stats.hp + amount);
    const actualHealed = newHp - tgt.stats.hp;
    events.push({
      type: "healed",
      t: state.log.length + events.length,
      targetId: tgt.id,
      amount: actualHealed,
      sourceId: actor.id,
    });
    next = mutateActor(next, tgt.id, (a) => ({
      ...a,
      stats: { ...a.stats, hp: newHp },
    }));
  } else if (spec.kind === "self_buff" || spec.kind === "ally_buff") {
    const tgt = targetActor!;
    const buff: StatusEffect = {
      kind: spec.statusKind ?? "aether_surge",
      turns: spec.statusTurns ?? 1,
      potency: spec.statusPotency ?? 0,
      source: actor.id,
    };
    events.push({
      type: "status_applied",
      t: state.log.length + events.length,
      targetId: tgt.id,
      status: buff.kind,
      turns: buff.turns,
      potency: buff.potency,
      sourceId: actor.id,
    });
    next = mutateActor(next, tgt.id, (a) => ({
      ...a,
      statuses: [...a.statuses.filter((s) => !(s.kind === buff.kind && s.source === actor.id)), buff],
    }));
  }

  // Spend AP + set cooldown on the caster
  next = mutateActor(next, actor.id, (a) => ({
    ...a,
    stats: { ...a.stats, ap: a.stats.ap - spec.apCost },
    cooldowns: { ...a.cooldowns, [spec.id]: spec.cooldown },
  }));

  return { state: appendLog(next, events), events };
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
