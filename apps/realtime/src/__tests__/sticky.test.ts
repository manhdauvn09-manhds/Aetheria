import { describe, expect, it } from "vitest";

import { fnv1a32, shardForUser, STICKY_COOKIE_NAME } from "../sticky.js";

describe("fnv1a32", () => {
  it("matches known FNV-1a outputs", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
  });

  it("is deterministic", () => {
    expect(fnv1a32("aetheria")).toBe(fnv1a32("aetheria"));
  });

  it("differs across distinct inputs", () => {
    expect(fnv1a32("alice")).not.toBe(fnv1a32("bob"));
  });
});

describe("shardForUser", () => {
  it("returns 0 when single instance", () => {
    expect(shardForUser("123", 1)).toBe(0);
    expect(shardForUser("123", 0)).toBe(0);
  });

  it("returns within [0, instances)", () => {
    for (let u = 1n; u <= 50n; u++) {
      const s = shardForUser(u, 4);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(4);
    }
  });

  it("is stable across string vs bigint", () => {
    expect(shardForUser(42n, 8)).toBe(shardForUser("42", 8));
  });
});

describe("STICKY_COOKIE_NAME", () => {
  it("is a non-empty string", () => {
    expect(STICKY_COOKIE_NAME.length).toBeGreaterThan(0);
  });
});
