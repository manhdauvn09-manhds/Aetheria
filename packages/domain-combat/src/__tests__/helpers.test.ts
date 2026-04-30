import { describe, expect, it } from "vitest";

import {
  apCost,
  elementAdvantage,
  lineOfSight,
  makeRng,
  rangeReachable,
  resonanceCheck,
  type Action,
  type Actor,
  type BattleState,
  type DamageDealtEvent,
  type Element,
  type Tile,
} from "../index.js";

// ── fixtures ──────────────────────────────────────────────────────────

const baseStats = {
  hp: 100,
  maxHp: 100,
  ap: 3,
  apRegen: 3,
  atk: 50,
  def: 30,
  spd: 50,
  move: 2,
};

const mkActor = (over: Partial<Actor> & Pick<Actor, "id" | "side" | "element">): Actor => ({
  unit: "test_unit",
  stats: baseStats,
  pos: { q: 0, r: 0 },
  facing: 0,
  statuses: [],
  skills: [],
  cooldowns: {},
  defeated: false,
  ...over,
});

const mkTile = (q: number, r: number, terrain: Tile["terrain"] = "plain"): Tile => ({
  q,
  r,
  terrain,
  elev: 0,
});

const mkState = (over: Partial<BattleState> & Pick<BattleState, "tiles" | "actors">): BattleState => ({
  battleId: "test",
  config: { width: 10, height: 10, turnLimit: 0, defaultApRegen: 3 },
  turn: 1,
  phase: "player_turn",
  activeActorId: null,
  rng: makeRng(1),
  log: [],
  ...over,
});

// ── apCost ────────────────────────────────────────────────────────────

describe("apCost", () => {
  it("end_turn is free; defend + attack are 1 AP each", () => {
    const actor = mkActor({ id: "a", side: "player", element: "ember" });
    const state = mkState({ actors: [actor], tiles: [mkTile(0, 0)] });
    expect(apCost(state, { kind: "end_turn", actorId: "a" })).toBe(0);
    expect(apCost(state, { kind: "defend", actorId: "a" })).toBe(1);
    expect(apCost(state, { kind: "attack", actorId: "a", targetId: "b" })).toBe(1);
  });

  it("unknown skills default to 2 AP", () => {
    const actor = mkActor({ id: "a", side: "player", element: "ember" });
    const state = mkState({ actors: [actor], tiles: [mkTile(0, 0)] });
    expect(
      apCost(state, { kind: "use_skill", actorId: "a", skillId: "unknown" }),
    ).toBe(2);
  });

  it("move costs 1 AP for `move` plain steps", () => {
    const actor = mkActor({ id: "a", side: "player", element: "ember" });
    // move=2 → 2 plain steps == 1 AP.
    const state = mkState({
      actors: [actor],
      tiles: [mkTile(0, 0), mkTile(1, 0), mkTile(2, 0)],
    });
    const a: Action = { kind: "move", actorId: "a", path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] };
    expect(apCost(state, a)).toBe(1);
  });

  it("water doubles step cost; ice halves it", () => {
    const actor = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, move: 1 } });
    const water = mkState({
      actors: [actor],
      tiles: [mkTile(0, 0), mkTile(1, 0, "water")],
    });
    expect(apCost(water, { kind: "move", actorId: "a", path: [{ q: 1, r: 0 }] })).toBe(2);

    const ice = mkState({
      actors: [actor],
      tiles: [mkTile(0, 0), mkTile(1, 0, "ice")],
    });
    expect(apCost(ice, { kind: "move", actorId: "a", path: [{ q: 1, r: 0 }] })).toBe(1);
  });

  it("move returns Infinity when actor is missing", () => {
    const state = mkState({ actors: [], tiles: [mkTile(0, 0)] });
    const cost = apCost(state, { kind: "move", actorId: "ghost", path: [] });
    expect(cost).toBe(Number.POSITIVE_INFINITY);
  });
});

// ── lineOfSight ───────────────────────────────────────────────────────

describe("lineOfSight", () => {
  it("clear straight line is visible", () => {
    const tiles: Tile[] = [];
    for (let q = 0; q <= 4; q++) tiles.push(mkTile(q, 0));
    const state = mkState({ actors: [], tiles });
    expect(lineOfSight(state, { q: 0, r: 0 }, { q: 4, r: 0 })).toBe(true);
  });

  it("a wall on the path blocks", () => {
    const tiles: Tile[] = [];
    for (let q = 0; q <= 4; q++) tiles.push(mkTile(q, 0));
    tiles[2] = mkTile(2, 0, "wall");
    const state = mkState({ actors: [], tiles });
    expect(lineOfSight(state, { q: 0, r: 0 }, { q: 4, r: 0 })).toBe(false);
  });

  it("void tiles block too", () => {
    const tiles: Tile[] = [];
    for (let q = 0; q <= 4; q++) tiles.push(mkTile(q, 0));
    tiles[2] = mkTile(2, 0, "void");
    const state = mkState({ actors: [], tiles });
    expect(lineOfSight(state, { q: 0, r: 0 }, { q: 4, r: 0 })).toBe(false);
  });

  it("same coord is trivially visible", () => {
    const state = mkState({ actors: [], tiles: [mkTile(0, 0)] });
    expect(lineOfSight(state, { q: 0, r: 0 }, { q: 0, r: 0 })).toBe(true);
  });

  it("missing intermediate tile blocks (off-map)", () => {
    const state = mkState({
      actors: [],
      tiles: [mkTile(0, 0), mkTile(2, 0)], // gap at (1,0)
    });
    expect(lineOfSight(state, { q: 0, r: 0 }, { q: 2, r: 0 })).toBe(false);
  });
});

// ── rangeReachable ────────────────────────────────────────────────────

describe("rangeReachable", () => {
  it("returns just the actor's tile when AP is 0", () => {
    const actor = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, ap: 0 } });
    const state = mkState({ actors: [actor], tiles: [mkTile(0, 0), mkTile(1, 0)] });
    const reach = rangeReachable(state, actor);
    expect(reach).toEqual([{ q: 0, r: 0, cost: 0 }]);
  });

  it("expands across plain tiles within budget", () => {
    const actor = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, ap: 1, move: 1 } });
    // Cluster of 3 tiles in a line; from (0,0) we can reach (1,0) at cost 1, not (2,0).
    const state = mkState({
      actors: [actor],
      tiles: [mkTile(0, 0), mkTile(1, 0), mkTile(2, 0)],
    });
    const reach = rangeReachable(state, actor);
    const keys = reach.map((r) => `${String(r.q)},${String(r.r)}`);
    expect(keys).toContain("0,0");
    expect(keys).toContain("1,0");
    expect(keys).not.toContain("2,0");
  });

  it("walls and other actors are blockers", () => {
    const actor = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      stats: { ...baseStats, ap: 3, move: 1 },
    });
    const blocker = mkActor({ id: "b", side: "enemy", element: "void", pos: { q: 1, r: 0 } });
    const state = mkState({
      actors: [actor, blocker],
      tiles: [
        mkTile(0, 0),
        mkTile(1, 0), // blocker stands here
        mkTile(2, 0, "wall"),
        mkTile(0, 1),
        mkTile(1, 1),
      ],
    });
    const reach = rangeReachable(state, actor);
    const keys = new Set(reach.map((r) => `${String(r.q)},${String(r.r)}`));
    expect(keys.has("1,0")).toBe(false); // blocker
    expect(keys.has("2,0")).toBe(false); // wall
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("0,1")).toBe(true);
  });
});

// ── elementAdvantage ──────────────────────────────────────────────────

describe("elementAdvantage", () => {
  it("matching element is neutral", () => {
    expect(elementAdvantage("ember", "ember")).toBe(1);
  });

  it("strong→next is 1.25", () => {
    // ember → frost (next on the wheel) is strong
    expect(elementAdvantage("ember", "frost")).toBe(1.25);
    expect(elementAdvantage("verdant", "ember")).toBe(1.25);
    expect(elementAdvantage("void", "verdant")).toBe(1.25); // wraps
  });

  it("weak→prev is 0.75", () => {
    expect(elementAdvantage("frost", "ember")).toBe(0.75);
    expect(elementAdvantage("verdant", "void")).toBe(0.75); // wraps
  });

  it("opposite element (3 steps) is neutral", () => {
    // verdant↔tide are 3 steps apart on the wheel
    expect(elementAdvantage("verdant", "tide")).toBe(1);
    expect(elementAdvantage("tide", "verdant")).toBe(1);
  });

  it("unknown element falls back to neutral", () => {
    // Pass an off-wheel string via cast; the helper short-circuits to 1.
    const off = "mystery" as unknown as Element;
    expect(elementAdvantage("ember", off)).toBe(1);
  });
});

// ── resonanceCheck ────────────────────────────────────────────────────

describe("resonanceCheck", () => {
  it("returns null on empty log", () => {
    const state = mkState({ actors: [], tiles: [] });
    expect(resonanceCheck(state)).toBeNull();
  });

  it("triggers when 2 distinct allies hit with the same element in the lookback window", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const b = mkActor({ id: "b", side: "player", element: "ember" });
    const log: DamageDealtEvent[] = [
      {
        type: "damage_dealt",
        t: 0,
        attackerId: "a",
        targetId: "z",
        amount: 10,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
      {
        type: "damage_dealt",
        t: 1,
        attackerId: "b",
        targetId: "z",
        amount: 12,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
    ];
    const state = mkState({ actors: [a, b], tiles: [], log });
    const r = resonanceCheck(state);
    expect(r).not.toBeNull();
    expect(r?.element).toBe("ember");
    expect(r?.actors).toHaveLength(2);
    expect(r?.actors).toContain("a");
    expect(r?.actors).toContain("b");
    expect(r?.bonusMultiplier).toBe(1.5);
  });

  it("does not trigger when only one attacker hits with the element", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const log: DamageDealtEvent[] = [
      {
        type: "damage_dealt",
        t: 0,
        attackerId: "a",
        targetId: "z",
        amount: 10,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
      {
        type: "damage_dealt",
        t: 1,
        attackerId: "a",
        targetId: "z",
        amount: 11,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
    ];
    const state = mkState({ actors: [a], tiles: [], log });
    expect(resonanceCheck(state)).toBeNull();
  });

  it("ignores enemy attacks (player-only resonance for now)", () => {
    const a = mkActor({ id: "a", side: "enemy", element: "ember" });
    const b = mkActor({ id: "b", side: "enemy", element: "ember" });
    const log: DamageDealtEvent[] = [
      {
        type: "damage_dealt",
        t: 0,
        attackerId: "a",
        targetId: "z",
        amount: 10,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
      {
        type: "damage_dealt",
        t: 1,
        attackerId: "b",
        targetId: "z",
        amount: 12,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
    ];
    const state = mkState({ actors: [a, b], tiles: [], log });
    expect(resonanceCheck(state)).toBeNull();
  });

  it("respects the lookback window", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const b = mkActor({ id: "b", side: "player", element: "ember" });
    const log: DamageDealtEvent[] = [
      {
        type: "damage_dealt",
        t: 0,
        attackerId: "a",
        targetId: "z",
        amount: 10,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
      // Five irrelevant entries between the two ember hits.
      ...[1, 2, 3, 4, 5].map(
        (i): DamageDealtEvent => ({
          type: "damage_dealt",
          t: i,
          attackerId: "a",
          targetId: "z",
          amount: 1,
          mitigated: 0,
          element: "frost",
          crit: false,
        }),
      ),
      {
        type: "damage_dealt",
        t: 6,
        attackerId: "b",
        targetId: "z",
        amount: 12,
        mitigated: 0,
        element: "ember",
        crit: false,
      },
    ];
    const state = mkState({ actors: [a, b], tiles: [], log });
    // Default lookback (4) misses the early ember hit from `a`.
    expect(resonanceCheck(state)).toBeNull();
    // Wider lookback catches it.
    const wider = resonanceCheck(state, { lookback: 10 });
    expect(wider?.element).toBe("ember");
  });
});
