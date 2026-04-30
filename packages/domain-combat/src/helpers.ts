// Aetheria — combat helpers (pure functions).
//
// Step 4.22 deliverables:
//   - apCost(state, action)
//   - lineOfSight(state, from, to)
//   - rangeReachable(state, actor, apBudget?)
//   - elementAdvantage(attackerElement, defenderElement)
//   - resonanceCheck(state, kElement, recent)
//
// Pure: no I/O, no DB. Inputs are `BattleState` (or subsets), outputs
// are values. Engine code in 4.23+ wires these together.

import {
  ELEMENT_WHEEL,
  HEX_DIRS,
  hexDistance,
  sameCoord,
  type Action,
  type Actor,
  type ActorId,
  type BattleState,
  type Coord,
  type Element,
  type Tile,
} from "./types.js";

// ── apCost ────────────────────────────────────────────────────────────

/**
 * AP cost for an action against the current battle state. The engine
 * should subtract this from `actor.stats.ap` before applying the
 * action — actions whose cost exceeds the actor's AP are illegal.
 *
 * Reference (`docs/01_GAME_GUIDELINE.md` §6):
 *   - 3 AP per turn, banked AP cap 1 → max 4 in a turn.
 *   - Movement consumes 1 AP per `actor.stats.move` squares (rounded up).
 *     Water tiles double the per-step cost; ice halves it (skid).
 *   - Basic attack: 1 AP. Defend: 1 AP. End-turn: 0 AP.
 *   - Skills carry their own cost; default to 2 AP if unknown.
 */
export const apCost = (state: BattleState, action: Action): number => {
  switch (action.kind) {
    case "end_turn":
      return 0;
    case "defend":
      return 1;
    case "attack":
      return 1;
    case "use_skill":
      return SKILL_AP_COST[action.skillId] ?? 2;
    case "move": {
      const actor = findActor(state, action.actorId);
      if (!actor) return Infinity;
      const movePerAp = Math.max(1, actor.stats.move);
      // Walk the path adding terrain modifiers; sum, then divide by movePerAp.
      let weighted = 0;
      let prev = actor.pos;
      for (const step of action.path) {
        const tile = tileAt(state, step);
        weighted += stepCost(tile);
        prev = step;
      }
      void prev;
      return Math.ceil(weighted / movePerAp);
    }
  }
};

/** Per-step movement cost given the destination tile. */
const stepCost = (tile: Tile | null): number => {
  if (!tile) return 1;
  switch (tile.terrain) {
    case "water":
      return 2;
    case "ice":
      return 0.5;
    case "lava":
      return 2;
    case "stone":
    case "shrine":
    case "plain":
    case "forest":
      return 1;
    case "void":
    case "wall":
      return Number.POSITIVE_INFINITY;
  }
};

/** AP cost table for known skills. Unknown ids fall back to 2. */
const SKILL_AP_COST: Readonly<Record<string, number>> = {
  // Reserved for the catalog seeder; engine treats absence as 2.
};

// ── lineOfSight ───────────────────────────────────────────────────────

/**
 * True when a straight line from `from` to `to` (in axial hex space) is
 * not blocked by any `wall` or `void` tile. The line is sampled with
 * the standard cube-lerp algorithm at integer steps; intermediate hexes
 * (not the endpoints) are checked for blockers.
 */
export const lineOfSight = (state: BattleState, from: Coord, to: Coord): boolean => {
  if (sameCoord(from, to)) return true;
  const N = hexDistance(from, to);
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const c = roundHex(lerpHex(from, to, t));
    const tile = tileAt(state, c);
    if (!tile) return false; // outside the map = no LOS
    if (tile.terrain === "wall" || tile.terrain === "void") return false;
  }
  return true;
};

const lerpHex = (a: Coord, b: Coord, t: number): { x: number; y: number; z: number } => {
  const ax = a.q;
  const az = a.r;
  const ay = -ax - az;
  const bx = b.q;
  const bz = b.r;
  const by = -bx - bz;
  return {
    x: ax + (bx - ax) * t,
    y: ay + (by - ay) * t,
    z: az + (bz - az) * t,
  };
};

const roundHex = (c: { x: number; y: number; z: number }): Coord => {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x);
  const dy = Math.abs(ry - c.y);
  const dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
};

// ── rangeReachable ────────────────────────────────────────────────────

export interface ReachableTile {
  readonly q: number;
  readonly r: number;
  /** Total AP needed to reach this tile from the actor's current pos. */
  readonly cost: number;
}

/**
 * BFS-by-cost over hex neighbours. Returns every tile the actor can
 * reach using up to `apBudget` AP (default = the actor's current AP).
 * Walls/void/blocked-by-actor tiles are excluded; the actor's own tile
 * is included with cost 0.
 *
 * The output is suitable for highlighting "where can I move?" overlays.
 */
export const rangeReachable = (
  state: BattleState,
  actor: Actor,
  apBudget?: number,
): readonly ReachableTile[] => {
  const ap = apBudget ?? actor.stats.ap;
  if (ap <= 0) return [{ q: actor.pos.q, r: actor.pos.r, cost: 0 }];

  const movePerAp = Math.max(1, actor.stats.move);
  const tileMap = new Map<string, Tile>();
  for (const t of state.tiles) tileMap.set(coordKey(t), t);
  const blockers = new Set<string>();
  for (const a of state.actors) {
    if (a.defeated) continue;
    if (a.id === actor.id) continue;
    blockers.add(coordKey(a.pos));
  }

  const best = new Map<string, number>();
  best.set(coordKey(actor.pos), 0);

  // Dijkstra-lite: small fixed-size queue, sorted by frontier cost.
  interface Node {
    c: Coord;
    cost: number;
  }
  const frontier: Node[] = [{ c: actor.pos, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const cur = frontier.shift();
    if (!cur) break;
    if (cur.cost > ap) continue;
    for (const dir of HEX_DIRS) {
      const next: Coord = { q: cur.c.q + dir.q, r: cur.c.r + dir.r };
      const key = coordKey(next);
      const tile = tileMap.get(key);
      if (!tile) continue;
      const sc = stepCost(tile);
      if (!Number.isFinite(sc)) continue;
      if (blockers.has(key)) continue;
      const stepAp = sc / movePerAp;
      const total = cur.cost + stepAp;
      if (total > ap + 1e-9) continue;
      const prevBest = best.get(key);
      if (prevBest !== undefined && prevBest <= total + 1e-9) continue;
      best.set(key, total);
      frontier.push({ c: next, cost: total });
    }
  }

  const out: ReachableTile[] = [];
  for (const [key, cost] of best) {
    const [q, r] = key.split(",").map(Number) as [number, number];
    out.push({ q, r, cost: Math.ceil(cost - 1e-9) });
  }
  return out.sort((a, b) => a.cost - b.cost || a.q - b.q || a.r - b.r);
};

// ── elementAdvantage ──────────────────────────────────────────────────

/**
 * Multiplier applied to attack damage based on the element wheel.
 * Spec wheel: each element is **strong** against the next in cycle and
 * **weak** against the previous one.
 *
 *   strong vs next       → 1.25
 *   weak vs previous     → 0.75
 *   neutral / opposite   → 1.00
 *
 * "Opposite" (3 steps away on the 6-element wheel) is treated as
 * neutral by design — players who match opposites can lean on
 * resonance / status effects instead.
 */
export const elementAdvantage = (
  attacker: Element,
  defender: Element,
): number => {
  if (attacker === defender) return 1;
  const n = ELEMENT_WHEEL.length;
  const ai = ELEMENT_WHEEL.indexOf(attacker);
  const di = ELEMENT_WHEEL.indexOf(defender);
  if (ai < 0 || di < 0) return 1;
  const fwd = (di - ai + n) % n;
  if (fwd === 1) return 1.25;
  if (fwd === n - 1) return 0.75;
  return 1;
};

// ── resonanceCheck ────────────────────────────────────────────────────
//
// Resonance triggers when at least two distinct allied actors deal
// damage of the same element within the last `lookback` events. This
// rewards co-ordinated chains: e.g. ember mage → ember knight → +50 %
// AoE on the next hit. The engine decides what to do with the result.

export interface ResonanceMatch {
  readonly element: Element;
  readonly actors: readonly ActorId[];
  /** Recommended damage multiplier for the next strike. */
  readonly bonusMultiplier: number;
}

export const resonanceCheck = (
  state: BattleState,
  options?: { readonly lookback?: number },
): ResonanceMatch | null => {
  const lookback = options?.lookback ?? 4;
  const log = state.log;
  if (log.length === 0) return null;
  // Walk the tail of the log; collect attacker→element pairs.
  const tail = log.slice(Math.max(0, log.length - lookback));
  const byElement = new Map<Element, Set<ActorId>>();
  for (const ev of tail) {
    if (ev.type !== "damage_dealt") continue;
    const dmg = ev;
    const actor = findActor(state, dmg.attackerId);
    if (!actor || actor.defeated) continue;
    if (actor.side !== "player") continue; // resonance is a player buff for now
    let bucket = byElement.get(dmg.element);
    if (!bucket) {
      bucket = new Set<ActorId>();
      byElement.set(dmg.element, bucket);
    }
    bucket.add(dmg.attackerId);
  }
  for (const [element, attackers] of byElement) {
    if (attackers.size >= 2) {
      return {
        element,
        actors: [...attackers],
        bonusMultiplier: 1.5,
      };
    }
  }
  return null;
};

// ── Internals ─────────────────────────────────────────────────────────

const coordKey = (c: Coord): string => `${String(c.q)},${String(c.r)}`;

const tileAt = (state: BattleState, c: Coord): Tile | null => {
  for (const t of state.tiles) {
    if (t.q === c.q && t.r === c.r) return t;
  }
  return null;
};

const findActor = (state: BattleState, id: ActorId): Actor | null => {
  for (const a of state.actors) {
    if (a.id === id) return a;
  }
  return null;
};
