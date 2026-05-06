import { describe, expect, it } from "vitest";

import { isKnownEvent, isPayloadShallow, KNOWN_EVENTS, MAX_BATCH } from "../rules.js";

describe("isKnownEvent", () => {
  it("matches the known set", () => {
    for (const e of KNOWN_EVENTS) expect(isKnownEvent(e)).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isKnownEvent("snake_oil")).toBe(false);
    expect(isKnownEvent("")).toBe(false);
  });
});

describe("isPayloadShallow", () => {
  it("accepts null/undefined/missing", () => {
    expect(isPayloadShallow(null)).toBe(true);
    expect(isPayloadShallow(undefined)).toBe(true);
    expect(isPayloadShallow({})).toBe(true);
  });
  it("accepts flat string/number/boolean/null", () => {
    expect(isPayloadShallow({ a: "x", b: 1, c: true, d: null })).toBe(true);
  });
  it("rejects nested objects/arrays", () => {
    expect(isPayloadShallow({ a: { b: 1 } })).toBe(false);
    expect(isPayloadShallow({ a: [1] })).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isPayloadShallow("x")).toBe(false);
    expect(isPayloadShallow(42)).toBe(false);
  });
});

describe("MAX_BATCH", () => {
  it("is sane", () => {
    expect(MAX_BATCH).toBeGreaterThan(0);
    expect(MAX_BATCH).toBeLessThanOrEqual(200);
  });
});
