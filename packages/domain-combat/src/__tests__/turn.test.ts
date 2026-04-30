import { describe, expect, it } from "vitest";

import {
  applyAction,
  checkVictory,
  createBattle,
  endTurn,
  type Actor,
  type BattleState,
  type DamageDealtEvent,
  type StatusEffect,
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

const buildState = (actors: Actor[], over: Partial<BattleState> = {}): BattleState => ({
  ...createBattle({ battleId: "t", tiles: linearTiles(actors.length + 2), actors }),
  ...over,
});

// ── checkVictory ──────────────────────────────────────────────────────

describe("checkVictory", () => {
  it("returns null while both sides have live actors", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    expect(checkVictory(buildState([a, e]))).toBeNull();
  });

  it("returns 'victory' when every enemy is defeated", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      defeated: true,
      stats: { ...baseStats, hp: 0 },
    });
    expect(checkVictory(buildState([a, e]))).toBe("victory");
  });

  it("returns 'defeat' when every player is defeated", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      defeated: true,
      stats: { ...baseStats, hp: 0 },
    });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    expect(checkVictory(buildState([a, e]))).toBe("defeat");
  });

  it("returns 'draw' when state.turn exceeds turnLimit", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember" });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    const state = buildState([a, e], {
      turn: 6,
      config: { width: 8, height: 6, turnLimit: 5, defaultApRegen: 3 },
    });
    expect(checkVictory(state)).toBe("draw");
  });
});

// ── endTurn rotation ──────────────────────────────────────────────────

describe("endTurn rotation", () => {
  it("hands the turn from player to enemy in the same round", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, spd: 80 } });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, spd: 50 },
    });
    const state = createBattle({ battleId: "rot", tiles: linearTiles(3), actors: [a, e] });
    const r = applyAction(state, { kind: "end_turn", actorId: "a" });
    expect(r.state.turn).toBe(1);
    expect(r.state.phase).toBe("enemy_turn");
    expect(r.state.activeActorId).toBe("e");
  });

  it("wraps the round, increments turn, and refills AP", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, spd: 80, ap: 0 } });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, spd: 50, ap: 0 },
    });
    const state = createBattle({ battleId: "wrap", tiles: linearTiles(3), actors: [a, e] });
    // a ends → e becomes active
    const s1 = applyAction(state, { kind: "end_turn", actorId: "a" }).state;
    // e ends → wraps to a, turn 2
    const s2 = applyAction(s1, { kind: "end_turn", actorId: "e" }).state;
    expect(s2.turn).toBe(2);
    expect(s2.activeActorId).toBe("a");
    const incomingA = s2.actors.find((x) => x.id === "a");
    expect(incomingA?.stats.ap).toBe(3); // apRegen baseline (no banked carry)
  });

  it("banks at most +1 AP into the next turn", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, spd: 80, ap: 1 } });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, spd: 50 },
    });
    const state = createBattle({ battleId: "bank", tiles: linearTiles(3), actors: [a, e] });
    const s1 = applyAction(state, { kind: "end_turn", actorId: "a" }).state;
    const s2 = applyAction(s1, { kind: "end_turn", actorId: "e" }).state;
    const incomingA = s2.actors.find((x) => x.id === "a");
    expect(incomingA?.stats.ap).toBe(4); // 3 regen + 1 banked
  });

  it("decrements cooldowns on the outgoing actor", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      stats: { ...baseStats, spd: 80 },
      cooldowns: { fireball: 2, dash: 1 },
    });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    const state = createBattle({ battleId: "cd", tiles: linearTiles(3), actors: [a, e] });
    const s1 = applyAction(state, { kind: "end_turn", actorId: "a" }).state;
    const ax = s1.actors.find((x) => x.id === "a");
    expect(ax?.cooldowns).toEqual({ fireball: 1, dash: 0 });
  });

  it("declares victory + emits battle_ended when only player side remains", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, spd: 80 } });
    // Enemy already at 0 hp / defeated when end_turn fires.
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      defeated: true,
      stats: { ...baseStats, hp: 0 },
    });
    const state = createBattle({ battleId: "vic", tiles: linearTiles(3), actors: [a, e] });
    const r = applyAction(state, { kind: "end_turn", actorId: "a" });
    expect(r.state.phase).toBe("victory");
    expect(r.events.some((ev) => ev.type === "battle_ended")).toBe(true);
  });

  it("declares draw when turn limit is exceeded after wrap", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, spd: 80 } });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, spd: 50 },
    });
    const state = createBattle({
      battleId: "drw",
      tiles: linearTiles(3),
      actors: [a, e],
      config: { turnLimit: 1 },
    });
    const s1 = applyAction(state, { kind: "end_turn", actorId: "a" }).state;
    const r2 = applyAction(s1, { kind: "end_turn", actorId: "e" });
    expect(r2.state.phase).toBe("draw");
    expect(r2.events.some((ev) => ev.type === "battle_ended")).toBe(true);
  });
});

// ── Status ticking ────────────────────────────────────────────────────

describe("status ticking", () => {
  const burn = (turns: number, potency = 5): StatusEffect => ({ kind: "burn", turns, potency });
  const poison = (turns: number, potency = 4): StatusEffect => ({ kind: "poison", turns, potency });

  it("burn applies DOT and decrements its counter", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      stats: { ...baseStats, spd: 80, hp: 50, maxHp: 50 },
      statuses: [burn(2, 5)],
    });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    const state = createBattle({ battleId: "burn", tiles: linearTiles(3), actors: [a, e] });
    const r = applyAction(state, { kind: "end_turn", actorId: "a" });
    const burned = r.state.actors.find((x) => x.id === "a");
    expect(burned?.stats.hp).toBe(45); // 50 - 5
    expect(burned?.statuses).toEqual([{ kind: "burn", turns: 1, potency: 5 }]);
    const dmgEvent = r.events.find(
      (ev): ev is DamageDealtEvent => ev.type === "damage_dealt" && ev.targetId === "a",
    );
    expect(dmgEvent?.amount).toBe(5);
    expect(dmgEvent?.element).toBe("ember");
  });

  it("status with turns=1 expires and emits status_expired", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      stats: { ...baseStats, spd: 80 },
      statuses: [poison(1, 3)],
    });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    const state = createBattle({ battleId: "exp", tiles: linearTiles(3), actors: [a, e] });
    const r = applyAction(state, { kind: "end_turn", actorId: "a" });
    const ax = r.state.actors.find((x) => x.id === "a");
    expect(ax?.statuses).toEqual([]);
    expect(r.events.some((ev) => ev.type === "status_expired")).toBe(true);
  });

  it("DOT can kill the actor and emits actor_defeated", () => {
    const a = mkActor({
      id: "a",
      side: "player",
      element: "ember",
      stats: { ...baseStats, spd: 80, hp: 3, maxHp: 50 },
      statuses: [burn(2, 10)],
    });
    const e = mkActor({ id: "e", side: "enemy", element: "frost", pos: { q: 1, r: 0 } });
    const state = createBattle({ battleId: "kill-burn", tiles: linearTiles(3), actors: [a, e] });
    const r = applyAction(state, { kind: "end_turn", actorId: "a" });
    const killed = r.state.actors.find((x) => x.id === "a");
    expect(killed?.defeated).toBe(true);
    expect(killed?.stats.hp).toBe(0);
    expect(r.events.some((ev) => ev.type === "actor_defeated" && ev.actorId === "a")).toBe(true);
    // Last player down → defeat.
    expect(r.state.phase).toBe("defeat");
  });
});

// ── endTurn(state, actorId) called directly ───────────────────────────

describe("endTurn (direct)", () => {
  it("can be invoked by callers managing their own rotation", () => {
    const a = mkActor({ id: "a", side: "player", element: "ember", stats: { ...baseStats, spd: 80 } });
    const e = mkActor({
      id: "e",
      side: "enemy",
      element: "frost",
      pos: { q: 1, r: 0 },
      stats: { ...baseStats, spd: 50 },
    });
    const state = createBattle({ battleId: "direct", tiles: linearTiles(3), actors: [a, e] });
    // Skip applyAction; call endTurn directly with the outgoing actor id.
    const r = endTurn(state, "a");
    expect(r.state.activeActorId).toBe("e");
    expect(r.events.some((ev) => ev.type === "turn_started")).toBe(true);
  });
});
