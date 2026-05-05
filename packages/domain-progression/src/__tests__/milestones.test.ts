import { describe, expect, it } from "vitest";

import {
  MILESTONES,
  milestoneAtLevel,
  milestoneById,
  milestonesCrossing,
} from "../milestones.js";

describe("milestones / table", () => {
  it("matches the spec set { 5, 10, 15, 25, 40, 60, 80, 100 }", () => {
    expect(MILESTONES.map((m) => m.level)).toEqual([5, 10, 15, 25, 40, 60, 80, 100]);
  });

  it("has unique ids", () => {
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique levels", () => {
    const lvls = MILESTONES.map((m) => m.level);
    expect(new Set(lvls).size).toBe(lvls.length);
  });

  it("is sorted by level ascending", () => {
    for (let i = 1; i < MILESTONES.length; i += 1) {
      const prev = MILESTONES[i - 1];
      const curr = MILESTONES[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      expect(curr!.level).toBeGreaterThan(prev!.level);
    }
  });

  it("ships every entry with a stable i18n key", () => {
    for (const m of MILESTONES) {
      expect(m.i18nKey).toMatch(/^progression\.milestone\./);
    }
  });
});

describe("milestones / lookups", () => {
  it("milestoneAtLevel returns the entry for a hit", () => {
    expect(milestoneAtLevel(15)?.id).toBe("photo_mode");
    expect(milestoneAtLevel(25)?.id).toBe("coop");
  });

  it("milestoneAtLevel returns null for a non-milestone level", () => {
    expect(milestoneAtLevel(1)).toBeNull();
    expect(milestoneAtLevel(7)).toBeNull();
    expect(milestoneAtLevel(99)).toBeNull();
  });

  it("milestoneById finds by id", () => {
    expect(milestoneById("ranked_pvp")?.level).toBe(60);
    expect(milestoneById("weekly_rifts")?.level).toBe(100);
  });
});

describe("milestones / crossing", () => {
  it("returns empty when toLevel <= fromLevel", () => {
    expect(milestonesCrossing(20, 20)).toEqual([]);
    expect(milestonesCrossing(20, 10)).toEqual([]);
  });

  it("excludes the lower bound, includes the upper", () => {
    // A jump from 14 → 15 should pick up the level-15 milestone…
    expect(milestonesCrossing(14, 15).map((m) => m.level)).toEqual([15]);
    // …but a jump from 15 → 16 should not (already crossed).
    expect(milestonesCrossing(15, 16)).toEqual([]);
  });

  it("captures every milestone in a multi-level jump", () => {
    expect(milestonesCrossing(4, 30).map((m) => m.id)).toEqual([
      "second_character_slot",
      "skill_tree",
      "photo_mode",
      "coop",
    ]);
  });

  it("captures the final milestone on a jump that ends at MAX_LEVEL", () => {
    expect(milestonesCrossing(99, 100).map((m) => m.id)).toEqual(["weekly_rifts"]);
  });
});
