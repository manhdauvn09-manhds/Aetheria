// Aetheria — pure rules for inventory + crafting.
//
// No DB / I/O. Service code calls into here for every mutation decision
// so the rules are unit-testable in isolation and reusable from admin
// tools and client-side previews.

import type { EquipSlot, ItemType, Recipe, RecipeInput } from "./types.js";

export const EQUIPPABLE_TYPES = ["weapon", "armor", "relic"] as const;
export type EquippableType = (typeof EQUIPPABLE_TYPES)[number];

export const KNOWN_ITEM_TYPES = [
  "weapon",
  "armor",
  "relic",
  "consumable",
  "material",
  "skin",
  "cosmetic",
] as const;

/** Coerce a free-text Item.type into the typed `ItemType`. */
export const coerceItemType = (raw: string): ItemType => {
  const lower = raw.toLowerCase();
  if ((KNOWN_ITEM_TYPES as readonly string[]).includes(lower)) {
    return lower as ItemType;
  }
  // Fall back to "material" — the most generic non-equippable bucket.
  return "material";
};

export const isEquippable = (type: ItemType): type is EquippableType =>
  (EQUIPPABLE_TYPES as readonly string[]).includes(type);

export const isConsumable = (type: ItemType): boolean => type === "consumable";

export const equipSlotFor = (type: ItemType): EquipSlot | null =>
  isEquippable(type) ? type : null;

// ── Stacking ────────────────────────────────────────────────────────────

export type StackResult =
  | { readonly ok: true; readonly newQuantity: number }
  | {
      readonly ok: false;
      readonly reason: "stack_overflow";
      readonly maxStack: number;
      readonly current: number;
      readonly requested: number;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_quantity";
      readonly value: number;
    };

export const tryStack = (
  current: number,
  addQty: number,
  maxStack: number,
): StackResult => {
  if (!Number.isInteger(current) || current < 0) {
    return { ok: false, reason: "invalid_quantity", value: current };
  }
  if (!Number.isInteger(addQty) || addQty <= 0) {
    return { ok: false, reason: "invalid_quantity", value: addQty };
  }
  if (!Number.isInteger(maxStack) || maxStack < 1) {
    return { ok: false, reason: "invalid_quantity", value: maxStack };
  }
  const next = current + addQty;
  if (next > maxStack) {
    return {
      ok: false,
      reason: "stack_overflow",
      maxStack,
      current,
      requested: addQty,
    };
  }
  return { ok: true, newQuantity: next };
};

export type ConsumeResult =
  | { readonly ok: true; readonly newQuantity: number }
  | {
      readonly ok: false;
      readonly reason: "insufficient_quantity";
      readonly current: number;
      readonly requested: number;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_quantity";
      readonly value: number;
    };

export const tryConsume = (current: number, takeQty: number): ConsumeResult => {
  if (!Number.isInteger(current) || current < 0) {
    return { ok: false, reason: "invalid_quantity", value: current };
  }
  if (!Number.isInteger(takeQty) || takeQty <= 0) {
    return { ok: false, reason: "invalid_quantity", value: takeQty };
  }
  if (current < takeQty) {
    return {
      ok: false,
      reason: "insufficient_quantity",
      current,
      requested: takeQty,
    };
  }
  return { ok: true, newQuantity: current - takeQty };
};

// ── Recipes ─────────────────────────────────────────────────────────────

/**
 * Parse the `effect.recipe` JSON of an Item into a typed Recipe. Returns
 * `null` if the item has no recipe or the data is malformed.
 *
 * Expected shape:
 *   { recipe: { inputs: [{ itemId, quantity }, ...], outputQuantity?: number } }
 *
 * `outputItemId` is supplied by the caller (it is the id of the item that
 * carries the recipe) — recipes don't store their own output id.
 */
export const parseRecipe = (raw: unknown, outputItemId: string): Recipe | null => {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const recipe = r.recipe;
  if (recipe === null || recipe === undefined || typeof recipe !== "object") return null;
  const rec = recipe as Record<string, unknown>;
  const rawInputs = rec.inputs;
  if (!Array.isArray(rawInputs)) return null;
  const inputs: RecipeInput[] = [];
  for (const i of rawInputs) {
    if (i === null || typeof i !== "object") return null;
    const ii = i as Record<string, unknown>;
    const id = ii.itemId;
    const qty = ii.quantity;
    if (typeof id !== "string" && typeof id !== "number" && typeof id !== "bigint") {
      return null;
    }
    const idStr = typeof id === "bigint" ? id.toString() : String(id);
    if (idStr.length === 0 || idStr === outputItemId) return null;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) {
      return null;
    }
    inputs.push({ itemId: idStr, quantity: qty });
  }
  if (inputs.length === 0) return null;
  const rawOut = rec.outputQuantity;
  const outputQuantity =
    typeof rawOut === "number" && Number.isInteger(rawOut) && rawOut > 0
      ? rawOut
      : 1;
  return { outputItemId, outputQuantity, inputs };
};

export type CraftEvaluation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "insufficient_quantity";
      readonly itemId: string;
      readonly need: number;
      readonly have: number;
    };

/** Check whether `owned` covers every input quantity in `recipe`. */
export const evaluateCraft = (
  recipe: Recipe,
  owned: ReadonlyMap<string, number>,
): CraftEvaluation => {
  for (const input of recipe.inputs) {
    const have = owned.get(input.itemId) ?? 0;
    if (have < input.quantity) {
      return {
        ok: false,
        reason: "insufficient_quantity",
        itemId: input.itemId,
        need: input.quantity,
        have,
      };
    }
  }
  return { ok: true };
};
