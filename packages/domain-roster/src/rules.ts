// Aetheria — pure rules for roster + skill tree.
//
// No DB / I/O. Service code calls into here for every gating decision so
// the rules are unit-testable in isolation and reusable from the future
// admin tools and the client-side preview UI.

import type { Level } from "@aetheria/domain-progression";

import type { AscensionTier, UnlockRequirement } from "./types.js";

/** Hard cap from `docs/01_GAME_GUIDELINE.md` §8. */
export const MAX_ASCENSION: AscensionTier = 3;

/**
 * Per-skill investment cap. The skill tree has 12 nodes per character
 * (guideline §8); we model each node's investment as `0..MAX_SKILL_LEVEL`.
 */
export const MAX_SKILL_LEVEL = 5;

/**
 * Account level required to ascend *into* a given tier.
 * A0 is the starting tier (no gate). Curve is intentionally linear and
 * cheap — once Inventory + currencies land (4.31) ascension will also
 * consume Aether-cores.
 */
export const ascensionLevelGate = (targetTier: AscensionTier): Level => {
  switch (targetTier) {
    case 0: return 1;
    case 1: return 5;
    case 2: return 15;
    case 3: return 25;
  }
};

/**
 * Skill points awarded per account level.
 *
 * Currently: 1 SP per level past 1 (so level 1 = 0, level 2 = 1, …,
 * level 100 = 99). With 12 nodes × max 5 levels = 60 SP cap, the curve
 * gives players room to fully invest by level ~60 then redirect surplus
 * via respec.
 */
export const skillPointsForLevel = (accountLevel: Level): number => {
  if (!Number.isInteger(accountLevel) || accountLevel < 1) {
    throw new RangeError(`skillPointsForLevel: level must be an integer >= 1 (got ${String(accountLevel)})`);
  }
  return Math.max(0, accountLevel - 1);
};

/** SP cost to raise one node from `currentLevel` to `currentLevel + 1`. */
export const skillInvestmentCost = (currentLevel: number): number => {
  if (!Number.isInteger(currentLevel) || currentLevel < 0) {
    throw new RangeError(`skillInvestmentCost: currentLevel must be an integer >= 0 (got ${String(currentLevel)})`);
  }
  if (currentLevel >= MAX_SKILL_LEVEL) return Number.POSITIVE_INFINITY;
  return 1;
};

/**
 * Total SP a player has spent across an array of `(skillId, level)` pairs.
 * Uses `skillInvestmentCost` so the answer stays consistent if the cost
 * curve ever changes (e.g. tier 5 costs 2 SP).
 */
export const totalSpSpent = (
  invested: readonly { readonly level: number }[],
): number => {
  let total = 0;
  for (const node of invested) {
    if (!Number.isInteger(node.level) || node.level < 0) {
      throw new RangeError(`totalSpSpent: level must be an integer >= 0`);
    }
    for (let l = 0; l < Math.min(node.level, MAX_SKILL_LEVEL); l += 1) {
      total += skillInvestmentCost(l);
    }
  }
  return total;
};

/**
 * Parse the `characters.unlock_requirement` JSON column into a typed
 * union. Catalog data is server-controlled, but we still validate so a
 * bad migration can't crash the request.
 */
export const parseUnlockRequirement = (raw: unknown): UnlockRequirement => {
  if (raw === null || raw === undefined) return { kind: "default" };
  if (typeof raw !== "object") return { kind: "secret" };
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "default":
      return { kind: "default" };
    case "account_level": {
      const level = r.level;
      if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
        return { kind: "secret" };
      }
      return { kind: "account_level", level };
    }
    case "quest": {
      const questId = r.questId;
      if (typeof questId !== "string" || questId.length === 0) {
        return { kind: "secret" };
      }
      return { kind: "quest", questId };
    }
    case "pvp_rank": {
      const tier = r.tier;
      if (typeof tier !== "string" || tier.length === 0) {
        return { kind: "secret" };
      }
      return { kind: "pvp_rank", tier };
    }
    case "secret":
      return { kind: "secret" };
    default:
      return { kind: "secret" };
  }
};

export interface UnlockContext {
  readonly accountLevel: Level;
  /** Quest ids the user has completed (may be empty). */
  readonly completedQuests: ReadonlySet<string>;
  /** PvP tier code, e.g. "bronze", "silver", … or null if unranked. */
  readonly pvpTier: string | null;
}

/**
 * Decide whether a character can be unlocked right now. The MVP supports
 * `default` and `account_level` end-to-end; the rest stub out as `false`
 * with a hint code so the UI can surface the correct messaging.
 */
export type UnlockEvaluation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "level"; readonly required: Level }
  | { readonly ok: false; readonly reason: "quest"; readonly questId: string }
  | { readonly ok: false; readonly reason: "pvp_rank"; readonly required: string }
  | { readonly ok: false; readonly reason: "secret" };

export const canUnlock = (
  req: UnlockRequirement,
  ctx: UnlockContext,
): UnlockEvaluation => {
  switch (req.kind) {
    case "default":
      return { ok: true };
    case "account_level":
      if (ctx.accountLevel >= req.level) return { ok: true };
      return { ok: false, reason: "level", required: req.level };
    case "quest":
      if (ctx.completedQuests.has(req.questId)) return { ok: true };
      return { ok: false, reason: "quest", questId: req.questId };
    case "pvp_rank":
      if (ctx.pvpTier !== null && pvpTierMeets(ctx.pvpTier, req.tier)) return { ok: true };
      return { ok: false, reason: "pvp_rank", required: req.tier };
    case "secret":
      return { ok: false, reason: "secret" };
  }
};

const PVP_TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "mythic"] as const;
type PvpTier = (typeof PVP_TIERS)[number];

const isKnownTier = (s: string): s is PvpTier =>
  (PVP_TIERS as readonly string[]).includes(s);

const pvpTierMeets = (currentTier: string, requiredTier: string): boolean => {
  const current = currentTier.toLowerCase();
  const required = requiredTier.toLowerCase();
  if (!isKnownTier(current) || !isKnownTier(required)) return false;
  return PVP_TIERS.indexOf(current) >= PVP_TIERS.indexOf(required);
};
