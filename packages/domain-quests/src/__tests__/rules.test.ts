import { describe, expect, it } from "vitest";

import type {
  EnemyDefeatedEvent,
  ItemCraftedEvent,
  LevelCompletedEvent,
  LeveledUpEvent,
  RunFinishedEvent,
} from "@aetheria/domain-events";

import {
  applyEventToProgress,
  eventMatchesRequirement,
  isQuestActive,
  isRequirementComplete,
  parseProgress,
  parseRequirement,
  parseRewards,
} from "../rules.js";
import type { QuestRequirement } from "../types.js";

const baseEvent = {
  id: "evt-1",
  userId: "1",
  occurredAt: new Date("2026-05-05T00:00:00Z"),
};

const itemCrafted = (overrides: Partial<ItemCraftedEvent> = {}): ItemCraftedEvent => ({
  ...baseEvent,
  type: "ItemCrafted",
  outputItemId: "100",
  outputQuantity: 1,
  inputs: [{ itemId: "10", quantity: 3 }],
  ...overrides,
});

const enemyDefeated = (overrides: Partial<EnemyDefeatedEvent> = {}): EnemyDefeatedEvent => ({
  ...baseEvent,
  type: "EnemyDefeated",
  runId: "r1",
  enemyId: "e1",
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

describe("parseRequirement", () => {
  it("parses every requirement kind", () => {
    expect(parseRequirement({ kind: "craft_item", count: 3 })).toEqual({
      kind: "craft_item",
      count: 3,
    });
    expect(parseRequirement({ kind: "craft_item", count: 3, itemId: "42" })).toEqual({
      kind: "craft_item",
      count: 3,
      itemId: "42",
    });
    expect(parseRequirement({ kind: "defeat_enemies", count: 5, archetype: "boss" })).toEqual({
      kind: "defeat_enemies",
      count: 5,
      archetype: "boss",
    });
    expect(parseRequirement({ kind: "complete_levels", count: 1, levelId: "L7" })).toEqual({
      kind: "complete_levels",
      count: 1,
      levelId: "L7",
    });
    expect(parseRequirement({ kind: "level_up", targetLevel: 10 })).toEqual({
      kind: "level_up",
      targetLevel: 10,
    });
    expect(
      parseRequirement({ kind: "finish_runs", count: 2, status: "failed" }),
    ).toEqual({ kind: "finish_runs", count: 2, status: "failed" });
  });

  it("returns null for malformed shapes", () => {
    expect(parseRequirement(null)).toBeNull();
    expect(parseRequirement(undefined)).toBeNull();
    expect(parseRequirement("nope")).toBeNull();
    expect(parseRequirement({})).toBeNull();
    expect(parseRequirement({ kind: "unknown", count: 1 })).toBeNull();
    expect(parseRequirement({ kind: "craft_item" })).toBeNull();
    expect(parseRequirement({ kind: "craft_item", count: 0 })).toBeNull();
    expect(parseRequirement({ kind: "craft_item", count: 1.5 })).toBeNull();
    expect(parseRequirement({ kind: "level_up", targetLevel: 0 })).toBeNull();
  });

  it("ignores invalid optional fields", () => {
    // Empty itemId should drop the optional, keeping the requirement.
    expect(parseRequirement({ kind: "craft_item", count: 1, itemId: "" })).toEqual({
      kind: "craft_item",
      count: 1,
    });
    // Unknown finish_runs status drops the optional.
    expect(
      parseRequirement({ kind: "finish_runs", count: 1, status: "weird" }),
    ).toEqual({ kind: "finish_runs", count: 1 });
  });
});

describe("parseRewards", () => {
  it("extracts valid item + xp rewards and drops the rest", () => {
    expect(
      parseRewards([
        { kind: "item", itemId: "1", quantity: 2 },
        { kind: "xp", amount: 50 },
        { kind: "item", itemId: "", quantity: 1 }, // invalid
        { kind: "currency", amount: 10 },          // unsupported
        null,                                       // junk
        { kind: "xp", amount: 0 },                 // non-positive
        { kind: "item", itemId: "2", quantity: -1 }, // non-positive
      ]),
    ).toEqual([
      { kind: "item", itemId: "1", quantity: 2 },
      { kind: "xp", amount: 50 },
    ]);
  });
  it("returns [] for non-arrays", () => {
    expect(parseRewards(null)).toEqual([]);
    expect(parseRewards(undefined)).toEqual([]);
    expect(parseRewards({})).toEqual([]);
  });
});

describe("parseProgress", () => {
  it("defaults to count: 0", () => {
    expect(parseProgress(null)).toEqual({ count: 0 });
    expect(parseProgress(undefined)).toEqual({ count: 0 });
    expect(parseProgress({})).toEqual({ count: 0 });
    expect(parseProgress("nope")).toEqual({ count: 0 });
  });
  it("preserves a valid integer count", () => {
    expect(parseProgress({ count: 7 })).toEqual({ count: 7 });
  });
  it("rejects negative or fractional counts", () => {
    expect(parseProgress({ count: -1 })).toEqual({ count: 0 });
    expect(parseProgress({ count: 1.5 })).toEqual({ count: 0 });
  });
});

describe("eventMatchesRequirement", () => {
  it("ItemCrafted matches craft_item with matching or absent itemId", () => {
    const r1: QuestRequirement = { kind: "craft_item", count: 1 };
    const r2: QuestRequirement = { kind: "craft_item", count: 1, itemId: "100" };
    const r3: QuestRequirement = { kind: "craft_item", count: 1, itemId: "999" };
    expect(eventMatchesRequirement(r1, itemCrafted())).toBe(true);
    expect(eventMatchesRequirement(r2, itemCrafted())).toBe(true);
    expect(eventMatchesRequirement(r3, itemCrafted())).toBe(false);
  });
  it("EnemyDefeated matches defeat_enemies with matching or absent archetype", () => {
    const r1: QuestRequirement = { kind: "defeat_enemies", count: 1 };
    const r2: QuestRequirement = { kind: "defeat_enemies", count: 1, archetype: "boss" };
    expect(eventMatchesRequirement(r1, enemyDefeated())).toBe(true);
    expect(eventMatchesRequirement(r2, enemyDefeated({ archetype: "boss" }))).toBe(true);
    expect(eventMatchesRequirement(r2, enemyDefeated({ archetype: "minion" }))).toBe(false);
    expect(eventMatchesRequirement(r2, enemyDefeated())).toBe(false);
  });
  it("LevelCompleted matches complete_levels with optional levelId", () => {
    const r1: QuestRequirement = { kind: "complete_levels", count: 1 };
    const r2: QuestRequirement = { kind: "complete_levels", count: 1, levelId: "L1" };
    expect(eventMatchesRequirement(r1, levelCompleted())).toBe(true);
    expect(eventMatchesRequirement(r2, levelCompleted())).toBe(true);
    expect(eventMatchesRequirement(r2, levelCompleted({ levelId: "L9" }))).toBe(false);
  });
  it("LeveledUp matches level_up", () => {
    const r: QuestRequirement = { kind: "level_up", targetLevel: 5 };
    expect(eventMatchesRequirement(r, leveledUp())).toBe(true);
    expect(eventMatchesRequirement(r, itemCrafted())).toBe(false);
  });
  it("RunFinished matches finish_runs with optional status", () => {
    const r1: QuestRequirement = { kind: "finish_runs", count: 1 };
    const r2: QuestRequirement = { kind: "finish_runs", count: 1, status: "completed" };
    expect(eventMatchesRequirement(r1, runFinished())).toBe(true);
    expect(eventMatchesRequirement(r2, runFinished())).toBe(true);
    expect(eventMatchesRequirement(r2, runFinished({ status: "failed" }))).toBe(false);
  });
  it("rejects unrelated event types", () => {
    const r: QuestRequirement = { kind: "craft_item", count: 1 };
    expect(eventMatchesRequirement(r, enemyDefeated())).toBe(false);
  });
});

describe("applyEventToProgress", () => {
  it("ItemCrafted increments by outputQuantity (>=1)", () => {
    const r: QuestRequirement = { kind: "craft_item", count: 5 };
    expect(applyEventToProgress(r, { count: 0 }, itemCrafted({ outputQuantity: 3 }))).toEqual({
      count: 3,
    });
    // outputQuantity 0 falls back to 1.
    expect(applyEventToProgress(r, { count: 0 }, itemCrafted({ outputQuantity: 0 }))).toEqual({
      count: 1,
    });
  });
  it("clamps at requirement target (no overshoot)", () => {
    const r: QuestRequirement = { kind: "craft_item", count: 2 };
    expect(applyEventToProgress(r, { count: 1 }, itemCrafted({ outputQuantity: 5 }))).toEqual({
      count: 2,
    });
  });
  it("EnemyDefeated / LevelCompleted / RunFinished add 1 each", () => {
    const r1: QuestRequirement = { kind: "defeat_enemies", count: 3 };
    expect(applyEventToProgress(r1, { count: 1 }, enemyDefeated())).toEqual({ count: 2 });
    const r2: QuestRequirement = { kind: "complete_levels", count: 3 };
    expect(applyEventToProgress(r2, { count: 0 }, levelCompleted())).toEqual({ count: 1 });
    const r3: QuestRequirement = { kind: "finish_runs", count: 3 };
    expect(applyEventToProgress(r3, { count: 0 }, runFinished())).toEqual({ count: 1 });
  });
  it("LeveledUp records highest level reached (max, not sum)", () => {
    const r: QuestRequirement = { kind: "level_up", targetLevel: 10 };
    expect(applyEventToProgress(r, { count: 4 }, leveledUp({ to: 7 }))).toEqual({ count: 7 });
    // Lower-numbered events must not regress the counter.
    expect(applyEventToProgress(r, { count: 7 }, leveledUp({ to: 5 }))).toEqual({ count: 7 });
  });
  it("ignores mismatched event types (returns same progress)", () => {
    const r: QuestRequirement = { kind: "craft_item", count: 5 };
    expect(applyEventToProgress(r, { count: 2 }, enemyDefeated())).toEqual({ count: 2 });
  });
});

describe("isRequirementComplete", () => {
  it("count-based: complete when progress >= target", () => {
    const r: QuestRequirement = { kind: "defeat_enemies", count: 3 };
    expect(isRequirementComplete(r, { count: 2 })).toBe(false);
    expect(isRequirementComplete(r, { count: 3 })).toBe(true);
    expect(isRequirementComplete(r, { count: 99 })).toBe(true);
  });
  it("level_up: complete when count (highest level) >= targetLevel", () => {
    const r: QuestRequirement = { kind: "level_up", targetLevel: 10 };
    expect(isRequirementComplete(r, { count: 9 })).toBe(false);
    expect(isRequirementComplete(r, { count: 10 })).toBe(true);
  });
});

describe("isQuestActive", () => {
  const from = new Date("2026-05-05T00:00:00Z");
  const to = new Date("2026-05-06T00:00:00Z");
  it("inclusive lower bound", () => {
    expect(isQuestActive(from, to, from)).toBe(true);
  });
  it("exclusive upper bound", () => {
    expect(isQuestActive(from, to, to)).toBe(false);
  });
  it("outside the window", () => {
    expect(isQuestActive(from, to, new Date("2026-05-04T23:59:59Z"))).toBe(false);
    expect(isQuestActive(from, to, new Date("2026-05-06T00:00:01Z"))).toBe(false);
  });
});
