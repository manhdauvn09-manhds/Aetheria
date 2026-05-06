import { describe, expect, it } from "vitest";

import { isOutlier, median } from "../jobs/stats.js";

describe("median", () => {
  it("returns 0 on empty", () => {
    expect(median([])).toBe(0);
  });

  it("odd-length picks the middle", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("even-length averages the middle pair", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("ignores input order", () => {
    expect(median([10, 1, 5])).toBe(5);
  });
});

describe("isOutlier", () => {
  it("requires positive median", () => {
    expect(isOutlier(100, 0, 3)).toBe(false);
    expect(isOutlier(100, -5, 3)).toBe(false);
  });

  it("flags scores above factor × median", () => {
    expect(isOutlier(301, 100, 3)).toBe(true);
    expect(isOutlier(300, 100, 3)).toBe(false);
    expect(isOutlier(299, 100, 3)).toBe(false);
  });
});
