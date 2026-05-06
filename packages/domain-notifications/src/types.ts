// Aetheria — notifications domain types.

/**
 * Canonical notification kinds. Anything else passed to `push()` will be
 * stored verbatim but will not be surfaced by `categoryOf` mappings.
 */
export type NotificationType =
  | "level_up"
  | "quest_complete"
  | "battlepass_tier"
  | "guild_invite"
  | "friend_request"
  | "pvp_match_start"
  | "pvp_match_end"
  | "shop_purchase"
  | "system";

export interface NotificationRow {
  readonly notificationId: bigint;
  readonly userId: bigint;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface PushInput {
  readonly userId: bigint;
  /** Use `NotificationType` for known kinds; arbitrary strings are accepted. */
  readonly type: string;
  readonly payload?: Record<string, unknown>;
}

export interface ListInput {
  readonly userId: bigint;
  readonly limit?: number;
  readonly unreadOnly?: boolean;
}

export interface MarkReadInput {
  readonly userId: bigint;
  readonly notificationIds?: readonly bigint[];
  /** When true (and `notificationIds` empty), marks every unread row read. */
  readonly all?: boolean;
}
