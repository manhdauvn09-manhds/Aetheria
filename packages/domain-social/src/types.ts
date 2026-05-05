// Aetheria — social moderation types.
//
// Pure data shapes shared by content validation, rate-limit checks, and
// mute-window helpers. Channel kinds mirror `ChatMessage.channelType` in
// `schema-db` (global / guild / party / whisper) so rule callers can key
// limits per channel without duplicating the enum.

import type { ChannelType } from "@aetheria/shared-types";

export type { ChannelType };

/** Why `validateContent` rejected a message. Pinned codes for i18n. */
export type ContentRejectReason =
  | "empty"
  | "too_long"
  | "too_many_lines"
  | "control_chars";

export type ValidationResult =
  | { readonly ok: true; readonly content: string; readonly flagged: boolean }
  | { readonly ok: false; readonly reason: ContentRejectReason };

/** Per-channel send budget. `windowMs` rolling window, max sends inside it. */
export interface RateLimitPolicy {
  readonly windowMs: number;
  readonly maxInWindow: number;
}

export type RateLimitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly retryAfterMs: number };

/** Tunable knobs for `validateContent`. Defaults live in `rules.ts`. */
export interface ContentLimits {
  readonly maxChars: number;
  readonly maxLines: number;
}
