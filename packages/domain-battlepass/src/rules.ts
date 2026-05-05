// Aetheria — battle pass rules (pure).
//
// XP curve is intentionally trivial: every tier costs `XP_PER_TIER`. This
// keeps season tuning a one-line change and makes the math obvious to
// players. A sigmoidal curve (longer tail per tier) is left for a future
// season config if needed.

import type { DomainEvent } from "@aetheria/domain-events";

import type {
  BattlePassReward,
  BattlePassTier,
  BattlePassTracks,
} from "./types.js";

/** XP required for one tier. Total XP for tier N = XP_PER_TIER * N. */
export const XP_PER_TIER = 1000;

/** Hard ceiling so a runaway grant can't blow past the rendered track. */
export const MAX_TIER = 100;

const isPosInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

const isNonNegInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ── Track parsing ──────────────────────────────────────────────────────

const parseReward = (raw: unknown): BattlePassReward | null => {
  if (!isObj(raw)) return null;
  if (raw.kind === "item") {
    const itemId = typeof raw.itemId === "string" ? raw.itemId : null;
    const qty = raw.quantity;
    if (!itemId || itemId.length === 0) return null;
    if (!isPosInt(qty)) return null;
    return { kind: "item", itemId, quantity: qty };
  }
  if (raw.kind === "xp") {
    const amt = raw.amount;
    if (!isPosInt(amt)) return null;
    return { kind: "xp", amount: amt };
  }
  return null;
};

const parseTier = (raw: unknown): BattlePassTier | null => {
  if (!isObj(raw)) return null;
  const tier = raw.tier;
  if (!isPosInt(tier) || tier > MAX_TIER) return null;
  const reward = parseReward(raw.reward);
  if (!reward) return null;
  return { tier, reward };
};

/**
 * Parse the `tracks` JSON column. Drops malformed tiers silently so one
 * bad row doesn't kill the whole season. Tiers within a track are sorted
 * ascending and de-duplicated by `tier` (later wins).
 */
export const parseTracks = (raw: unknown): BattlePassTracks => {
  const empty: BattlePassTracks = { free: [], premium: [] };
  if (!isObj(raw)) return empty;

  const parseList = (list: unknown): BattlePassTier[] => {
    if (!Array.isArray(list)) return [];
    const byTier = new Map<number, BattlePassTier>();
    for (const item of list) {
      const t = parseTier(item);
      if (t) byTier.set(t.tier, t);
    }
    return [...byTier.values()].sort((a, b) => a.tier - b.tier);
  };

  return {
    free: parseList(raw.free),
    premium: parseList(raw.premium),
  };
};

export const maxTier = (tracks: BattlePassTracks): number => {
  let m = 0;
  for (const t of tracks.free) if (t.tier > m) m = t.tier;
  for (const t of tracks.premium) if (t.tier > m) m = t.tier;
  return m;
};

// ── XP curve ───────────────────────────────────────────────────────────

/** Total XP threshold for reaching tier N (1-indexed). Tier 0 = 0 XP. */
export const xpForTier = (tier: number): number => {
  if (!isPosInt(tier)) return 0;
  return Math.min(tier, MAX_TIER) * XP_PER_TIER;
};

/** Tier reached given accumulated season XP. Clamps to MAX_TIER. */
export const tierFromXp = (xp: number): number => {
  if (!isNonNegInt(xp) || xp <= 0) return 0;
  return Math.min(MAX_TIER, Math.floor(xp / XP_PER_TIER));
};

// ── Event → BP XP mapping ──────────────────────────────────────────────
//
// Fixed amounts per event type — simpler than per-quest config and easy
// to tune. RunFinished only awards on `completed`; failed/abandoned runs
// don't grant BP XP (otherwise farming aborted runs becomes optimal).

export const eventXpDelta = (event: DomainEvent): number => {
  switch (event.type) {
    case "EnemyDefeated":
      return 10;
    case "ItemCrafted":
      return 20;
    case "LevelCompleted":
      return 100;
    case "LeveledUp":
      // 100 XP per level reached; multi-level events (rare) emit one
      // event per level so this branch handles them naturally.
      return 100;
    case "RunFinished":
      return event.status === "completed" ? 50 : 0;
    default: {
      // Exhaustiveness check
      const _exhaustive: never = event;
      void _exhaustive;
      return 0;
    }
  }
};

// ── Claim eligibility ──────────────────────────────────────────────────

export interface ClaimEligibility {
  readonly ok: boolean;
  /** Set when ok=false. */
  readonly reason?:
    | "tier_out_of_range"
    | "tier_locked"
    | "already_claimed"
    | "must_claim_in_order"
    | "no_reward";
  /** Rewards to grant when ok=true. May be 1 (free or premium) or 2. */
  readonly rewards?: readonly BattlePassReward[];
}

/**
 * Decide whether a user may claim `tier`. Server-authoritative — the UI
 * may render anything but the server is the gate.
 *
 * - Tiers must be claimed in order (no skipping). This makes the audit
 *   trail readable and removes a class of off-by-one bugs.
 * - The free reward is always granted if present. The premium reward is
 *   granted only when `state.premium === true`.
 * - When neither track has a reward at `tier` we return `no_reward` so
 *   the catalog author notices missing config in QA.
 */
export const evaluateClaim = (
  tracks: BattlePassTracks,
  tier: number,
  state: {
    readonly xp: number;
    readonly claimedTier: number;
    readonly premium: boolean;
  },
): ClaimEligibility => {
  if (!isPosInt(tier) || tier > MAX_TIER) {
    return { ok: false, reason: "tier_out_of_range" };
  }
  if (tier <= state.claimedTier) return { ok: false, reason: "already_claimed" };
  if (tier !== state.claimedTier + 1) {
    return { ok: false, reason: "must_claim_in_order" };
  }
  if (tierFromXp(state.xp) < tier) {
    return { ok: false, reason: "tier_locked" };
  }

  const rewards: BattlePassReward[] = [];
  const freeReward = tracks.free.find((t) => t.tier === tier)?.reward;
  if (freeReward) rewards.push(freeReward);
  if (state.premium) {
    const premiumReward = tracks.premium.find((t) => t.tier === tier)?.reward;
    if (premiumReward) rewards.push(premiumReward);
  }
  if (rewards.length === 0) return { ok: false, reason: "no_reward" };

  return { ok: true, rewards };
};

// ── Season window ──────────────────────────────────────────────────────

export const isSeasonActive = (startsAt: Date, endsAt: Date, now: Date): boolean =>
  now.getTime() >= startsAt.getTime() && now.getTime() < endsAt.getTime();
