// Aetheria — client-side hex pathfinder for in-combat movement.
//
// The engine's `applyMove` validates each step is adjacent, so we must
// send the full step-by-step path. This BFS walks from the actor's
// current position toward `target`, returns the shortest path as an
// array of `{q, r}` steps (excluding the start tile itself), or null
// if no path exists / target is too far for the actor's AP budget.
//
// Pure function — no engine import, no DOM. Drop-in helper.

import type { Actor, BattleState, Coord } from "@aetheria/domain-combat";

const HEX_DIRS: readonly Coord[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

const key = (c: Coord): string => `${c.q.toString()},${c.r.toString()}`;

/**
 * Find the shortest hex path from `actor.pos` to `target`, treating
 * occupied tiles (any non-defeated actor other than the mover) and
 * tiles with movement cost ≥ 99 (walls / impassable water in some
 * realms) as blockers.
 *
 * Returns an array of consecutive adjacent coords ending at `target`,
 * or null if unreachable. AP budget = `actor.stats.ap`; one step costs
 * 1 / `move` AP, so a hero with move=2 covers 2 tiles per AP.
 */
export const findHexPath = (
  state: BattleState,
  actor: Actor,
  target: Coord,
): Coord[] | null => {
  if (actor.pos.q === target.q && actor.pos.r === target.r) return [];

  // Build blockers + tile lookup
  const tiles = new Map<string, { terrain: string; cost: number }>();
  for (const t of state.tiles) {
    const c = (t as { cost?: number }).cost ?? defaultCost(t.terrain);
    tiles.set(key(t), { terrain: t.terrain, cost: c });
  }
  const blockers = new Set<string>();
  for (const a of state.actors) {
    if (a.defeated || a.id === actor.id) continue;
    blockers.add(key(a.pos));
  }
  // Target tile must exist + not be a blocker (an enemy on it would
  // not be a valid move destination; clicker probably meant attack).
  const targetKey = key(target);
  if (!tiles.has(targetKey)) return null;
  if (blockers.has(targetKey)) return null;
  const targetTile = tiles.get(targetKey)!;
  if (!Number.isFinite(targetTile.cost) || targetTile.cost >= 99) return null;

  const movePerAp = Math.max(1, actor.stats.move);
  const apBudget = actor.stats.ap;
  const maxSteps = movePerAp * apBudget;

  // BFS with parent tracking
  const start = actor.pos;
  const parents = new Map<string, Coord | null>();
  parents.set(key(start), null);
  const queue: Coord[] = [start];
  const distance = new Map<string, number>();
  distance.set(key(start), 0);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.q === target.q && cur.r === target.r) break;
    const d = distance.get(key(cur))!;
    if (d >= maxSteps) continue;
    for (const dir of HEX_DIRS) {
      const next: Coord = { q: cur.q + dir.q, r: cur.r + dir.r };
      const nk = key(next);
      if (parents.has(nk)) continue;
      const tile = tiles.get(nk);
      if (!tile) continue;
      if (!Number.isFinite(tile.cost) || tile.cost >= 99) continue;
      if (blockers.has(nk)) continue;
      parents.set(nk, cur);
      distance.set(nk, d + 1);
      queue.push(next);
    }
  }

  if (!parents.has(targetKey)) return null;

  // Reconstruct path from target back to start (exclude start).
  const path: Coord[] = [];
  let cur: Coord | null = target;
  while (cur !== null) {
    const p = parents.get(key(cur));
    if (p === null) break; // reached start
    path.unshift(cur);
    cur = p ?? null;
  }
  return path.length > 0 ? path : null;
};

/** Default per-terrain step cost (mirrors server-side default). */
const defaultCost = (terrain: string): number => {
  switch (terrain) {
    case "water": return 2;
    case "lava":  return 2;
    case "ice":   return 1;
    case "void":  return 99;
    case "wall":  return 99;
    default:      return 1;
  }
};
