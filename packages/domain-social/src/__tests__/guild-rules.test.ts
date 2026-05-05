import { describe, expect, it } from "vitest";

import {
  canInvite,
  canKick,
  canPromote,
  canStartRaid,
  GUILD_NAME_MAX,
  GUILD_NAME_MIN,
  GUILD_TAG_MAX,
  GUILD_TAG_MIN,
  inviteExpiresAt,
  isHigherRank,
  isInviteFresh,
} from "../guild/rules.js";

describe("isHigherRank", () => {
  it("orders leader > officer > member", () => {
    expect(isHigherRank("leader", "officer")).toBe(true);
    expect(isHigherRank("officer", "member")).toBe(true);
    expect(isHigherRank("leader", "member")).toBe(true);
    expect(isHigherRank("member", "officer")).toBe(false);
    expect(isHigherRank("officer", "leader")).toBe(false);
    expect(isHigherRank("officer", "officer")).toBe(false);
  });
});

describe("canInvite", () => {
  it("allows leader + officer, blocks member", () => {
    expect(canInvite("leader")).toBe(true);
    expect(canInvite("officer")).toBe(true);
    expect(canInvite("member")).toBe(false);
  });
});

describe("canKick", () => {
  it("leader can kick officer + member, never leader", () => {
    expect(canKick("leader", "officer")).toBe(true);
    expect(canKick("leader", "member")).toBe(true);
    expect(canKick("leader", "leader")).toBe(false);
  });

  it("officer can kick member only", () => {
    expect(canKick("officer", "member")).toBe(true);
    expect(canKick("officer", "officer")).toBe(false);
    expect(canKick("officer", "leader")).toBe(false);
  });

  it("member cannot kick anyone", () => {
    expect(canKick("member", "member")).toBe(false);
    expect(canKick("member", "officer")).toBe(false);
    expect(canKick("member", "leader")).toBe(false);
  });
});

describe("canPromote", () => {
  it("leader-only", () => {
    expect(canPromote("officer", "member", "officer")).toBe(false);
    expect(canPromote("member", "member", "officer")).toBe(false);
  });

  it("rejects no-op (current === next)", () => {
    expect(canPromote("leader", "officer", "officer")).toBe(false);
  });

  it("allows leader to change roles otherwise", () => {
    expect(canPromote("leader", "member", "officer")).toBe(true);
    expect(canPromote("leader", "officer", "member")).toBe(true);
    expect(canPromote("leader", "officer", "leader")).toBe(true);
  });
});

describe("canStartRaid", () => {
  it("leader-only", () => {
    expect(canStartRaid("leader")).toBe(true);
    expect(canStartRaid("officer")).toBe(false);
    expect(canStartRaid("member")).toBe(false);
  });
});

describe("invite TTL helpers", () => {
  it("inviteExpiresAt defaults to +7d", () => {
    const now = new Date("2026-05-05T00:00:00Z");
    const exp = inviteExpiresAt(now);
    expect(exp.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("inviteExpiresAt accepts custom ttl", () => {
    const now = new Date("2026-05-05T00:00:00Z");
    expect(inviteExpiresAt(now, 1000).getTime()).toBe(now.getTime() + 1000);
  });

  it("isInviteFresh true before expiry, false after", () => {
    const exp = new Date("2026-05-10T00:00:00Z");
    expect(isInviteFresh(exp, new Date("2026-05-09T23:59:59Z"))).toBe(true);
    expect(isInviteFresh(exp, new Date("2026-05-10T00:00:01Z"))).toBe(false);
  });
});

describe("name + tag bounds", () => {
  it("are sane", () => {
    expect(GUILD_NAME_MIN).toBeGreaterThan(0);
    expect(GUILD_NAME_MAX).toBeGreaterThan(GUILD_NAME_MIN);
    expect(GUILD_TAG_MIN).toBeGreaterThan(0);
    expect(GUILD_TAG_MAX).toBeGreaterThan(GUILD_TAG_MIN);
  });
});
