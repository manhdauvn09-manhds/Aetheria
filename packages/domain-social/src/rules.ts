// Aetheria — pure social/moderation rules.
//
// No DB / I/O. Service layers (chat / guild / friends) feed in raw
// content + history + clocks and receive deterministic verdicts. The
// same helpers power client-side optimistic UI (e.g. greying out the
// send button while muted, or showing a length counter).

import { containsProfanity } from "./profanity.js";
import type {
  ChannelType,
  ContentLimits,
  RateLimitPolicy,
  RateLimitResult,
  ValidationResult,
} from "./types.js";

/** Channel-default content limits. Tuned for chat; guild names use shorter. */
export const DEFAULT_CONTENT_LIMITS: ContentLimits = {
  maxChars: 500,
  maxLines: 8,
};

/** Channel-default rate limits. */
export const DEFAULT_RATE_LIMITS: Readonly<Record<ChannelType, RateLimitPolicy>> = {
  global: { windowMs: 10_000, maxInWindow: 3 },
  guild: { windowMs: 10_000, maxInWindow: 5 },
  party: { windowMs: 10_000, maxInWindow: 8 },
  whisper: { windowMs: 10_000, maxInWindow: 5 },
};

// Reject ASCII control characters (excluding \t \n \r which are normal
// in chat). \x7F = DEL.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * Validate a chat / message body. Trims surrounding whitespace, rejects
 * empty / over-long / multi-line-spam / control-char payloads, and flags
 * profanity hits without rejecting (callers decide whether to redact or
 * audit-flag).
 */
export const validateContent = (
  raw: string,
  limits: ContentLimits = DEFAULT_CONTENT_LIMITS,
  profanityList?: readonly string[],
): ValidationResult => {
  if (CONTROL_CHAR_RE.test(raw)) {
    return { ok: false, reason: "control_chars" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > limits.maxChars) return { ok: false, reason: "too_long" };
  const lineCount = trimmed.split(/\r?\n/).length;
  if (lineCount > limits.maxLines) return { ok: false, reason: "too_many_lines" };
  const flagged = containsProfanity(trimmed, profanityList);
  return { ok: true, content: trimmed, flagged };
};

/**
 * Sliding-window rate-limit check. `history` is a sorted (or unsorted —
 * we filter) list of past send timestamps in ms-since-epoch for the same
 * (user, channel) tuple. Returns `retryAfterMs` when the budget is spent.
 */
export const checkRateLimit = (
  history: readonly number[],
  now: number,
  policy: RateLimitPolicy,
): RateLimitResult => {
  const windowStart = now - policy.windowMs;
  const inWindow = history.filter((t) => t > windowStart);
  if (inWindow.length < policy.maxInWindow) return { ok: true };
  const oldest = Math.min(...inWindow);
  const retryAfterMs = Math.max(1, oldest + policy.windowMs - now);
  return { ok: false, retryAfterMs };
};

/** True iff the user is muted at `now`. `muteUntil` may be `null`. */
export const isMutedAt = (muteUntil: Date | null, now: Date): boolean =>
  muteUntil !== null && muteUntil.getTime() > now.getTime();

/**
 * Combined audit-flag heuristic for a freshly validated message. A
 * message is flagged when it contains profanity OR when the same content
 * was repeated by the same user `repeatThreshold`+ times within the rate
 * window — the cheap-and-effective spam signal.
 */
export const shouldFlagMessage = (params: {
  readonly content: string;
  readonly recentSameContentCount: number;
  readonly repeatThreshold?: number;
  readonly profanityList?: readonly string[];
}): boolean => {
  const threshold = params.repeatThreshold ?? 3;
  if (params.recentSameContentCount >= threshold) return true;
  return containsProfanity(params.content, params.profanityList);
};
