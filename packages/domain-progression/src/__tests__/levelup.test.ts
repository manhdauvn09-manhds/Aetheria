import { describe, expect, it } from "vitest";

import { MAX_LEVEL, xpForLevel, xpToReach } from "../curve.js";
import {
  addXp,
  assertValidProgression,
  checkLevelUp,
  initialProgression,
} from "../levelup.js";
import type { Progression } from "../types.js";

const fresh = initialProgression;

describe("levelup / initialProgression", () => {
  it("starts at level 1 with no XP", () => {
    expect(fresh()).toEqual({ level: 1, xpIntoLevel: 0, totalXp: 0 });
  });
});

describe("levelup / addXp basic", () => {
  it("zero XP is a no-op (no events, no totalXp delta)", () => {
    const r = addXp(fresh(), 0);
    expect(r.progression).toEqual(fresh());
    expect(r.events).toEqual([]);
    expect(r.overflowXp).toBe(0);
  });

  it("XP below threshold accumulates without level-up", () => {
    const r = addXp(fresh(), 49);
    expect(r.progression).toEqual({ level: 1, xpIntoLevel: 49, totalXp: 49 });
    expect(r.events).toEqual([]);
  });

  it("XP exactly at threshold levels up once with no banked remainder", () => {
    const r = addXp(fresh(), xpForLevel(1));
    expect(r.progression.level).toBe(2);
    expect(r.progression.xpIntoLevel).toBe(0);
    expect(r.progression.totalXp).toBe(xpForLevel(1));
    expect(r.events).toHaveLength(1);
    const event = r.events[0];
    expect(event).toBeDefined();
    expect(event!.type).toBe("leveled_up");
    expect(event!.from).toBe(1);
    expect(event!.to).toBe(2);
    expect(event!.milestones).toEqual([]);
  });

  it("XP overshoot levels up once and banks the remainder", () => {
    const r = addXp(fresh(), xpForLevel(1) + 10);
    expect(r.progression.level).toBe(2);
    expect(r.progression.xpIntoLevel).toBe(10);
    expect(r.events).toHaveLength(1);
  });

  it("rejects negative or non-integer amounts", () => {
    expect(() => addXp(fresh(), -1)).toThrow(RangeError);
    expect(() => addXp(fresh(), 1.5)).toThrow(RangeError);
    expect(() => addXp(fresh(), Number.NaN)).toThrow(RangeError);
  });
});

describe("levelup / addXp multi-level", () => {
  it("emits one event per level crossed", () => {
    const total = xpToReach(5);
    const r = addXp(fresh(), total);
    expect(r.progression.level).toBe(5);
    expect(r.progression.xpIntoLevel).toBe(0);
    expect(r.events).toHaveLength(4);
    expect(r.events.map((e) => `${String(e.from)}->${String(e.to)}`)).toEqual([
      "1->2",
      "2->3",
      "3->4",
      "4->5",
    ]);
  });

  it("the level-5 event carries the second_character_slot milestone", () => {
    const r = addXp(fresh(), xpToReach(5));
    const last = r.events.at(-1);
    expect(last).toBeDefined();
    expect(last!.to).toBe(5);
    expect(last!.milestones.map((m) => m.id)).toEqual(["second_character_slot"]);
  });

  it("a huge grant from level 1 hits every milestone in order", () => {
    const r = addXp(fresh(), xpToReach(MAX_LEVEL));
    expect(r.progression.level).toBe(MAX_LEVEL);
    expect(r.progression.xpIntoLevel).toBe(0);
    expect(r.overflowXp).toBe(0);
    const ids = r.events.flatMap((e) => e.milestones.map((m) => m.id));
    expect(ids).toEqual([
      "second_character_slot",
      "skill_tree",
      "photo_mode",
      "coop",
      "guild_raids",
      "ranked_pvp",
      "endless_tower",
      "weekly_rifts",
    ]);
  });
});

describe("levelup / addXp at MAX_LEVEL", () => {
  it("any grant past MAX_LEVEL is overflow with no events", () => {
    const capped: Progression = { level: MAX_LEVEL, xpIntoLevel: 0, totalXp: xpToReach(MAX_LEVEL) };
    const r = addXp(capped, 9999);
    expect(r.progression.level).toBe(MAX_LEVEL);
    expect(r.progression.xpIntoLevel).toBe(0);
    expect(r.progression.totalXp).toBe(xpToReach(MAX_LEVEL) + 9999);
    expect(r.events).toEqual([]);
    expect(r.overflowXp).toBe(9999);
  });

  it("grant that crosses into MAX_LEVEL surfaces the residual as overflow", () => {
    // Sit one XP shy of MAX_LEVEL with the right cumulative totalXp so the
    // input is internally consistent.
    const need = xpForLevel(MAX_LEVEL - 1);
    const start: Progression = {
      level: MAX_LEVEL - 1,
      xpIntoLevel: need - 1,
      totalXp: xpToReach(MAX_LEVEL) - 1,
    };
    const r = addXp(start, 5);
    expect(r.progression.level).toBe(MAX_LEVEL);
    expect(r.progression.xpIntoLevel).toBe(0);
    expect(r.overflowXp).toBe(4);
  });
});

describe("levelup / checkLevelUp", () => {
  it("returns null when XP banked is under threshold", () => {
    const p: Progression = { level: 1, xpIntoLevel: 49, totalXp: 49 };
    expect(checkLevelUp(p)).toBeNull();
  });

  it("returns the delta when banked is over threshold (used after a manual mutation)", () => {
    const p: Progression = { level: 1, xpIntoLevel: xpForLevel(1) + xpForLevel(2), totalXp: 0 };
    const r = checkLevelUp(p);
    expect(r).not.toBeNull();
    expect(r!.nextLevel).toBe(3);
    expect(r!.delta).toBe(2);
    expect(r!.remainder).toBe(0);
  });

  it("returns null at MAX_LEVEL", () => {
    const capped: Progression = { level: MAX_LEVEL, xpIntoLevel: 0, totalXp: xpToReach(MAX_LEVEL) };
    expect(checkLevelUp(capped)).toBeNull();
  });
});

describe("levelup / assertValidProgression", () => {
  it("accepts a freshly initialised value", () => {
    expect(() => assertValidProgression(fresh())).not.toThrow();
  });

  it("rejects out-of-range level", () => {
    expect(() => assertValidProgression({ level: 0, xpIntoLevel: 0, totalXp: 0 })).toThrow(RangeError);
    expect(() => assertValidProgression({ level: MAX_LEVEL + 1, xpIntoLevel: 0, totalXp: 0 })).toThrow(RangeError);
  });

  it("rejects xpIntoLevel >= xpForLevel(level)", () => {
    expect(() =>
      assertValidProgression({ level: 1, xpIntoLevel: xpForLevel(1), totalXp: xpForLevel(1) }),
    ).toThrow(RangeError);
  });

  it("rejects banked XP at MAX_LEVEL", () => {
    expect(() =>
      assertValidProgression({ level: MAX_LEVEL, xpIntoLevel: 1, totalXp: xpToReach(MAX_LEVEL) + 1 }),
    ).toThrow(RangeError);
  });
});
