import { describe, expect, it } from "vitest";

import {
  HydrateError,
  SCHEMA_VERSION,
  applyAction,
  createBattle,
  hydrate,
  parseState,
  serializeState,
  stringifyState,
  type Actor,
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
  unit: "u",
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

describe("serializeState", () => {
  it("returns schemaVersion + state", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const state = createBattle({ battleId: "p1", tiles: linearTiles(3), actors: [a] });
    const out = serializeState(state);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.state.battleId).toBe("p1");
  });

  it("produces byte-stable JSON for the same input", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      cooldowns: { fireball: 1, dash: 0, blink: 2 },
    });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      cooldowns: { gust: 1, claw: 0 },
    });
    const state = createBattle({ battleId: "stable", tiles: linearTiles(3), actors: [a, e] });
    expect(stringifyState(state)).toBe(stringifyState(state));
  });

  it("sorts cooldown keys for stable output even when authored in different orders", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      cooldowns: { z: 1, a: 2, m: 0 },
    });
    const b = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      cooldowns: { a: 2, m: 0, z: 1 },
    });
    const sa = serializeState(createBattle({ battleId: "k", tiles: linearTiles(2), actors: [a] }));
    const sb = serializeState(createBattle({ battleId: "k", tiles: linearTiles(2), actors: [b] }));
    expect(JSON.stringify(sa)).toBe(JSON.stringify(sb));
  });
});

describe("hydrate", () => {
  it("round-trips serializeState → hydrate exactly", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, ap: 2 } });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    const state = createBattle({ battleId: "rt", tiles: linearTiles(3), actors: [a, e] });
    const recovered = hydrate(serializeState(state));
    expect(recovered).toEqual(state);
  });

  it("preserves a populated log across the round trip", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, atk: 60 } });
    const t = mkActor({
      id: "t",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, hp: 200, maxHp: 200, def: 10 },
    });
    let state = createBattle({ battleId: "log", seed: 7, tiles: linearTiles(3), actors: [a, t] });
    state = applyAction(state, { kind: "attack", actorId: "a", targetId: "t" }).state;
    state = applyAction(state, { kind: "end_turn", actorId: "a" }).state;
    const recovered = hydrate(serializeState(state));
    expect(recovered.log).toEqual(state.log);
    expect(recovered.actors).toEqual(state.actors);
    expect(recovered.rng.seed).toBe(state.rng.seed);
  });

  it("a hydrated state continues replay deterministically", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, atk: 60, ap: 4 } });
    const t = mkActor({
      id: "t",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, hp: 200, maxHp: 200, def: 10 },
    });
    const stateA = createBattle({ battleId: "rep", seed: 13, tiles: linearTiles(3), actors: [a, t] });
    const stateB = hydrate(serializeState(stateA));

    // Drive the same action sequence on both.
    let sa = stateA;
    let sb = stateB;
    for (let i = 0; i < 3; i++) {
      sa = applyAction(sa, { kind: "attack", actorId: "a", targetId: "t" }).state;
      sb = applyAction(sb, { kind: "attack", actorId: "a", targetId: "t" }).state;
    }
    expect(sa.log).toEqual(sb.log);
    expect(sa.actors).toEqual(sb.actors);
  });

  it("rejects unknown schemaVersion", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const state = createBattle({ battleId: "v", tiles: linearTiles(2), actors: [a] });
    const ser = serializeState(state);
    const tampered = { ...ser, schemaVersion: 999 };
    expect(() => hydrate(tampered)).toThrow(HydrateError);
    try {
      hydrate(tampered);
    } catch (err) {
      const e = err as HydrateError;
      expect(e.issues[0]?.path).toBe("schemaVersion");
    }
  });

  it("rejects malformed state shape with detailed issues", () => {
    expect(() => hydrate({ schemaVersion: 1, state: { broken: true } })).toThrow(HydrateError);
    try {
      hydrate({ schemaVersion: 1, state: { broken: true } });
    } catch (err) {
      const e = err as HydrateError;
      expect(e.issues.length).toBeGreaterThan(0);
    }
  });

  it("parseState handles invalid JSON cleanly", () => {
    expect(() => parseState("{not json")).toThrow(HydrateError);
  });

  it("parseState round-trips valid JSON", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const state = createBattle({ battleId: "j", tiles: linearTiles(3), actors: [a] });
    const recovered = parseState(stringifyState(state));
    expect(recovered).toEqual(state);
  });
});
