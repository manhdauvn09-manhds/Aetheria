import { describe, expect, it } from "vitest";

import {
  checkRateLimit,
  DEFAULT_CONTENT_LIMITS,
  DEFAULT_RATE_LIMITS,
  isMutedAt,
  shouldFlagMessage,
  validateContent,
} from "../rules.js";

describe("validateContent", () => {
  it("trims and accepts a clean message", () => {
    const r = validateContent("  hello  ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toBe("hello");
      expect(r.flagged).toBe(false);
    }
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateContent("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects oversize messages", () => {
    const long = "a".repeat(DEFAULT_CONTENT_LIMITS.maxChars + 1);
    expect(validateContent(long)).toEqual({ ok: false, reason: "too_long" });
  });

  it("rejects too-many-lines", () => {
    const many = Array.from({ length: DEFAULT_CONTENT_LIMITS.maxLines + 1 }, () => "x").join("\n");
    expect(validateContent(many)).toEqual({ ok: false, reason: "too_many_lines" });
  });

  it("rejects control chars", () => {
    expect(validateContent("hi\x07there")).toEqual({ ok: false, reason: "control_chars" });
  });

  it("flags profanity but does not reject", () => {
    const r = validateContent("oh fuck");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flagged).toBe(true);
  });
});

describe("checkRateLimit", () => {
  const policy = DEFAULT_RATE_LIMITS.global;

  it("allows when under budget", () => {
    expect(checkRateLimit([], 1_000, policy)).toEqual({ ok: true });
    expect(checkRateLimit([900], 1_000, policy)).toEqual({ ok: true });
  });

  it("blocks at the cap and reports retry-after", () => {
    const now = 10_000;
    const hist = [9_000, 9_500, 9_900];
    const r = checkRateLimit(hist, now, policy);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
      expect(r.retryAfterMs).toBeLessThanOrEqual(policy.windowMs);
    }
  });

  it("ignores history outside the window", () => {
    const now = 100_000;
    const hist = [10, 20, 30, 40]; // ancient
    expect(checkRateLimit(hist, now, policy)).toEqual({ ok: true });
  });
});

describe("isMutedAt", () => {
  it("returns true while mute window is open", () => {
    expect(isMutedAt(new Date("2026-05-05T01:00:00Z"), new Date("2026-05-05T00:30:00Z"))).toBe(true);
  });

  it("returns false after expiry / when null", () => {
    expect(isMutedAt(new Date("2026-05-05T00:00:00Z"), new Date("2026-05-05T01:00:00Z"))).toBe(false);
    expect(isMutedAt(null, new Date())).toBe(false);
  });
});

describe("shouldFlagMessage", () => {
  it("flags repeated identical content (spam)", () => {
    expect(
      shouldFlagMessage({ content: "hi", recentSameContentCount: 3 }),
    ).toBe(true);
  });

  it("flags profanity", () => {
    expect(
      shouldFlagMessage({ content: "fuck", recentSameContentCount: 0 }),
    ).toBe(true);
  });

  it("does not flag clean unique content", () => {
    expect(
      shouldFlagMessage({ content: "good evening", recentSameContentCount: 0 }),
    ).toBe(false);
  });
});
