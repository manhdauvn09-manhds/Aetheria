import { describe, expect, it } from "vitest";

import {
  applyDiscount,
  canAfford,
  refundQuantity,
  isCurrency,
  isShopItemActive,
  isWithinRefundWindow,
  lineTotal,
  REFUND_WINDOW_MS,
  toCurrency,
} from "../rules.js";

describe("currency guards", () => {
  it("isCurrency", () => {
    expect(isCurrency("gold")).toBe(true);
    expect(isCurrency("aether")).toBe(true);
    expect(isCurrency("usd")).toBe(false);
  });

  it("toCurrency parses + falls back", () => {
    expect(toCurrency("aether")).toBe("aether");
    expect(toCurrency("garbage")).toBe("gold");
    expect(toCurrency(42)).toBe("gold");
  });
});

describe("applyDiscount", () => {
  it("clamps bp to [0, 10000]", () => {
    expect(applyDiscount(100, 0)).toBe(100);
    expect(applyDiscount(100, 10_000)).toBe(0);
    expect(applyDiscount(100, -50)).toBe(100);
    expect(applyDiscount(100, 50_000)).toBe(0);
  });

  it("integer math (rounds down)", () => {
    expect(applyDiscount(199, 1_500)).toBe(170); // 199 - floor(199*0.15) = 199-29
  });

  it("zero base → zero", () => {
    expect(applyDiscount(0, 5_000)).toBe(0);
    expect(applyDiscount(-10, 0)).toBe(0);
  });
});

describe("isWithinRefundWindow", () => {
  it("true within default 24h window", () => {
    const now = new Date("2026-05-05T12:00:00Z");
    expect(isWithinRefundWindow(new Date("2026-05-05T00:00:00Z"), now)).toBe(true);
  });

  it("false past 24h", () => {
    const now = new Date("2026-05-06T12:00:01Z");
    expect(isWithinRefundWindow(new Date("2026-05-05T12:00:00Z"), now)).toBe(false);
  });

  it("respects custom window", () => {
    const now = new Date(REFUND_WINDOW_MS + 1_000);
    expect(isWithinRefundWindow(new Date(0), now, 2_000)).toBe(false);
    expect(isWithinRefundWindow(new Date(now.getTime() - 1_000), now, 2_000)).toBe(true);
  });
});

describe("isShopItemActive", () => {
  it("inclusive-from / exclusive-to", () => {
    const a = new Date("2026-05-01T00:00:00Z");
    const b = new Date("2026-05-31T00:00:00Z");
    expect(isShopItemActive(a, b, a)).toBe(true);
    expect(isShopItemActive(a, b, new Date("2026-05-15T00:00:00Z"))).toBe(true);
    expect(isShopItemActive(a, b, b)).toBe(false);
    expect(isShopItemActive(a, b, new Date("2026-04-30T23:59:59Z"))).toBe(false);
  });
});

describe("canAfford", () => {
  it("balance ≥ price", () => {
    expect(canAfford(100, 100)).toBe(true);
    expect(canAfford(100, 99)).toBe(true);
    expect(canAfford(99, 100)).toBe(false);
    expect(canAfford(100, -1)).toBe(false);
  });
});

describe("lineTotal", () => {
  it("price × floor(qty) with discount", () => {
    expect(lineTotal(100, 3)).toBe(300);
    expect(lineTotal(100, 3, 1_000)).toBe(270); // 10% off
    expect(lineTotal(100, 3.7)).toBe(300); // floor
    expect(lineTotal(100, 0)).toBe(0);
    expect(lineTotal(100, -1)).toBe(0);
  });
});

describe("refundQuantity (R1 fix)", () => {
  it("recovers integer quantity from amount/price", () => {
    expect(refundQuantity(300, 100)).toBe(3);
    expect(refundQuantity(99, 100)).toBe(1);   // amount > 0 floors to ≥1
    expect(refundQuantity(1000, 250)).toBe(4);
  });

  it("returns 0 on non-positive inputs", () => {
    expect(refundQuantity(0, 100)).toBe(0);
    expect(refundQuantity(100, 0)).toBe(0);
    expect(refundQuantity(-50, 100)).toBe(0);
    expect(refundQuantity(100, -1)).toBe(0);
  });

  it("never goes below 1 for positive inputs (rounding floor)", () => {
    expect(refundQuantity(50, 100)).toBe(1);
  });
});
