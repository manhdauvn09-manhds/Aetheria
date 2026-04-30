// Aetheria — combat state persistence.
//
// `serializeState(state)` returns a JSON-shaped value with a stable
// `schemaVersion`. `hydrate(json)` validates and rebuilds a typed
// `BattleState` with all the runtime types (RngState, etc.) intact.
//
// Why a separate persistence layer:
//   - The persisted shape is the contract used by `runs.snapshot`,
//     `save_states.payload`, the anti-cheat replay worker, and the
//     network. We want one deterministic shape regardless of how
//     internal types evolve. Bumping `schemaVersion` lets us migrate.
//   - Zod validation rejects garbage cleanly so callers don't reach
//     into half-rebuilt state. The same validation is reusable on the
//     server boundary in 4.27 once `combat.applyAction` is exposed.
//
// Stability:
//   - `serializeState` produces an object whose keys ALWAYS appear in
//     the same order. JSON.stringify on the result hashes
//     reproducibly across machines and runs (used for replay-hash
//     comparisons in 4.26).

import { z } from "zod";

import {
  BattlePhases,
  BattleTerrains,
  Elements,
  HEX_DIRS as _HEX_DIRS,
  Sides,
  Statuses,
  type Actor,
  type ActorId,
  type BattleConfig,
  type BattleState,
  type Event,
  type StatusEffect,
  type Tile,
} from "./types.js";
import type { RngState } from "./rng.js";

void _HEX_DIRS;

export const SCHEMA_VERSION = 1;

// ── Zod schemas ───────────────────────────────────────────────────────

const coordSchema = z.object({ q: z.number().int(), r: z.number().int() });

const tileSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
  terrain: z.enum(BattleTerrains),
  elev: z.number().int(),
  element: z.enum(Elements).optional(),
  tag: z.string().optional(),
});

const statusSchema = z.object({
  kind: z.enum(Statuses),
  turns: z.number().int().min(0),
  potency: z.number(),
  source: z.string().optional(),
});

const statsSchema = z.object({
  hp: z.number(),
  maxHp: z.number(),
  ap: z.number(),
  apRegen: z.number(),
  atk: z.number(),
  def: z.number(),
  spd: z.number(),
  move: z.number(),
});

const actorSchema = z.object({
  id: z.string(),
  side: z.enum(Sides),
  unit: z.string(),
  element: z.enum(Elements),
  stats: statsSchema,
  pos: coordSchema,
  facing: z.number().int().min(0).max(5),
  statuses: z.array(statusSchema),
  skills: z.array(z.string()),
  cooldowns: z.record(z.number().int().min(0)),
  defeated: z.boolean(),
});

const configSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  turnLimit: z.number().int().min(0),
  defaultApRegen: z.number().int().min(0),
});

const rngSchema = z.object({ seed: z.number().int().min(0) });

const baseEventFields = {
  t: z.number().int().min(0),
  cause: z.string().optional(),
};
const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("actor_moved"),
    ...baseEventFields,
    actorId: z.string(),
    from: coordSchema,
    to: coordSchema,
    path: z.array(coordSchema),
    apSpent: z.number(),
  }),
  z.object({
    type: z.literal("damage_dealt"),
    ...baseEventFields,
    attackerId: z.string(),
    targetId: z.string(),
    amount: z.number(),
    mitigated: z.number(),
    element: z.enum(Elements),
    crit: z.boolean(),
  }),
  z.object({
    type: z.literal("healed"),
    ...baseEventFields,
    sourceId: z.string(),
    targetId: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal("status_applied"),
    ...baseEventFields,
    sourceId: z.string(),
    targetId: z.string(),
    status: z.enum(Statuses),
    turns: z.number().int(),
    potency: z.number(),
  }),
  z.object({
    type: z.literal("status_expired"),
    ...baseEventFields,
    targetId: z.string(),
    status: z.enum(Statuses),
  }),
  z.object({
    type: z.literal("actor_defeated"),
    ...baseEventFields,
    actorId: z.string(),
    killerId: z.string().optional(),
  }),
  z.object({
    type: z.literal("resonance_triggered"),
    ...baseEventFields,
    actors: z.array(z.string()),
    element: z.enum(Elements),
    bonusMultiplier: z.number(),
  }),
  z.object({
    type: z.literal("turn_started"),
    ...baseEventFields,
    turn: z.number().int(),
    side: z.enum(Sides),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("turn_ended"),
    ...baseEventFields,
    turn: z.number().int(),
    side: z.enum(Sides),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("battle_ended"),
    ...baseEventFields,
    outcome: z.enum(["victory", "defeat", "draw"]),
    turns: z.number().int(),
  }),
]);

const battleStateSchema = z.object({
  battleId: z.string(),
  config: configSchema,
  tiles: z.array(tileSchema),
  actors: z.array(actorSchema),
  turn: z.number().int().min(1),
  phase: z.enum(BattlePhases),
  activeActorId: z.string().nullable(),
  rng: rngSchema,
  log: z.array(eventSchema),
});

const serializedSchema = z.object({
  schemaVersion: z.number().int().positive(),
  state: battleStateSchema,
});

// ── Public types ─────────────────────────────────────────────────────

export interface SerializedState {
  readonly schemaVersion: number;
  readonly state: BattleState;
}

// ── serializeState ────────────────────────────────────────────────────

/**
 * Project a `BattleState` into a stable JSON shape. The returned value
 * is plain data (no class instances, no functions) and ordered so
 * `JSON.stringify` produces a byte-stable result.
 */
export const serializeState = (state: BattleState): SerializedState => ({
  schemaVersion: SCHEMA_VERSION,
  state: {
    battleId: state.battleId,
    config: orderedConfig(state.config),
    tiles: state.tiles.map(orderedTile),
    actors: state.actors.map(orderedActor),
    turn: state.turn,
    phase: state.phase,
    activeActorId: state.activeActorId,
    rng: { seed: state.rng.seed },
    log: state.log.map(orderedEvent),
  },
});

// ── hydrate ───────────────────────────────────────────────────────────

export class HydrateError extends Error {
  constructor(
    public readonly issues: readonly { path: string; message: string }[],
  ) {
    super(`combat.hydrate: ${String(issues.length)} issue(s)`);
    this.name = "HydrateError";
  }
}

/**
 * Reverse `serializeState`. Throws `HydrateError` on shape mismatch.
 *
 * Migration: when `SCHEMA_VERSION` is bumped, add a step here that
 * rewrites older payloads forward. For now we only accept v1.
 */
export const hydrate = (raw: unknown): BattleState => {
  const parsed = serializedSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HydrateError(
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  }
  if (parsed.data.schemaVersion !== SCHEMA_VERSION) {
    throw new HydrateError([
      {
        path: "schemaVersion",
        message: `unsupported schemaVersion ${String(parsed.data.schemaVersion)} (expected ${String(SCHEMA_VERSION)})`,
      },
    ]);
  }
  // Zod-parsed shape is structurally identical to BattleState because
  // we've matched every field. Re-attach the readonly-friendly shape
  // by spreading; no runtime type adjustment needed.
  const s = parsed.data.state;
  const rng: RngState = { seed: s.rng.seed };
  return {
    battleId: s.battleId,
    config: { ...s.config },
    tiles: s.tiles.map((t): Tile => {
      const out: Tile = { q: t.q, r: t.r, terrain: t.terrain, elev: t.elev };
      if (t.element !== undefined) (out as { element?: Tile["element"] }).element = t.element;
      if (t.tag !== undefined) (out as { tag?: string }).tag = t.tag;
      return out;
    }),
    actors: s.actors.map((a): Actor => ({
      id: a.id,
      side: a.side,
      unit: a.unit,
      element: a.element,
      stats: { ...a.stats },
      pos: { ...a.pos },
      facing: a.facing,
      statuses: a.statuses.map((st): StatusEffect => {
        const out: StatusEffect = { kind: st.kind, turns: st.turns, potency: st.potency };
        if (st.source !== undefined) (out as { source?: ActorId }).source = st.source;
        return out;
      }),
      skills: [...a.skills],
      cooldowns: { ...a.cooldowns },
      defeated: a.defeated,
    })),
    turn: s.turn,
    phase: s.phase,
    activeActorId: s.activeActorId,
    rng,
    log: (s.log as unknown as Event[]).map(orderedEvent),
  };
};

/**
 * Convenience: `JSON.stringify(serializeState(state))`. Output is
 * byte-stable across runs given the same input.
 */
export const stringifyState = (state: BattleState): string =>
  JSON.stringify(serializeState(state));

/** Convenience: `hydrate(JSON.parse(json))` with friendlier errors. */
export const parseState = (json: string): BattleState => {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new HydrateError([
      { path: "(root)", message: e instanceof Error ? e.message : "invalid JSON" },
    ]);
  }
  return hydrate(raw);
};

// ── Ordering helpers (stable JSON) ───────────────────────────────────

const orderedConfig = (c: BattleConfig): BattleConfig => ({
  width: c.width,
  height: c.height,
  turnLimit: c.turnLimit,
  defaultApRegen: c.defaultApRegen,
});

const orderedTile = (t: Tile): Tile => ({
  q: t.q,
  r: t.r,
  terrain: t.terrain,
  elev: t.elev,
  ...(t.element !== undefined ? { element: t.element } : {}),
  ...(t.tag !== undefined ? { tag: t.tag } : {}),
});

const orderedActor = (a: Actor): Actor => ({
  id: a.id,
  side: a.side,
  unit: a.unit,
  element: a.element,
  stats: { ...a.stats },
  pos: { q: a.pos.q, r: a.pos.r },
  facing: a.facing,
  statuses: a.statuses.map((s) => ({ ...s })),
  skills: [...a.skills],
  cooldowns: orderedRecord(a.cooldowns),
  defeated: a.defeated,
});

const orderedRecord = <T,>(r: Readonly<Record<string, T>>): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const k of Object.keys(r).sort()) {
    out[k] = r[k] as T;
  }
  return out;
};

const orderedEvent = (e: Event): Event => {
  // Keep original property order via a literal — discriminator first,
  // common fields next, kind-specific fields last.
  switch (e.type) {
    case "actor_moved":
      return {
        type: "actor_moved",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        actorId: e.actorId,
        from: { ...e.from },
        to: { ...e.to },
        path: e.path.map((p) => ({ q: p.q, r: p.r })),
        apSpent: e.apSpent,
      };
    case "damage_dealt":
      return {
        type: "damage_dealt",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        attackerId: e.attackerId,
        targetId: e.targetId,
        amount: e.amount,
        mitigated: e.mitigated,
        element: e.element,
        crit: e.crit,
      };
    case "healed":
      return {
        type: "healed",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        sourceId: e.sourceId,
        targetId: e.targetId,
        amount: e.amount,
      };
    case "status_applied":
      return {
        type: "status_applied",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        sourceId: e.sourceId,
        targetId: e.targetId,
        status: e.status,
        turns: e.turns,
        potency: e.potency,
      };
    case "status_expired":
      return {
        type: "status_expired",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        targetId: e.targetId,
        status: e.status,
      };
    case "actor_defeated":
      return {
        type: "actor_defeated",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        actorId: e.actorId,
        ...(e.killerId !== undefined ? { killerId: e.killerId } : {}),
      };
    case "resonance_triggered":
      return {
        type: "resonance_triggered",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        actors: [...e.actors],
        element: e.element,
        bonusMultiplier: e.bonusMultiplier,
      };
    case "turn_started":
      return {
        type: "turn_started",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        turn: e.turn,
        side: e.side,
        actorId: e.actorId,
      };
    case "turn_ended":
      return {
        type: "turn_ended",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        turn: e.turn,
        side: e.side,
        actorId: e.actorId,
      };
    case "battle_ended":
      return {
        type: "battle_ended",
        t: e.t,
        ...(e.cause !== undefined ? { cause: e.cause } : {}),
        outcome: e.outcome,
        turns: e.turns,
      };
  }
};
