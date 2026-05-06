import { describe, expect, it } from "vitest";

import {
  bracketWidth,
  decodeMember,
  encodeMember,
  isPairable,
  isPvpMode,
  isPvpRegion,
  proposeMatches,
  queueKey,
} from "../rules.js";
import { DEFAULT_BRACKET, type QueueEntry } from "../types.js";

const entry = (overrides: Partial<QueueEntry>): QueueEntry => ({
  userId: 1n,
  mode: "1v1",
  region: "na",
  mmr: 1000,
  joinedAt: 0,
  ...overrides,
});

describe("type guards", () => {
  it("isPvpMode", () => {
    expect(isPvpMode("1v1")).toBe(true);
    expect(isPvpMode("3v3")).toBe(true);
    expect(isPvpMode("5v5")).toBe(false);
  });

  it("isPvpRegion", () => {
    expect(isPvpRegion("na")).toBe(true);
    expect(isPvpRegion("eu")).toBe(true);
    expect(isPvpRegion("ap")).toBe(true);
    expect(isPvpRegion("sa")).toBe(false);
  });
});

describe("queueKey + member encoding", () => {
  it("queueKey is stable", () => {
    expect(queueKey("1v1", "na")).toBe("aetheria:pvp:q:1v1:na");
  });

  it("encode/decode round-trip", () => {
    const m = encodeMember(42n, 1_700_000_000_000);
    expect(m).toBe("42:1700000000000");
    expect(decodeMember(m)).toEqual({ userId: 42n, joinedAtMs: 1_700_000_000_000 });
  });

  it("decodeMember rejects malformed input", () => {
    expect(decodeMember("garbage")).toBeNull();
    expect(decodeMember(":42")).toBeNull();
    expect(decodeMember("a:42")).toBeNull();
    expect(decodeMember("42:abc")).toBeNull();
  });
});

describe("bracketWidth", () => {
  it("starts at initialWidth and ramps with seconds", () => {
    expect(bracketWidth(0)).toBe(DEFAULT_BRACKET.initialWidth);
    expect(bracketWidth(1000)).toBe(DEFAULT_BRACKET.initialWidth + DEFAULT_BRACKET.widthPerSecond);
    expect(bracketWidth(10_000)).toBe(
      DEFAULT_BRACKET.initialWidth + 10 * DEFAULT_BRACKET.widthPerSecond,
    );
  });

  it("clamps at maxWidth", () => {
    expect(bracketWidth(10_000_000)).toBe(DEFAULT_BRACKET.maxWidth);
  });

  it("treats negative elapsed as zero", () => {
    expect(bracketWidth(-1000)).toBe(DEFAULT_BRACKET.initialWidth);
  });
});

describe("isPairable", () => {
  it("true within combined bracket", () => {
    const a = entry({ userId: 1n, mmr: 1000, joinedAt: 0 });
    const b = entry({ userId: 2n, mmr: 1040, joinedAt: 0 });
    expect(isPairable(a, b, 0)).toBe(true); // delta 40 ≤ initialWidth 50
  });

  it("false outside both brackets", () => {
    const a = entry({ userId: 1n, mmr: 1000, joinedAt: 0 });
    const b = entry({ userId: 2n, mmr: 1500, joinedAt: 0 });
    expect(isPairable(a, b, 0)).toBe(false);
  });

  it("widens with time so distant ratings can pair eventually", () => {
    const a = entry({ userId: 1n, mmr: 1000, joinedAt: 0 });
    const b = entry({ userId: 2n, mmr: 1300, joinedAt: 30_000 });
    // After ~30s the older waiter (a) gets width 50 + 30*25 = 800; pairable.
    expect(isPairable(a, b, 60_000)).toBe(true);
  });

  it("rejects self-pair", () => {
    const a = entry({ userId: 1n, mmr: 1000 });
    expect(isPairable(a, a, 0)).toBe(false);
  });
});

describe("proposeMatches", () => {
  it("returns empty for <2 entries", () => {
    expect(proposeMatches([], 0)).toEqual([]);
    expect(proposeMatches([entry({ userId: 1n })], 0)).toEqual([]);
  });

  it("greedily pairs longest-waiting first", () => {
    const a = entry({ userId: 1n, mmr: 1000, joinedAt: 0 });
    const b = entry({ userId: 2n, mmr: 1020, joinedAt: 100 });
    const c = entry({ userId: 3n, mmr: 1010, joinedAt: 200 });
    const props = proposeMatches([a, b, c], 1_000);
    expect(props.length).toBe(1);
    const ids = [props[0]!.a.userId, props[0]!.b.userId].sort();
    expect(ids).toEqual([1n, 2n]);
  });

  it("skips entries with no compatible partner", () => {
    const a = entry({ userId: 1n, mmr: 1000, joinedAt: 0 });
    const b = entry({ userId: 2n, mmr: 5000, joinedAt: 0 });
    expect(proposeMatches([a, b], 0)).toEqual([]);
  });

  it("never pairs the same user twice in one tick", () => {
    const a = entry({ userId: 1n, mmr: 1000, joinedAt: 0 });
    const b = entry({ userId: 2n, mmr: 1010, joinedAt: 100 });
    const c = entry({ userId: 3n, mmr: 1020, joinedAt: 200 });
    const d = entry({ userId: 4n, mmr: 1030, joinedAt: 300 });
    const props = proposeMatches([a, b, c, d], 1_000);
    const allIds = props.flatMap((p) => [p.a.userId, p.b.userId]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
