import { describe, expect, it } from "vitest";

import {
  chance,
  makeRng,
  next,
  nextInt,
  pick,
  rollDice,
  seedFromString,
} from "../rng.js";

describe("rng", () => {
  it("is deterministic across instances with the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const r1 = next(a);
    const r2 = next(b);
    expect(r1.value).toBe(r2.value);
    expect(r1.state.seed).toBe(r2.state.seed);
  });

  it("produces values in [0, 1)", () => {
    let s = makeRng(0xdeadbeef);
    for (let i = 0; i < 1000; i++) {
      const r = next(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.state;
    }
  });

  it("nextInt is uniform within range bounds", () => {
    let s = makeRng(7);
    const counts = new Map<number, number>();
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const r = nextInt(s, 1, 6);
      s = r.state;
      counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(6);
    }
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const c = counts.get(face) ?? 0;
      expect(c).toBeGreaterThan(N * 0.1); // each face well above noise floor
      expect(c).toBeLessThan(N * 0.25);
    }
  });

  it("nextInt rejects invalid ranges", () => {
    expect(() => nextInt(makeRng(1), 5, 1)).toThrow();
    expect(() => nextInt(makeRng(1), 1.5, 5)).toThrow();
  });

  it("pick returns one of the items", () => {
    const items = ["a", "b", "c"] as const;
    let s = makeRng(123);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = pick(s, items);
      s = r.state;
      seen.add(r.value);
    }
    expect(seen).toEqual(new Set(items));
  });

  it("pick throws on empty array", () => {
    expect(() => pick(makeRng(1), [] as readonly string[])).toThrow();
  });

  it("rollDice sum is always within [n, n*sides]", () => {
    let s = makeRng(99);
    for (let i = 0; i < 200; i++) {
      const r = rollDice(s, 3, 6);
      s = r.state;
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(18);
    }
  });

  it("chance short-circuits for p<=0 and p>=1 without burning entropy", () => {
    const s0 = makeRng(123);
    const certain = chance(s0, 1);
    const impossible = chance(s0, 0);
    expect(certain.value).toBe(true);
    expect(impossible.value).toBe(false);
    // No state advance for guaranteed outcomes.
    expect(certain.state.seed).toBe(s0.seed);
    expect(impossible.state.seed).toBe(s0.seed);
  });

  it("chance(0.5) is roughly balanced", () => {
    let s = makeRng(2025);
    let trues = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const r = chance(s, 0.5);
      s = r.state;
      if (r.value) trues++;
    }
    expect(trues).toBeGreaterThan(N * 0.45);
    expect(trues).toBeLessThan(N * 0.55);
  });

  it("seedFromString is stable + collision-resistant for similar inputs", () => {
    expect(seedFromString("aetheria")).toBe(seedFromString("aetheria"));
    expect(seedFromString("aetheria")).not.toBe(seedFromString("Aetheria"));
    expect(seedFromString("run:1:turn:0")).not.toBe(seedFromString("run:1:turn:1"));
  });
});
