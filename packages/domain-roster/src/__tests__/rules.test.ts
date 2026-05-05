import { describe, expect, it } from "vitest";

import {
  MAX_ASCENSION,
  MAX_SKILL_LEVEL,
  ascensionLevelGate,
  canUnlock,
  parseUnlockRequirement,
  skillInvestmentCost,
  skillPointsForLevel,
  totalSpSpent,
} from "../rules.js";

describe("rules / ascension gates", () => {
  it("A0 has no level gate", () => {
    expect(ascensionLevelGate(0)).toBe(1);
  });

  it("higher tiers gate behind progressively higher account levels", () => {
    expect(ascensionLevelGate(1)).toBe(5);
    expect(ascensionLevelGate(2)).toBe(15);
    expect(ascensionLevelGate(3)).toBe(25);
  });

  it("MAX_ASCENSION matches the guideline (A0..A3)", () => {
    expect(MAX_ASCENSION).toBe(3);
  });
});

describe("rules / skill points", () => {
  it("level 1 → 0 SP, level 2 → 1, level N → N-1", () => {
    expect(skillPointsForLevel(1)).toBe(0);
    expect(skillPointsForLevel(2)).toBe(1);
    expect(skillPointsForLevel(50)).toBe(49);
    expect(skillPointsForLevel(100)).toBe(99);
  });

  it("rejects malformed levels", () => {
    expect(() => skillPointsForLevel(0)).toThrow(RangeError);
    expect(() => skillPointsForLevel(-5)).toThrow(RangeError);
    expect(() => skillPointsForLevel(1.5)).toThrow(RangeError);
  });

  it("MAX_SKILL_LEVEL matches the modelled per-node cap", () => {
    expect(MAX_SKILL_LEVEL).toBe(5);
  });
});

describe("rules / investment cost", () => {
  it("costs 1 SP per level until the cap, then Infinity", () => {
    for (let l = 0; l < MAX_SKILL_LEVEL; l += 1) {
      expect(skillInvestmentCost(l)).toBe(1);
    }
    expect(skillInvestmentCost(MAX_SKILL_LEVEL)).toBe(Number.POSITIVE_INFINITY);
    expect(skillInvestmentCost(MAX_SKILL_LEVEL + 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("rejects malformed currentLevel", () => {
    expect(() => skillInvestmentCost(-1)).toThrow(RangeError);
    expect(() => skillInvestmentCost(1.5)).toThrow(RangeError);
  });
});

describe("rules / totalSpSpent", () => {
  it("sums per-node investments", () => {
    expect(totalSpSpent([])).toBe(0);
    expect(totalSpSpent([{ level: 0 }, { level: 0 }])).toBe(0);
    expect(totalSpSpent([{ level: 1 }, { level: 2 }, { level: 0 }])).toBe(3);
  });

  it("clamps levels above MAX to MAX so a corrupt row can't inflate the count", () => {
    expect(totalSpSpent([{ level: MAX_SKILL_LEVEL + 5 }])).toBe(MAX_SKILL_LEVEL);
  });

  it("rejects malformed shapes", () => {
    expect(() => totalSpSpent([{ level: -1 }])).toThrow(RangeError);
    expect(() => totalSpSpent([{ level: 1.5 }])).toThrow(RangeError);
  });
});

describe("rules / parseUnlockRequirement", () => {
  it("nullish raw → default", () => {
    expect(parseUnlockRequirement(null)).toEqual({ kind: "default" });
    expect(parseUnlockRequirement(undefined)).toEqual({ kind: "default" });
  });

  it("recognises account_level", () => {
    expect(parseUnlockRequirement({ kind: "account_level", level: 11 })).toEqual({
      kind: "account_level",
      level: 11,
    });
  });

  it("recognises quest + pvp_rank + secret", () => {
    expect(parseUnlockRequirement({ kind: "quest", questId: "q.kyo.intro" })).toEqual({
      kind: "quest",
      questId: "q.kyo.intro",
    });
    expect(parseUnlockRequirement({ kind: "pvp_rank", tier: "diamond" })).toEqual({
      kind: "pvp_rank",
      tier: "diamond",
    });
    expect(parseUnlockRequirement({ kind: "secret" })).toEqual({ kind: "secret" });
  });

  it("falls back to secret for malformed shapes (defensive)", () => {
    expect(parseUnlockRequirement({ kind: "account_level" })).toEqual({ kind: "secret" });
    expect(parseUnlockRequirement({ kind: "account_level", level: 0 })).toEqual({ kind: "secret" });
    expect(parseUnlockRequirement({ kind: "quest", questId: "" })).toEqual({ kind: "secret" });
    expect(parseUnlockRequirement({ kind: "noise" })).toEqual({ kind: "secret" });
    expect(parseUnlockRequirement(42)).toEqual({ kind: "secret" });
  });
});

describe("rules / canUnlock", () => {
  const ctx = (over: Partial<{ accountLevel: number; completedQuests: Set<string>; pvpTier: string | null }> = {}) => ({
    accountLevel: 1,
    completedQuests: new Set<string>(),
    pvpTier: null,
    ...over,
  });

  it("default is always unlockable", () => {
    expect(canUnlock({ kind: "default" }, ctx())).toEqual({ ok: true });
  });

  it("account_level gates by account level (low / equal / high)", () => {
    const req = { kind: "account_level" as const, level: 11 };
    expect(canUnlock(req, ctx({ accountLevel: 10 }))).toEqual({ ok: false, reason: "level", required: 11 });
    expect(canUnlock(req, ctx({ accountLevel: 11 }))).toEqual({ ok: true });
    expect(canUnlock(req, ctx({ accountLevel: 99 }))).toEqual({ ok: true });
  });

  it("quest passes only when the questId is in completedQuests", () => {
    const req = { kind: "quest" as const, questId: "q.kyo.intro" };
    expect(canUnlock(req, ctx())).toEqual({ ok: false, reason: "quest", questId: "q.kyo.intro" });
    expect(canUnlock(req, ctx({ completedQuests: new Set(["q.kyo.intro"]) }))).toEqual({ ok: true });
  });

  it("pvp_rank: lower tier rejects, equal/higher passes, unknown tier rejects", () => {
    const req = { kind: "pvp_rank" as const, tier: "diamond" };
    expect(canUnlock(req, ctx({ pvpTier: "gold" }))).toEqual({ ok: false, reason: "pvp_rank", required: "diamond" });
    expect(canUnlock(req, ctx({ pvpTier: "diamond" }))).toEqual({ ok: true });
    expect(canUnlock(req, ctx({ pvpTier: "mythic" }))).toEqual({ ok: true });
    expect(canUnlock(req, ctx({ pvpTier: "fakerank" }))).toEqual({ ok: false, reason: "pvp_rank", required: "diamond" });
    expect(canUnlock(req, ctx({ pvpTier: null }))).toEqual({ ok: false, reason: "pvp_rank", required: "diamond" });
  });

  it("secret never unlocks via this API", () => {
    expect(canUnlock({ kind: "secret" }, ctx({ accountLevel: 100 }))).toEqual({ ok: false, reason: "secret" });
  });
});
