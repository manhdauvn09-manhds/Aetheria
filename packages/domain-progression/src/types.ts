// Aetheria — progression types.
//
// Pure-domain shapes for the account-level XP track. The engine is
// authoritative: server replays `addXp` against the persisted progression
// to award rewards; clients call the same code for optimistic UI.

/** Account level. Range: [MIN_LEVEL, MAX_LEVEL] (1..100). */
export type Level = number;

/** Non-negative XP integer. */
export type Xp = number;

export interface Progression {
  /** Current level, clamped to [MIN_LEVEL, MAX_LEVEL]. */
  readonly level: Level;
  /**
   * XP banked toward the next level — i.e. `0..xpForLevel(level)-1`.
   * At level === MAX_LEVEL, this is always 0 (overflow is discarded).
   */
  readonly xpIntoLevel: Xp;
  /**
   * Total XP ever earned (monotonic, not affected by clamping at max level).
   * Useful for analytics, leaderboards, and reproducing the level history.
   */
  readonly totalXp: Xp;
}

/** Mechanic / feature unlocked when an account reaches a milestone level. */
export type MilestoneId =
  | "second_character_slot"
  | "skill_tree"
  | "photo_mode"
  | "coop"
  | "guild_raids"
  | "ranked_pvp"
  | "endless_tower"
  | "weekly_rifts";

export interface Milestone {
  readonly level: Level;
  readonly id: MilestoneId;
  /** Stable i18n key the UI / notification layer can resolve. */
  readonly i18nKey: string;
}

/** Single level-up event surfaced by `addXp`. */
export interface LeveledUpEvent {
  readonly type: "leveled_up";
  readonly from: Level;
  readonly to: Level;
  /** Milestones whose level === `to`, if any. */
  readonly milestones: readonly Milestone[];
}

export interface AddXpResult {
  readonly progression: Progression;
  /** All level-ups that fired in order (may be empty, may span multiple levels). */
  readonly events: readonly LeveledUpEvent[];
  /**
   * XP that fell off the top because the account is at MAX_LEVEL.
   * Callers (battle pass, premium currency conversion) can repurpose it.
   */
  readonly overflowXp: Xp;
}
