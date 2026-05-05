// Aetheria — battle pass types.
//
// Schema constraint: `BattlePassProgress` stores a single `tier` int (highest
// claimed) + `xp` + `premium`. We model claims as one step per tier that
// atomically grants both the free reward and (if `premium` is on) the
// premium reward for that tier. The free-only / premium-only split lives
// in the catalog, not in the per-user state.

/** Reward shape mirrors the quest reward; keep in sync if either evolves. */
export type BattlePassReward =
  | { readonly kind: "item"; readonly itemId: string; readonly quantity: number }
  | { readonly kind: "xp"; readonly amount: number };

export interface BattlePassTier {
  readonly tier: number;
  readonly reward: BattlePassReward;
}

export interface BattlePassTracks {
  readonly free: readonly BattlePassTier[];
  readonly premium: readonly BattlePassTier[];
}

export interface BattlePassSeasonCatalog {
  readonly seasonId: string;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly tracks: BattlePassTracks;
  /** Highest tier index present in either track. 0 when both empty. */
  readonly maxTier: number;
}

export interface BattlePassUserState {
  readonly seasonId: string;
  readonly xp: number;
  /** Tier reached from XP (computed via the curve). */
  readonly currentTier: number;
  /** Highest tier number already claimed (0 = none). */
  readonly claimedTier: number;
  readonly premium: boolean;
}

export interface BattlePassEntry {
  readonly season: BattlePassSeasonCatalog;
  readonly state: BattlePassUserState;
}

// ── Inputs / Results ───────────────────────────────────────────────────

export interface CurrentSeasonInput {
  readonly now?: Date;
}

export interface CurrentSeasonResult {
  readonly season: BattlePassSeasonCatalog | null;
}

export interface ProgressInput {
  readonly userId: bigint;
  readonly now?: Date;
}

export type ProgressResult =
  | { readonly season: null }
  | BattlePassEntry;

export interface ClaimInput {
  readonly userId: bigint;
  readonly seasonId: bigint;
  readonly tier: number;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface ClaimResult {
  readonly seasonId: string;
  readonly tier: number;
  readonly granted: readonly BattlePassReward[];
  readonly leveledUp: readonly {
    readonly from: number;
    readonly to: number;
    readonly milestoneIds: readonly string[];
  }[];
}
