// Aetheria — pure notification helpers.
//
// No DB / I/O. Used by the service to coerce JSON payloads into typed
// shapes and by the UI to bucket notifications into a tab.

import type { NotificationType } from "./types.js";

const KNOWN: readonly NotificationType[] = [
  "level_up",
  "quest_complete",
  "battlepass_tier",
  "guild_invite",
  "friend_request",
  "pvp_match_start",
  "pvp_match_end",
  "shop_purchase",
  "system",
];

export const isKnownType = (s: string): s is NotificationType =>
  (KNOWN as readonly string[]).includes(s);

export type NotificationCategory = "progress" | "social" | "pvp" | "shop" | "system";

/** Bucket each known type into a UI tab. Unknown types fall under `system`. */
export const categoryOf = (type: string): NotificationCategory => {
  switch (type) {
    case "level_up":
    case "quest_complete":
    case "battlepass_tier":
      return "progress";
    case "guild_invite":
    case "friend_request":
      return "social";
    case "pvp_match_start":
    case "pvp_match_end":
      return "pvp";
    case "shop_purchase":
      return "shop";
    default:
      return "system";
  }
};

/** Defensive parse of a JSON column → record. */
export const parsePayload = (raw: unknown): Record<string, unknown> => {
  if (raw === null || raw === undefined || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
};
