import { describe, expect, it } from "vitest";

import type { JobDefinition } from "../jobs/types.js";
import { computeInitialDelay } from "../scheduler.js";

const job = (overrides: Partial<JobDefinition> = {}): JobDefinition => ({
  name: "j",
  intervalMs: 60_000,
  lockTtlMs: 30_000,
  // eslint-disable-next-line @typescript-eslint/require-await
  run: async () => undefined,
  ...overrides,
});

describe("computeInitialDelay", () => {
  it("uses explicit value when provided", () => {
    expect(computeInitialDelay(job({ initialDelayMs: 0 }))).toBe(0);
    expect(computeInitialDelay(job({ initialDelayMs: 5_000 }))).toBe(5_000);
  });

  it("clamps explicit negatives to 0", () => {
    expect(computeInitialDelay(job({ initialDelayMs: -100 }))).toBe(0);
  });

  it("defaults to interval/4, capped at 30s", () => {
    expect(computeInitialDelay(job({ intervalMs: 1_000 }))).toBe(250);
    expect(computeInitialDelay(job({ intervalMs: 60_000 }))).toBe(15_000);
    expect(computeInitialDelay(job({ intervalMs: 600_000 }))).toBe(30_000);
  });
});
