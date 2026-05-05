import { describe, expect, it } from "vitest";

import type {
  EnemyDefeatedEvent,
  ItemCraftedEvent,
  LevelCompletedEvent,
  LeveledUpEvent,
  RunFinishedEvent,
} from "@aetheria/domain-events";

import {
  MAX_TIER,
  XP_PER_TIER,
  evaluateClaim,
  eventXpDelta,
  isSeasonActive,
  maxTier,
  parseTracks,
  tierFromXp,
  xpForTier,
} from "../rules.js";

const baseEvent = {
  id: "evt-1",
  userId: "1",
  occurredAt: new Date("2026-05-05T00:00:00Z"),
};

const enemyDefeated = (overrides: Partial<EnemyDefeatedEvent> = {}): EnemyDefeatedEvent => ({
  ...baseEvent,
  type: "EnemyDefeated",
  runId: "r1",
  enemyId: "e1",
  ...overrides,
});
const itemCrafted = (overrides: Partial<ItemCraftedEvent> = {}): ItemCraftedEvent => ({
  ...baseEvent,
  type: "ItemCrafted",
  outputItemId: "100",
  outputQuantity: 1,
  inputs: [{ itemId: "10", quantity: 1 }],
  ...overrides,
});
const levelCompleted = (overrides: Partial<LevelCompletedEvent> = {}): LevelCompletedEvent => ({
  ...baseEvent,
  type: "LevelCompleted",
  runId: "r1",
  levelId: "L1",
  score: 100,
  stars: 3,
  ...overrides,
});
const leveledUp = (overrides: Partial<LeveledUpEvent> = {}): LeveledUpEvent => ({
  ...baseEvent,
  type: "LeveledUp",
  from: 1,
  to: 2,
  milestoneIds: [],
  ...overrides,
});
const runFinished = (overrides: Partial<RunFinishedEvent> = {}): RunFinishedEvent => ({
  ...baseEvent,
  type: "RunFinished",
  runId: "r1",
  levelId: "L1",
  status: "completed",
  score: 50,
  stars: 1,
  ...overrides,
});

describe("parseTracks", () => {
  it("returns empty tracks for non-objects", () => {
    expect(parseTracks(null)).toEqual({ free: [], premium: [] });
    expect(parseTracks(undefined)).toEqual({ free: [], premium: [] });
    expect(parseTracks("nope")).toEqual({ free: [], premium: [] });
    expect(parseTracks([])).toEqual({ free: [], premium: [] });
  });

  it("drops malformed tiers and keeps valid ones, sorted ascending", () => {
    expect(
      parseTracks({
        free: [
          { tier: 2, reward: { kind: "item", itemId: "1", quantity: 1 } },
          { tier: 1, reward: { kind: "xp", amount: 50 } },
          { tier: 0, reward: { kind: "xp", amount: 1 } },           // tier must be > 0
          { tier: 3, reward: { kind: "currency", amount: 10 } },     // unknown reward kind
          { tier: 4, reward: { kind: "item", itemId: "", quantity: 1 } }, // empty itemId
          null,                                                      // junk
        ],
        premium: [{ tier: 1, reward: { kind: "xp", amount: 100 } }],
      }),
    ).toEqual({
      free: [
        { tier: 1, reward: { kind: "xp", amount: 50 } },
        { tier: 2, reward: { kind: "item", itemId: "1", quantity: 1 } },
      ],
      premium: [{ tier: 1, reward: { kind: "xp", amount: 100 } }],
    });
  });

  it("dedupes by tier within a track (later wins)", () => {
    const t = parseTracks({
      free: [
        { tier: 1, reward: { kind: "xp", amount: 10 } },
        { tier: 1, reward: { kind: "xp", amount: 20 } },
      ],
    });
    expect(t.free).toEqual([{ tier: 1, reward: { kind: "xp", amount: 20 } }]);
  });

  it("rejects fractional / non-positive quantities", () => {
    expect(
      parseTracks({
        free: [
          { tier: 1, reward: { kind: "item", itemId: "1", quantity: 0 } },
          { tier: 2, reward: { kind: "item", itemId: "1", quantity: 1.5 } },
          { tier: 3, reward: { kind: "xp", amount: -5 } },
        ],
      }).free,
    ).toEqual([]);
  });
});

describe("maxTier", () => {
  it("is the max across both tracks", () => {
    expect(
      maxTier({
        free: [
          { tier: 1, reward: { kind: "xp", amount: 1 } },
          { tier: 5, reward: { kind: "xp", amount: 1 } },
        ],
        premium: [{ tier: 7, reward: { kind: "xp", amount: 1 } }],
      }),
    ).toBe(7);
    expect(maxTier({ free: [], premium: [] })).toBe(0);
  });
});

describe("xp curve", () => {
  it("xpForTier scales linearly and clamps to MAX_TIER", () => {
    expect(xpForTier(1)).toBe(XP_PER_TIER);
    expect(xpForTier(5)).toBe(5 * XP_PER_TIER);
    expect(xpForTier(MAX_TIER)).toBe(MAX_TIER * XP_PER_TIER);
    expect(xpForTier(MAX_TIER + 50)).toBe(MAX_TIER * XP_PER_TIER);
  });
  it("xpForTier rejects non-positive / fractional", () => {
    expect(xpForTier(0)).toBe(0);
    expect(xpForTier(-3)).toBe(0);
    expect(xpForTier(1.5)).toBe(0);
  });
  it("tierFromXp floors to integer tiers and clamps to MAX_TIER", () => {
    expect(tierFromXp(0)).toBe(0);
    expect(tierFromXp(XP_PER_TIER - 1)).toBe(0);
    expect(tierFromXp(XP_PER_TIER)).toBe(1);
    expect(tierFromXp(3 * XP_PER_TIER + 50)).toBe(3);
    expect(tierFromXp(1_000_000_000)).toBe(MAX_TIER);
  });
});

describe("eventXpDelta", () => {
  it("maps event types to fixed deltas", () => {
    expect(eventXpDelta(enemyDefeated())).toBe(10);
    expect(eventXpDelta(itemCrafted())).toBe(20);
    expect(eventXpDelta(levelCompleted())).toBe(100);
    expect(eventXpDelta(leveledUp())).toBe(100);
    expect(eventXpDelta(runFinished())).toBe(50);
  });
  it("RunFinished: only completed runs grant BP XP", () => {
    expect(eventXpDelta(runFinished({ status: "failed" }))).toBe(0);
    expect(eventXpDelta(runFinished({ status: "abandoned" }))).toBe(0);
  });
});

describe("evaluateClaim", () => {
  const tracks = parseTracks({
    free: [
      { tier: 1, reward: { kind: "xp", amount: 50 } },
      { tier: 2, reward: { kind: "item", itemId: "1", quantity: 1 } },
      { tier: 3, reward: { kind: "xp", amount: 100 } },
    ],
    premium: [
      { tier: 1, reward: { kind: "xp", amount: 100 } },
      { tier: 3, reward: { kind: "item", itemId: "2", quantity: 2 } },
    ],
  });

  it("rejects out-of-range tiers", () => {
    expect(
      evaluateClaim(tracks, 0, { xp: 0, claimedTier: 0, premium: false }).reason,
    ).toBe("tier_out_of_range");
    expect(
      evaluateClaim(tracks, MAX_TIER + 1, { xp: 0, claimedTier: 0, premium: false })
        .reason,
    ).toBe("tier_out_of_range");
  });

  it("rejects tiers already claimed", () => {
    expect(
      evaluateClaim(tracks, 1, {
        xp: 5_000,
        claimedTier: 1,
        premium: false,
      }).reason,
    ).toBe("already_claimed");
  });

  it("requires sequential claims (no skipping)", () => {
    expect(
      evaluateClaim(tracks, 3, {
        xp: 10_000,
        claimedTier: 1,
        premium: true,
      }).reason,
    ).toBe("must_claim_in_order");
  });

  it("rejects when XP curve hasn't unlocked the tier", () => {
    expect(
      evaluateClaim(tracks, 1, {
        xp: XP_PER_TIER - 1,
        claimedTier: 0,
        premium: false,
      }).reason,
    ).toBe("tier_locked");
  });

  it("free claim grants only the free reward when premium=false", () => {
    const e = evaluateClaim(tracks, 1, {
      xp: XP_PER_TIER,
      claimedTier: 0,
      premium: false,
    });
    expect(e.ok).toBe(true);
    expect(e.rewards).toEqual([{ kind: "xp", amount: 50 }]);
  });

  it("premium=true grants both rewards when both tracks have entries at tier", () => {
    const e = evaluateClaim(tracks, 1, {
      xp: XP_PER_TIER,
      claimedTier: 0,
      premium: true,
    });
    expect(e.ok).toBe(true);
    expect(e.rewards).toEqual([
      { kind: "xp", amount: 50 },
      { kind: "xp", amount: 100 },
    ]);
  });

  it("premium=true at a tier with only one track returns just that reward", () => {
    // Tier 2 has free only.
    const e = evaluateClaim(tracks, 2, {
      xp: 2 * XP_PER_TIER,
      claimedTier: 1,
      premium: true,
    });
    expect(e.ok).toBe(true);
    expect(e.rewards).toEqual([{ kind: "item", itemId: "1", quantity: 1 }]);
  });

  it("returns no_reward when neither track has a tier entry", () => {
    const e = evaluateClaim(tracks, 4, {
      xp: 10 * XP_PER_TIER,
      claimedTier: 3,
      premium: true,
    });
    expect(e.ok).toBe(false);
    expect(e.reason).toBe("no_reward");
  });
});

describe("isSeasonActive", () => {
  const from = new Date("2026-05-05T00:00:00Z");
  const to = new Date("2026-05-12T00:00:00Z");
  it("inclusive lower / exclusive upper", () => {
    expect(isSeasonActive(from, to, from)).toBe(true);
    expect(isSeasonActive(from, to, to)).toBe(false);
  });
  it("outside the window", () => {
    expect(isSeasonActive(from, to, new Date("2026-05-04T23:59:59Z"))).toBe(false);
    expect(isSeasonActive(from, to, new Date("2026-05-13T00:00:00Z"))).toBe(false);
  });
});
