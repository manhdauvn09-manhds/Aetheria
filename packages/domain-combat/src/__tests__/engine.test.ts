import { describe, expect, it } from "vitest";

import {
  EngineError,
  applyAction,
  createBattle,
  type Action,
  type Actor,
  type ActorMovedEvent,
  type Tile,
} from "../index.js";

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

const linearTiles = (n: number): Tile[] =>
  Array.from({ length: n }, (_, q) => ({ q, r: 0, terrain: "plain" as const, elev: 0 }));

const expectEngineError = (fn: () => unknown, code: string): void => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`expected EngineError(${code}) but no error was thrown`);
};

describe("createBattle", () => {
  it("derives a deterministic seed from the battleId when none is given", () => {
    const a = createBattle({ battleId: "rep-1", tiles: linearTiles(3), actors: [] });
    const b = createBattle({ battleId: "rep-1", tiles: linearTiles(3), actors: [] });
    expect(a.rng.seed).toBe(b.rng.seed);
  });

  it("explicit seed overrides the derived one", () => {
    const a = createBattle({ battleId: "x", seed: 42, tiles: linearTiles(2), actors: [] });
    expect(a.rng.seed).toBe(42 >>> 0);
  });

  it("starts with phase = player_turn and the highest-spd player active", () => {
    const fast = mkActor({ id: "fast", side: "player", element: "ember", stats: { ...baseStats, spd: 90 } });
    const slow = mkActor({ id: "slow", side: "player", element: "ember", pos: { q: 1, r: 0 }, stats: { ...baseStats, spd: 50 } });
    const enemy = mkActor({ id: "e1", side: "enemy", element: "frost", pos: { q: 2, r: 0 } });
    const state = createBattle({
      battleId: "init",
      tiles: linearTiles(5),
      actors: [slow, enemy, fast],
    });
    expect(state.phase).toBe("player_turn");
    expect(state.activeActorId).toBe("fast");
  });

  it("starts on enemy phase when firstTurn=enemy", () => {
    const enemy = mkActor({ id: "e1", side: "enemy", element: "frost", pos: { q: 2, r: 0 } });
    const state = createBattle({
      battleId: "enemy-first",
      firstTurn: "enemy",
      tiles: linearTiles(3),
      actors: [enemy],
    });
    expect(state.phase).toBe("enemy_turn");
    expect(state.activeActorId).toBe("e1");
  });
});

describe("applyAction", () => {
  it("rejects actions for actors that aren't active", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const b = mkActor({ id: "b", side: "player", element: "ember", pos: { q: 1, r: 0 } });
    const state = createBattle({ battleId: "x", tiles: linearTiles(3), actors: [a, b] });
    const wrong: Action = { kind: "end_turn", actorId: "b" };
    expect(() => applyAction(state, wrong)).toThrowError(EngineError);
  });

  it("throws BATTLE_OVER once phase is terminal", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const state = { ...createBattle({ battleId: "x", tiles: linearTiles(2), actors: [a] }), phase: "victory" as const };
    expect(() => applyAction(state, { kind: "end_turn", actorId: "a" })).toThrowError(EngineError);
  });

  describe("move", () => {
    it("walks a 2-step plain path for 1 AP, emits actor_moved, decrements AP", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, ap: 3, move: 2 } });
      const state = createBattle({ battleId: "m", tiles: linearTiles(3), actors: [a] });
      const result = applyAction(state, {
        kind: "move",
        actorId: "a",
        path: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
      });
      expect(result.events).toHaveLength(1);
      const ev = result.events[0] as ActorMovedEvent;
      expect(ev.type).toBe("actor_moved");
      expect(ev.to).toEqual({ q: 2, r: 0 });
      expect(ev.apSpent).toBe(1);
      const moved = result.state.actors.find((x) => x.id === "a");
      expect(moved?.pos).toEqual({ q: 2, r: 0 });
      expect(moved?.stats.ap).toBe(2);
    });

    it("rejects non-adjacent path steps", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const state = createBattle({ battleId: "m", tiles: linearTiles(5), actors: [a] });
      expectEngineError(
        () => applyAction(state, { kind: "move", actorId: "a", path: [{ q: 2, r: 0 }] }),
        "INVALID_PATH",
      );
    });

    it("rejects walking into another actor", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const b = mkActor({ id: "b", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
      const state = createBattle({ battleId: "m", tiles: linearTiles(3), actors: [a, b] });
      expectEngineError(
        () => applyAction(state, { kind: "move", actorId: "a", path: [{ q: 1, r: 0 }] }),
        "INVALID_PATH",
      );
    });

    it("rejects walking into a wall", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const tiles = linearTiles(3);
      tiles[1] = { q: 1, r: 0, terrain: "wall", elev: 0 };
      const state = createBattle({ battleId: "m", tiles, actors: [a] });
      expectEngineError(
        () => applyAction(state, { kind: "move", actorId: "a", path: [{ q: 1, r: 0 }] }),
        "INVALID_PATH",
      );
    });
  });

  describe("attack", () => {
    it("damages adjacent target, emits damage_dealt, bumps AP/HP", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, atk: 60 } });
      const t = mkActor({
        id: "t",
        side: "enemy",
        element: "frost",
        pos: { q: 1, r: 0 },
        stats: { ...baseStats, def: 20, hp: 80, maxHp: 80 },
      });
      const state = createBattle({ battleId: "atk", tiles: linearTiles(3), actors: [a, t], seed: 1 });
      const result = applyAction(state, { kind: "attack", actorId: "a", targetId: "t" });
      const dmg = result.events.find((e) => e.type === "damage_dealt")!;
      expect(dmg).toBeDefined();
      expect(dmg.attackerId).toBe("a");
      expect(dmg.targetId).toBe("t");
      expect(dmg.amount).toBeGreaterThan(0);
      expect(dmg.element).toBe("ember");
      const tgt = result.state.actors.find((x) => x.id === "t");
      expect(tgt?.stats.hp).toBe(80 - dmg.amount);
      const atk = result.state.actors.find((x) => x.id === "a");
      expect(atk?.stats.ap).toBe(2);
    });

    it("rejects out-of-range target", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const t = mkActor({ id: "t", side: "enemy", element: "frost", pos: { q: 3, r: 0 } });
      const state = createBattle({ battleId: "atk", tiles: linearTiles(5), actors: [a, t] });
      expectEngineError(
        () => applyAction(state, { kind: "attack", actorId: "a", targetId: "t" }),
        "OUT_OF_RANGE",
      );
    });

    it("emits actor_defeated when HP hits 0", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, atk: 999 } });
      const t = mkActor({
        id: "t",
        side: "enemy",
        element: "frost",
        pos: { q: 1, r: 0 },
        stats: { ...baseStats, hp: 5, maxHp: 5, def: 0 },
      });
      const state = createBattle({ battleId: "kill", tiles: linearTiles(3), actors: [a, t] });
      const result = applyAction(state, { kind: "attack", actorId: "a", targetId: "t" });
      expect(result.events.some((e) => e.type === "actor_defeated")).toBe(true);
      const tgt = result.state.actors.find((x) => x.id === "t");
      expect(tgt?.defeated).toBe(true);
      expect(tgt?.stats.hp).toBe(0);
    });
  });

  describe("end_turn / defend / use_skill", () => {
    it("end_turn emits turn_ended and clears activeActorId", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const state = createBattle({ battleId: "et", tiles: linearTiles(2), actors: [a] });
      const result = applyAction(state, { kind: "end_turn", actorId: "a" });
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.type).toBe("turn_ended");
      expect(result.state.activeActorId).toBeNull();
    });

    it("defend consumes AP and stamps a one-turn aether_surge buff", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const state = createBattle({ battleId: "df", tiles: linearTiles(2), actors: [a] });
      const result = applyAction(state, { kind: "defend", actorId: "a" });
      const ax = result.state.actors.find((x) => x.id === "a");
      expect(ax?.stats.ap).toBe(2);
      expect(ax?.statuses).toEqual([
        { kind: "aether_surge", turns: 1, potency: 0, source: "a" },
      ]);
    });

    it("use_skill spends AP and stamps a 1-turn cooldown", () => {
      const a = mkActor({ id: "a", side: "player", element: "ember" });
      const state = createBattle({ battleId: "sk", tiles: linearTiles(2), actors: [a] });
      const result = applyAction(state, { kind: "use_skill", actorId: "a", skillId: "fireball" });
      const ax = result.state.actors.find((x) => x.id === "a");
      expect(ax?.stats.ap).toBe(1); // 3 - 2 default
      expect(ax?.cooldowns.fireball).toBe(1);
    });
  });

  it("replay determinism: same battle + actions → same events", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      stats: { ...baseStats, ap: 4 },
    });
    const t = mkActor({
      id: "t",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, hp: 200, maxHp: 200, def: 10 },
    });
    const stateA = createBattle({ battleId: "replay", tiles: linearTiles(3), actors: [a, t], seed: 7 });
    const stateB = createBattle({ battleId: "replay", tiles: linearTiles(3), actors: [a, t], seed: 7 });
    const seq: Action[] = [
      { kind: "attack", actorId: "a", targetId: "t" },
      { kind: "attack", actorId: "a", targetId: "t" },
      { kind: "attack", actorId: "a", targetId: "t" },
    ];
    let sa = stateA;
    let sb = stateB;
    for (const action of seq) {
      sa = applyAction(sa, action).state;
      sb = applyAction(sb, action).state;
    }
    expect(sa.log).toEqual(sb.log);
    expect(sa.actors).toEqual(sb.actors);
  });
});
