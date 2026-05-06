import { describe, expect, it } from "vitest";

import { lbKey, slidingWindow } from "../leaderboard.js";

describe("lbKey", () => {
  it("namespaces by mode + seasonId", () => {
    expect(lbKey("1v1", "1")).toBe("aetheria:lb:1v1:1");
    expect(lbKey("3v3", "spring-2026")).toBe("aetheria:lb:3v3:spring-2026");
  });
});

describe("slidingWindow", () => {
  it("centres around rank when there's room", () => {
    expect(slidingWindow(50, 5, 1000)).toEqual({ low: 45, high: 55 });
  });

  it("clamps low to 0 near the top", () => {
    expect(slidingWindow(2, 5, 1000)).toEqual({ low: 0, high: 7 });
  });

  it("clamps high to total-1 near the bottom", () => {
    expect(slidingWindow(998, 5, 1000)).toEqual({ low: 993, high: 999 });
  });

  it("returns empty range when total is zero", () => {
    expect(slidingWindow(0, 5, 0)).toEqual({ low: 0, high: -1 });
  });

  it("treats negative radius as zero", () => {
    expect(slidingWindow(10, -3, 100)).toEqual({ low: 10, high: 10 });
  });
});
