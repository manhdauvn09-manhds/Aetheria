import { describe, expect, it } from "vitest";

import {
  applyAction,
  createBattle,
  fnv1a64,
  hashState,
  replayActions,
  serializeState,
  verifyReplay,
  type Action,
  type Actor,
  type Tile,
} from "../index.js";

const baseStats = {
  hp: 100,
  maxHp: 100,
  ap: 4,
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

const fixture = () => {
  const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, atk: 60 } });
  const t = mkActor({
    id: "t",
    side: "enemy",
    element: "frost",
    pos: { q: 1, r: 0 },
    stats: { ...baseStats, hp: 200, maxHp: 200, def: 10 },
  });
  return {
    init: {
      battleId: "rep",
      seed: 7,
      tiles: linearTiles(3),
      actors: [a, t],
    },
  };
};

// ── fnv1a64 ──────────────────────────────────────────────────────────

describe("fnv1a64", () => {
  it("returns 16 hex chars", () => {
    expect(fnv1a64("aetheria")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for identical input", () => {
    expect(fnv1a64("hello")).toBe(fnv1a64("hello"));
  });

  it("differs for tiny input changes", () => {
    expect(fnv1a64("hello")).not.toBe(fnv1a64("Hello"));
    expect(fnv1a64("hello")).not.toBe(fnv1a64("hellp"));
    expect(fnv1a64("a")).not.toBe(fnv1a64("aa"));
  });

  it("hashes empty string deterministically", () => {
    expect(fnv1a64("")).toBe(fnv1a64(""));
  });
});

// ── hashState ─────────────────────────────────────────────────────────

describe("hashState", () => {
  it("matches when two states serialize identically", () => {
    const { init } = fixture();
    const sA = createBattle(init);
    const sB = createBattle(init);
    expect(hashState(sA)).toBe(hashState(sB));
  });

  it("diverges after one action", () => {
    const { init } = fixture();
    const before = createBattle(init);
    const after = applyAction(before, { kind: "attack", actorId: "a", targetId: "t" }).state;
    expect(hashState(before)).not.toBe(hashState(after));
  });
});

// ── replayActions ─────────────────────────────────────────────────────

describe("replayActions", () => {
  it("reproduces the same final state as direct applyAction stepping", () => {
    const { init } = fixture();
    const actions: Action[] = [
      { kind: "attack", actorId: "a", targetId: "t" },
      { kind: "attack", actorId: "a", targetId: "t" },
      { kind: "end_turn", actorId: "a" },
    ];
    let direct = createBattle(init);
    for (const action of actions) direct = applyAction(direct, action).state;
    const replayed = replayActions({ init, actions });
    expect(serializeState(replayed.state)).toEqual(serializeState(direct));
    expect(replayed.errors).toHaveLength(0);
    expect(replayed.hash).toBe(hashState(direct));
  });

  it("captures per-step EngineError without aborting", () => {
    const { init } = fixture();
    const actions: Action[] = [
      // out-of-range; tile (3,0) doesn't exist so the path step is invalid
      { kind: "move", actorId: "a", path: [{ q: 3, r: 0 }] },
      { kind: "attack", actorId: "a", targetId: "t" },
    ];
    const r = replayActions({ init, actions });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.index).toBe(0);
    expect(r.errors[0]?.code).toBe("INVALID_PATH");
    // The second action still ran, so the attacker's AP is decremented.
    const a = r.state.actors.find((x) => x.id === "a");
    expect(a?.stats.ap).toBeLessThan(baseStats.ap);
  });

  it("stops on first error when stopOnError=true", () => {
    const { init } = fixture();
    const actions: Action[] = [
      { kind: "move", actorId: "a", path: [{ q: 3, r: 0 }] },
      { kind: "attack", actorId: "a", targetId: "t" },
    ];
    const r = replayActions({ init, actions, stopOnError: true });
    expect(r.errors).toHaveLength(1);
    const a = r.state.actors.find((x) => x.id === "a");
    expect(a?.stats.ap).toBe(baseStats.ap); // untouched
  });

  it("hash is deterministic for the same init + actions", () => {
    const { init } = fixture();
    const actions: Action[] = [
      { kind: "attack", actorId: "a", targetId: "t" },
      { kind: "attack", actorId: "a", targetId: "t" },
    ];
    const a = replayActions({ init, actions });
    const b = replayActions({ init, actions });
    expect(a.hash).toBe(b.hash);
  });
});

// ── verifyReplay ──────────────────────────────────────────────────────

describe("verifyReplay", () => {
  it("returns ok=true when expectedHash matches", () => {
    const { init } = fixture();
    const actions: Action[] = [
      { kind: "attack", actorId: "a", targetId: "t" },
      { kind: "end_turn", actorId: "a" },
    ];
    const expected = replayActions({ init, actions }).hash;
    const r = verifyReplay({ init, actions, expectedHash: expected });
    expect(r.ok).toBe(true);
    expect(r.expected).toBe(r.actual);
  });

  it("returns ok=false when client lies about the final hash", () => {
    const { init } = fixture();
    const actions: Action[] = [
      { kind: "attack", actorId: "a", targetId: "t" },
    ];
    const r = verifyReplay({ init, actions, expectedHash: "0000000000000000" });
    expect(r.ok).toBe(false);
    expect(r.actual).not.toBe(r.expected);
  });

  it("returns ok=false when the action log was tampered with", () => {
    const { init } = fixture();
    // The "real" run: 1 attack.
    const truthful: Action[] = [{ kind: "attack", actorId: "a", targetId: "t" }];
    const truthfulHash = replayActions({ init, actions: truthful }).hash;
    // Client submits a *different* log but claims the same hash.
    const tampered: Action[] = [{ kind: "end_turn", actorId: "a" }];
    const r = verifyReplay({ init, actions: tampered, expectedHash: truthfulHash });
    expect(r.ok).toBe(false);
  });

  it("surfaces engine errors alongside the hash check", () => {
    const { init } = fixture();
    const actions: Action[] = [
      // illegal first move
      { kind: "move", actorId: "a", path: [{ q: 3, r: 0 }] },
    ];
    const expected = hashState(createBattle(init)); // no-op since the action errored
    const r = verifyReplay({ init, actions, expectedHash: expected });
    expect(r.ok).toBe(true); // state didn't change
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.code).toBe("INVALID_PATH");
  });
});
