import { describe, expect, it } from "vitest";

import { categoryOf, isKnownType, parsePayload } from "../rules.js";

describe("isKnownType", () => {
  it("recognises canonical kinds", () => {
    expect(isKnownType("level_up")).toBe(true);
    expect(isKnownType("guild_invite")).toBe(true);
    expect(isKnownType("system")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isKnownType("snake_oil")).toBe(false);
    expect(isKnownType("")).toBe(false);
  });
});

describe("categoryOf", () => {
  it("buckets known kinds", () => {
    expect(categoryOf("level_up")).toBe("progress");
    expect(categoryOf("quest_complete")).toBe("progress");
    expect(categoryOf("battlepass_tier")).toBe("progress");
    expect(categoryOf("guild_invite")).toBe("social");
    expect(categoryOf("friend_request")).toBe("social");
    expect(categoryOf("pvp_match_start")).toBe("pvp");
    expect(categoryOf("pvp_match_end")).toBe("pvp");
    expect(categoryOf("shop_purchase")).toBe("shop");
    expect(categoryOf("system")).toBe("system");
  });

  it("falls back to system for unknown kinds", () => {
    expect(categoryOf("custom_event")).toBe("system");
  });
});

describe("parsePayload", () => {
  it("returns the object as-is when valid", () => {
    expect(parsePayload({ a: 1 })).toEqual({ a: 1 });
  });

  it("defaults to {} on null / non-object", () => {
    expect(parsePayload(null)).toEqual({});
    expect(parsePayload(undefined)).toEqual({});
    expect(parsePayload("garbage")).toEqual({});
    expect(parsePayload(42)).toEqual({});
  });
});
