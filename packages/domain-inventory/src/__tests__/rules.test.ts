import { describe, expect, it } from "vitest";

import {
  EQUIPPABLE_TYPES,
  KNOWN_ITEM_TYPES,
  coerceItemType,
  equipSlotFor,
  evaluateCraft,
  isConsumable,
  isEquippable,
  parseRecipe,
  tryConsume,
  tryStack,
} from "../rules.js";

describe("coerceItemType", () => {
  it("returns known types as-is", () => {
    for (const t of KNOWN_ITEM_TYPES) {
      expect(coerceItemType(t)).toBe(t);
    }
  });
  it("lowercases input", () => {
    expect(coerceItemType("Weapon")).toBe("weapon");
    expect(coerceItemType("CONSUMABLE")).toBe("consumable");
  });
  it("falls back to material on unknown", () => {
    expect(coerceItemType("mystery")).toBe("material");
    expect(coerceItemType("")).toBe("material");
  });
});

describe("isEquippable / equipSlotFor", () => {
  it("only weapon/armor/relic are equippable", () => {
    expect(EQUIPPABLE_TYPES).toEqual(["weapon", "armor", "relic"]);
    expect(isEquippable("weapon")).toBe(true);
    expect(isEquippable("armor")).toBe(true);
    expect(isEquippable("relic")).toBe(true);
    expect(isEquippable("consumable")).toBe(false);
    expect(isEquippable("material")).toBe(false);
    expect(isEquippable("skin")).toBe(false);
    expect(isEquippable("cosmetic")).toBe(false);
  });
  it("equipSlotFor mirrors the equippable check", () => {
    expect(equipSlotFor("weapon")).toBe("weapon");
    expect(equipSlotFor("armor")).toBe("armor");
    expect(equipSlotFor("relic")).toBe("relic");
    expect(equipSlotFor("consumable")).toBeNull();
    expect(equipSlotFor("skin")).toBeNull();
  });
  it("isConsumable matches only consumable", () => {
    expect(isConsumable("consumable")).toBe(true);
    expect(isConsumable("weapon")).toBe(false);
  });
});

describe("tryStack", () => {
  it("succeeds when within max", () => {
    expect(tryStack(0, 5, 99)).toEqual({ ok: true, newQuantity: 5 });
    expect(tryStack(50, 49, 99)).toEqual({ ok: true, newQuantity: 99 });
  });
  it("fails on overflow", () => {
    const r = tryStack(95, 10, 99);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "stack_overflow") {
      expect(r.maxStack).toBe(99);
      expect(r.current).toBe(95);
      expect(r.requested).toBe(10);
    } else {
      throw new Error("expected stack_overflow");
    }
  });
  it("rejects non-positive add", () => {
    expect(tryStack(0, 0, 99).ok).toBe(false);
    expect(tryStack(0, -1, 99).ok).toBe(false);
  });
  it("rejects fractional values", () => {
    expect(tryStack(0, 1.5, 99).ok).toBe(false);
    expect(tryStack(0.5, 1, 99).ok).toBe(false);
  });
  it("rejects max < 1", () => {
    expect(tryStack(0, 1, 0).ok).toBe(false);
  });
});

describe("tryConsume", () => {
  it("succeeds when sufficient", () => {
    expect(tryConsume(5, 3)).toEqual({ ok: true, newQuantity: 2 });
    expect(tryConsume(3, 3)).toEqual({ ok: true, newQuantity: 0 });
  });
  it("fails on insufficient", () => {
    const r = tryConsume(2, 5);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "insufficient_quantity") {
      expect(r.current).toBe(2);
      expect(r.requested).toBe(5);
    } else {
      throw new Error("expected insufficient_quantity");
    }
  });
  it("rejects non-positive take", () => {
    expect(tryConsume(5, 0).ok).toBe(false);
    expect(tryConsume(5, -1).ok).toBe(false);
  });
  it("rejects fractional values", () => {
    expect(tryConsume(5, 1.5).ok).toBe(false);
  });
});

describe("parseRecipe", () => {
  it("parses a well-formed recipe", () => {
    const out = parseRecipe(
      { recipe: { inputs: [{ itemId: "10", quantity: 3 }, { itemId: 11, quantity: 1 }] } },
      "42",
    );
    expect(out).toEqual({
      outputItemId: "42",
      outputQuantity: 1,
      inputs: [
        { itemId: "10", quantity: 3 },
        { itemId: "11", quantity: 1 },
      ],
    });
  });
  it("respects an explicit outputQuantity", () => {
    const out = parseRecipe(
      { recipe: { inputs: [{ itemId: "1", quantity: 1 }], outputQuantity: 5 } },
      "42",
    );
    expect(out?.outputQuantity).toBe(5);
  });
  it("accepts bigint itemIds", () => {
    const out = parseRecipe(
      { recipe: { inputs: [{ itemId: 7n, quantity: 1 }] } },
      "42",
    );
    expect(out?.inputs[0]?.itemId).toBe("7");
  });
  it("returns null for missing recipe", () => {
    expect(parseRecipe({}, "42")).toBeNull();
    expect(parseRecipe(null, "42")).toBeNull();
    expect(parseRecipe(undefined, "42")).toBeNull();
    expect(parseRecipe({ recipe: null }, "42")).toBeNull();
  });
  it("returns null for malformed inputs", () => {
    expect(parseRecipe({ recipe: { inputs: "nope" } }, "42")).toBeNull();
    expect(parseRecipe({ recipe: { inputs: [] } }, "42")).toBeNull();
    expect(parseRecipe({ recipe: { inputs: [{ itemId: "1" }] } }, "42")).toBeNull();
    expect(
      parseRecipe({ recipe: { inputs: [{ itemId: "1", quantity: -1 }] } }, "42"),
    ).toBeNull();
    expect(
      parseRecipe({ recipe: { inputs: [{ itemId: "1", quantity: 1.5 }] } }, "42"),
    ).toBeNull();
    expect(
      parseRecipe({ recipe: { inputs: [{ itemId: "", quantity: 1 }] } }, "42"),
    ).toBeNull();
  });
  it("rejects self-referential recipes (output as input)", () => {
    expect(
      parseRecipe({ recipe: { inputs: [{ itemId: "42", quantity: 1 }] } }, "42"),
    ).toBeNull();
  });
  it("clamps a non-positive outputQuantity to 1", () => {
    const out = parseRecipe(
      { recipe: { inputs: [{ itemId: "1", quantity: 1 }], outputQuantity: 0 } },
      "42",
    );
    expect(out?.outputQuantity).toBe(1);
  });
});

describe("evaluateCraft", () => {
  const recipe = {
    outputItemId: "42",
    outputQuantity: 1,
    inputs: [
      { itemId: "10", quantity: 3 },
      { itemId: "11", quantity: 1 },
    ],
  } as const;

  it("ok when every input is owned in sufficient quantity", () => {
    const owned = new Map([
      ["10", 3],
      ["11", 5],
    ]);
    expect(evaluateCraft(recipe, owned)).toEqual({ ok: true });
  });
  it("flags the first missing/insufficient input", () => {
    const owned = new Map([
      ["10", 1],
      ["11", 5],
    ]);
    const r = evaluateCraft(recipe, owned);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("insufficient_quantity");
      expect(r.itemId).toBe("10");
      expect(r.need).toBe(3);
      expect(r.have).toBe(1);
    }
  });
  it("treats absent map keys as zero", () => {
    const owned = new Map([["11", 5]]);
    const r = evaluateCraft(recipe, owned);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.itemId).toBe("10");
      expect(r.have).toBe(0);
    }
  });
});
