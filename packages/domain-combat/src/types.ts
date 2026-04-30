// Aetheria — combat domain types.
//
// Pure data shapes. No I/O, no DB. The combat engine (4.21–4.28)
// transforms `BattleState` into a new `BattleState` plus an `Event[]`
// stream. Both client and server import these types — the client uses
// them for input prediction, the server for authoritative validation.
//
// Spec source: `docs/01_GAME_GUIDELINE.md` §6 (Combat & Strategy).
//   - 6×8 hex map with elevation + elemental tiles
//   - 3 AP/turn, banked AP cap 1
//   - 6 elements (verdant/ember/frost/tide/sky/void) with weak/strong wheel
//   - 5 statuses (burn/freeze/poison/stagger/aether_surge)
//   - Resonance combo (matching elements chained → +50 % dmg, AoE)

import type { RngState } from "./rng.js";

// ── Enums ─────────────────────────────────────────────────────────────

export const Elements = [
  "verdant",
  "ember",
  "frost",
  "tide",
  "sky",
  "void",
] as const;
export type Element = (typeof Elements)[number];

export const Statuses = [
  "burn",
  "freeze",
  "poison",
  "stagger",
  "aether_surge",
] as const;
export type Status = (typeof Statuses)[number];

export const Sides = ["player", "enemy", "neutral"] as const;
export type Side = (typeof Sides)[number];

export const BattleTerrains = [
  "plain",      // baseline; no modifier
  "forest",     // -1 ranged accuracy
  "stone",      // +1 def stationary
  "water",      // -1 move per AP
  "ice",        // slide on move (skip stop)
  "lava",       // 1 dmg/turn while standing
  "void",       // impassable (gap)
  "shrine",     // +1 AP regen
  "wall",       // impassable (LOS blocker)
] as const;
export type BattleTerrain = (typeof BattleTerrains)[number];

export const BattlePhases = [
  "setup",      // pre-fight: spawn placement
  "player_turn",
  "enemy_turn",
  "resolving",  // animations / status ticks
  "victory",
  "defeat",
  "draw",
] as const;
export type BattlePhase = (typeof BattlePhases)[number];

// ── Coordinates & tiles ───────────────────────────────────────────────

/** Axial hex coord. Mirrors `@aetheria/game-assets` map tiles. */
export interface Coord {
  readonly q: number;
  readonly r: number;
}

export interface Tile {
  readonly q: number;
  readonly r: number;
  readonly terrain: BattleTerrain;
  /** Elevation in half-tile steps. ±1 affects melee dmg ±10 %. */
  readonly elev: number;
  /** Optional elemental imbuement on the tile (e.g. ember crater). */
  readonly element?: Element;
  /** Free-form tag, e.g. "altar", "rune_a". */
  readonly tag?: string;
}

// ── Statuses ──────────────────────────────────────────────────────────

export interface StatusEffect {
  readonly kind: Status;
  /** Turns left. Decremented at owner's `turn_started`. */
  readonly turns: number;
  /** Stat-block contribution; semantics interpreted by `combat.applyAction`. */
  readonly potency: number;
  /** Source actor id (for logs, retaliation, dispel rules). */
  readonly source?: ActorId;
}

// ── Actors ────────────────────────────────────────────────────────────

export type ActorId = string;
export type SkillId = string;

export interface ActorStats {
  readonly hp: number;
  readonly maxHp: number;
  /** Action points available this turn (0..4 — banked cap is 1 over base 3). */
  readonly ap: number;
  /** Base AP regenerated each `turn_started`. Default 3. */
  readonly apRegen: number;
  readonly atk: number;
  readonly def: number;
  /** Speed → turn order tiebreak; higher acts first. */
  readonly spd: number;
  /** Movement squares per AP (water/ice may modify). */
  readonly move: number;
}

export interface Actor {
  readonly id: ActorId;
  readonly side: Side;
  /** Catalog key — e.g. "kael", "ash_fiend". Drives sprite + base stats. */
  readonly unit: string;
  readonly element: Element;
  readonly stats: ActorStats;
  readonly pos: Coord;
  /** Facing 0..5 (six hex directions). */
  readonly facing: number;
  readonly statuses: readonly StatusEffect[];
  /** Skills the actor knows. Cooldowns track per-skill turn counters. */
  readonly skills: readonly SkillId[];
  readonly cooldowns: Readonly<Record<SkillId, number>>;
  /** True after `actor_defeated` event; kept in state for replay. */
  readonly defeated: boolean;
}

// ── Battle state ──────────────────────────────────────────────────────

export interface BattleConfig {
  readonly width: number;
  readonly height: number;
  /** Turn at which a draw is forced. 0 = unlimited. */
  readonly turnLimit: number;
  /** Initial party + enemy AP regen baseline (`actor.stats.apRegen`). */
  readonly defaultApRegen: number;
}

export interface BattleState {
  readonly battleId: string;
  readonly config: BattleConfig;
  readonly tiles: readonly Tile[];
  readonly actors: readonly Actor[];
  readonly turn: number;
  readonly phase: BattlePhase;
  /** Whose actor is currently acting. `null` during resolving / setup. */
  readonly activeActorId: ActorId | null;
  /** Authoritative RNG. Threaded through every randomised step. */
  readonly rng: RngState;
  /** Append-only event log; the renderer replays this for animations. */
  readonly log: readonly Event[];
}

// ── Actions (player input → engine) ───────────────────────────────────

export interface MoveAction {
  readonly kind: "move";
  readonly actorId: ActorId;
  /** Hex path the actor walks through, in order. The engine validates
   *  each step against `move`/`ap` budgets. */
  readonly path: readonly Coord[];
}

export interface AttackAction {
  readonly kind: "attack";
  readonly actorId: ActorId;
  readonly targetId: ActorId;
}

export interface UseSkillAction {
  readonly kind: "use_skill";
  readonly actorId: ActorId;
  readonly skillId: SkillId;
  readonly target?: ActorId | Coord;
}

export interface DefendAction {
  readonly kind: "defend";
  readonly actorId: ActorId;
}

export interface EndTurnAction {
  readonly kind: "end_turn";
  readonly actorId: ActorId;
}

export type Action =
  | MoveAction
  | AttackAction
  | UseSkillAction
  | DefendAction
  | EndTurnAction;

// ── Events (engine → consumer) ────────────────────────────────────────
//
// Every Event is emitted by `combat.applyAction`. Consumers (renderer,
// audit log, anti-cheat) read only the log — they never reach into
// `BattleState` fields directly. This keeps the replayable contract
// "events are the diff".

export interface BaseEvent {
  /** Monotonic timestamp index within the battle. Starts at 0. */
  readonly t: number;
  /** Optional originating action id for trace + dedup. */
  readonly cause?: string;
}

export interface ActorMovedEvent extends BaseEvent {
  readonly type: "actor_moved";
  readonly actorId: ActorId;
  readonly from: Coord;
  readonly to: Coord;
  readonly path: readonly Coord[];
  readonly apSpent: number;
}

export interface DamageDealtEvent extends BaseEvent {
  readonly type: "damage_dealt";
  readonly attackerId: ActorId;
  readonly targetId: ActorId;
  readonly amount: number;
  readonly mitigated: number;
  readonly element: Element;
  readonly crit: boolean;
}

export interface HealedEvent extends BaseEvent {
  readonly type: "healed";
  readonly sourceId: ActorId;
  readonly targetId: ActorId;
  readonly amount: number;
}

export interface StatusAppliedEvent extends BaseEvent {
  readonly type: "status_applied";
  readonly sourceId: ActorId;
  readonly targetId: ActorId;
  readonly status: Status;
  readonly turns: number;
  readonly potency: number;
}

export interface StatusExpiredEvent extends BaseEvent {
  readonly type: "status_expired";
  readonly targetId: ActorId;
  readonly status: Status;
}

export interface ActorDefeatedEvent extends BaseEvent {
  readonly type: "actor_defeated";
  readonly actorId: ActorId;
  readonly killerId?: ActorId;
}

export interface ResonanceTriggeredEvent extends BaseEvent {
  readonly type: "resonance_triggered";
  readonly actors: readonly ActorId[];
  readonly element: Element;
  readonly bonusMultiplier: number; // e.g. 1.5
}

export interface TurnStartedEvent extends BaseEvent {
  readonly type: "turn_started";
  readonly turn: number;
  readonly side: Side;
  readonly actorId: ActorId;
}

export interface TurnEndedEvent extends BaseEvent {
  readonly type: "turn_ended";
  readonly turn: number;
  readonly side: Side;
  readonly actorId: ActorId;
}

export interface BattleEndedEvent extends BaseEvent {
  readonly type: "battle_ended";
  readonly outcome: "victory" | "defeat" | "draw";
  readonly turns: number;
}

export type Event =
  | ActorMovedEvent
  | DamageDealtEvent
  | HealedEvent
  | StatusAppliedEvent
  | StatusExpiredEvent
  | ActorDefeatedEvent
  | ResonanceTriggeredEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | BattleEndedEvent;

// ── Element wheel ────────────────────────────────────────────────────
//
// Wheel relations per the spec — each element is **strong** against the
// next one in the cycle and **weak** against the previous one. The
// engine consumes this in 4.22 (`elementAdvantage`).

export const ELEMENT_WHEEL: readonly Element[] = [
  "verdant",
  "ember",
  "frost",
  "tide",
  "sky",
  "void",
];

// ── Helpers ───────────────────────────────────────────────────────────

/** True if the coords are equal (axial). */
export const sameCoord = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;

/** Six neighbour offsets (pointy-top axial). */
export const HEX_DIRS: readonly Coord[] = [
  { q: +1, r: 0 },
  { q: +1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: +1 },
  { q: 0, r: +1 },
];

/** Axial hex distance — half the L1 norm of the cube projection. */
export const hexDistance = (a: Coord, b: Coord): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
