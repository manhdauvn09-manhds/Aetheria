// Aetheria — pure rules for quest progress + claim eligibility.
//
// No DB / I/O. The service layer parses Prisma rows through these helpers
// so a malformed JSON column can never crash a request, and the same
// rules can power admin previews + client-side optimistic UI.

import type { DomainEvent } from "@aetheria/domain-events";

import type {
  QuestProgress,
  QuestRequirement,
  QuestReward,
} from "./types.js";

const isPositiveInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Parse `Quest.requirements` JSON into a typed `QuestRequirement`.
 * Returns `null` for malformed data — service callers must treat it as
 * a server-side bug (unparseable quests are never visible to the user).
 */
export const parseRequirement = (raw: unknown): QuestRequirement | null => {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "craft_item": {
      if (!isPositiveInt(r.count)) return null;
      const itemId = asString(r.itemId);
      return itemId !== undefined
        ? { kind: "craft_item", count: r.count, itemId }
        : { kind: "craft_item", count: r.count };
    }
    case "defeat_enemies": {
      if (!isPositiveInt(r.count)) return null;
      const archetype = asString(r.archetype);
      return archetype !== undefined
        ? { kind: "defeat_enemies", count: r.count, archetype }
        : { kind: "defeat_enemies", count: r.count };
    }
    case "complete_levels": {
      if (!isPositiveInt(r.count)) return null;
      const levelId = asString(r.levelId);
      return levelId !== undefined
        ? { kind: "complete_levels", count: r.count, levelId }
        : { kind: "complete_levels", count: r.count };
    }
    case "level_up": {
      if (!isPositiveInt(r.targetLevel)) return null;
      return { kind: "level_up", targetLevel: r.targetLevel };
    }
    case "finish_runs": {
      if (!isPositiveInt(r.count)) return null;
      const status = r.status;
      if (
        status === "completed" ||
        status === "failed" ||
        status === "abandoned"
      ) {
        return { kind: "finish_runs", count: r.count, status };
      }
      return { kind: "finish_runs", count: r.count };
    }
    default:
      return null;
  }
};

/** Parse `Quest.rewards` JSON. Drops malformed entries; never throws. */
export const parseRewards = (raw: unknown): readonly QuestReward[] => {
  if (!Array.isArray(raw)) return [];
  const out: QuestReward[] = [];
  for (const r of raw) {
    if (r === null || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    if (rec.kind === "item") {
      const itemId = asString(rec.itemId);
      const quantity = rec.quantity;
      if (itemId !== undefined && isPositiveInt(quantity)) {
        out.push({ kind: "item", itemId, quantity });
      }
    } else if (rec.kind === "xp") {
      if (isPositiveInt(rec.amount)) {
        out.push({ kind: "xp", amount: rec.amount });
      }
    }
  }
  return out;
};

/** Parse `UserQuest.progress` JSON. Defaults to `{ count: 0 }`. */
export const parseProgress = (raw: unknown): QuestProgress => {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { count: 0 };
  }
  const r = raw as Record<string, unknown>;
  const count =
    typeof r.count === "number" && Number.isInteger(r.count) && r.count >= 0
      ? r.count
      : 0;
  return { count };
};

/** True when the event is the kind the requirement wants to count. */
export const eventMatchesRequirement = (
  req: QuestRequirement,
  event: DomainEvent,
): boolean => {
  switch (req.kind) {
    case "craft_item":
      if (event.type !== "ItemCrafted") return false;
      return req.itemId === undefined || req.itemId === event.outputItemId;
    case "defeat_enemies":
      if (event.type !== "EnemyDefeated") return false;
      return req.archetype === undefined || req.archetype === event.archetype;
    case "complete_levels":
      if (event.type !== "LevelCompleted") return false;
      return req.levelId === undefined || req.levelId === event.levelId;
    case "level_up":
      return event.type === "LeveledUp";
    case "finish_runs":
      if (event.type !== "RunFinished") return false;
      return req.status === undefined || req.status === event.status;
  }
};

/**
 * Apply one matched event to the running progress counter and return
 * the new progress. Pure — no side effects.
 */
export const applyEventToProgress = (
  req: QuestRequirement,
  progress: QuestProgress,
  event: DomainEvent,
): QuestProgress => {
  switch (req.kind) {
    case "craft_item":
      if (event.type !== "ItemCrafted") return progress;
      // Increment by the number of output items produced (recipes can
      // craft >1 per invocation). Clamp at the requirement target so the
      // counter never overshoots.
      return {
        count: Math.min(req.count, progress.count + Math.max(1, event.outputQuantity)),
      };
    case "defeat_enemies":
      if (event.type !== "EnemyDefeated") return progress;
      return { count: Math.min(req.count, progress.count + 1) };
    case "complete_levels":
      if (event.type !== "LevelCompleted") return progress;
      return { count: Math.min(req.count, progress.count + 1) };
    case "level_up":
      if (event.type !== "LeveledUp") return progress;
      // Record the highest level reached so far.
      return { count: Math.max(progress.count, event.to) };
    case "finish_runs":
      if (event.type !== "RunFinished") return progress;
      return { count: Math.min(req.count, progress.count + 1) };
  }
};

/** True when the running progress satisfies the requirement. */
export const isRequirementComplete = (
  req: QuestRequirement,
  progress: QuestProgress,
): boolean => {
  switch (req.kind) {
    case "craft_item":
    case "defeat_enemies":
    case "complete_levels":
    case "finish_runs":
      return progress.count >= req.count;
    case "level_up":
      return progress.count >= req.targetLevel;
  }
};

/** Window check — quest is active iff `from <= now < to`. */
export const isQuestActive = (
  activeFrom: Date,
  activeTo: Date,
  now: Date,
): boolean => activeFrom.getTime() <= now.getTime() && now.getTime() < activeTo.getTime();
