import { describe, expect, it } from "vitest";

import {
  MAX_LEVEL,
  MIN_LEVEL,
  XP_BASE,
  XP_EXPONENT,
  levelFromTotalXp,
  xpForLevel,
  xpToReach,
} from "../curve.js";

describe("curve / xpForLevel", () => {
  it("matches the spec formula floor(50 * n^1.85)", () => {
    for (let n = MIN_LEVEL; n < MAX_LEVEL; n += 1) {
      expect(xpForLevel(n)).toBe(Math.floor(XP_BASE * Math.pow(n, XP_EXPONENT)));
    }
  });

  it("anchors at level 1 = 50", () => {
    expect(xpForLevel(1)).toBe(50);
  });

  it("is strictly monotonically increasing across the campaign range", () => {
    let prev = xpForLevel(1);
    for (let n = 2; n < MAX_LEVEL; n += 1) {
      const curr = xpForLevel(n);
      expect(curr).toBeGreaterThan(prev);
      prev = curr;
    }
  });

  it("returns Infinity at MAX_LEVEL (no further progression)", () => {
    expect(xpForLevel(MAX_LEVEL)).toBe(Number.POSITIVE_INFINITY);
  });

  it("rejects out-of-range levels", () => {
    expect(() => xpForLevel(0)).toThrow(RangeError);
    expect(() => xpForLevel(MAX_LEVEL + 1)).toThrow(RangeError);
    expect(() => xpForLevel(1.5)).toThrow(RangeError);
    expect(() => xpForLevel(Number.NaN)).toThrow(RangeError);
  });

  it("returns integer values only", () => {
    for (let n = MIN_LEVEL; n < MAX_LEVEL; n += 1) {
      expect(Number.isInteger(xpForLevel(n))).toBe(true);
    }
  });
});

describe("curve / xpToReach", () => {
  it("is 0 at MIN_LEVEL", () => {
    expect(xpToReach(MIN_LEVEL)).toBe(0);
  });

  it("equals xpForLevel(1) at level 2", () => {
    expect(xpToReach(2)).toBe(xpForLevel(1));
  });

  it("matches a manual cumulative sum", () => {
    let acc = 0;
    for (let n = MIN_LEVEL; n < MAX_LEVEL; n += 1) {
      acc += xpForLevel(n);
      expect(xpToReach(n + 1)).toBe(acc);
    }
  });

  it("rejects out-of-range levels", () => {
    expect(() => xpToReach(0)).toThrow(RangeError);
    expect(() => xpToReach(MAX_LEVEL + 1)).toThrow(RangeError);
  });
});

describe("curve / levelFromTotalXp", () => {
  it("totalXp = 0 → level 1, 0 banked", () => {
    expect(levelFromTotalXp(0)).toEqual({ level: 1, xpIntoLevel: 0 });
  });

  it("totalXp just below threshold → still previous level", () => {
    const need = xpToReach(5);
    expect(levelFromTotalXp(need - 1)).toEqual({
      level: 4,
      xpIntoLevel: need - 1 - xpToReach(4),
    });
  });

  it("totalXp == threshold → next level, 0 banked", () => {
    const need = xpToReach(7);
    expect(levelFromTotalXp(need)).toEqual({ level: 7, xpIntoLevel: 0 });
  });

  it("round-trips xpToReach for every level", () => {
    for (let n = MIN_LEVEL; n <= MAX_LEVEL; n += 1) {
      const total = xpToReach(n);
      const r = levelFromTotalXp(total);
      expect(r.level).toBe(n);
      expect(r.xpIntoLevel).toBe(0);
    }
  });

  it("clamps at MAX_LEVEL with overflow surfaced as 0 banked", () => {
    const total = xpToReach(MAX_LEVEL) + 1_000_000;
    expect(levelFromTotalXp(total)).toEqual({ level: MAX_LEVEL, xpIntoLevel: 0 });
  });

  it("rejects negative or non-integer totals", () => {
    expect(() => levelFromTotalXp(-1)).toThrow(RangeError);
    expect(() => levelFromTotalXp(1.5)).toThrow(RangeError);
    expect(() => levelFromTotalXp(Number.NaN)).toThrow(RangeError);
  });
});
