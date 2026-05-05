// Aetheria — quests domain types.
//
// Quest catalog rows store `requirements` and `rewards` as opaque JSON
// (see `prisma/mysql/schema.prisma`). This file gives them types and
// the rules layer (`rules.ts`) parses them defensively at the boundary.

export type QuestKind = "daily" | "weekly" | "seasonal" | "story";

export type QuestStatus = "active" | "completed" | "claimed";

/**
 * Discriminated union of progress requirements. Each kind binds to a
 * single `DomainEvent` type emitted by the bus.
 */
export type QuestRequirement =
  | { readonly kind: "craft_item"; readonly count: number; readonly itemId?: string }
  | { readonly kind: "defeat_enemies"; readonly count: number; readonly archetype?: string }
  | { readonly kind: "complete_levels"; readonly count: number; readonly levelId?: string }
  | { readonly kind: "level_up"; readonly targetLevel: number }
  | {
      readonly kind: "finish_runs";
      readonly count: number;
      readonly status?: "completed" | "failed" | "abandoned";
    };

/**
 * Reward payloads. MVP supports items + account XP. Currency / cosmetic
 * grants come online when their respective domains land.
 */
export type QuestReward =
  | { readonly kind: "item"; readonly itemId: string; readonly quantity: number }
  | { readonly kind: "xp"; readonly amount: number };

/**
 * Per-user progress JSON. `count` is the cardinal counter for `count`-based
 * requirements (craft_item / defeat_enemies / complete_levels / finish_runs).
 * `targetLevel` requirements use `count` to record the highest reached
 * level.
 */
export interface QuestProgress {
  readonly count: number;
}

export interface QuestCatalog {
  readonly questId: string;
  readonly type: QuestKind;
  readonly requirement: QuestRequirement;
  readonly rewards: readonly QuestReward[];
  readonly activeFrom: Date;
  readonly activeTo: Date;
}

export interface QuestEntry {
  readonly quest: QuestCatalog;
  readonly progress: QuestProgress;
  readonly status: QuestStatus;
  readonly claimedAt: Date | null;
  /** True when the requirement is satisfied (status auto-promotes to `completed`). */
  readonly isComplete: boolean;
}

export interface QuestListResult {
  readonly entries: readonly QuestEntry[];
}

// ── Service inputs ──────────────────────────────────────────────────────

export interface QuestListInput {
  readonly userId: bigint;
  /** Defaults to `new Date()` when omitted (production calls). Tests pin it. */
  readonly now?: Date;
}

export interface QuestClaimInput {
  readonly userId: bigint;
  readonly questId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface QuestClaimResult {
  readonly questId: string;
  readonly granted: readonly {
    readonly kind: QuestReward["kind"];
    readonly itemId?: string;
    readonly quantity?: number;
    readonly amount?: number;
  }[];
  /** Level-ups produced by xp rewards, if any. */
  readonly leveledUp: readonly {
    readonly from: number;
    readonly to: number;
    readonly milestoneIds: readonly string[];
  }[];
}
