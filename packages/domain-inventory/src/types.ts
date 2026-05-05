// Aetheria — inventory domain types.
//
// Pure data shapes. Service code maps Prisma rows into these and the router
// serialises BigInts → string at the wire boundary.

/**
 * Item.type values currently in use across the catalog. Schema column is a
 * VARCHAR so we treat unknown values defensively at the boundary.
 */
export type ItemType =
  | "weapon"
  | "armor"
  | "relic"
  | "consumable"
  | "material"
  | "skin"
  | "cosmetic";

/** Equipment slot. Skins go through `roster.equipSkin`, not here. */
export type EquipSlot = "weapon" | "armor" | "relic";

export interface InventoryItemMeta {
  readonly itemId: string;
  readonly name: string;
  readonly tier: string;
  readonly type: ItemType;
  readonly iconUrl: string | null;
  readonly maxStack: number;
}

export interface InventoryStack {
  readonly itemId: string;
  readonly quantity: number;
  readonly equippedToUserCharacterId: string | null;
  readonly item: InventoryItemMeta;
  readonly updatedAt: Date;
}

export interface InventoryListResult {
  readonly stacks: readonly InventoryStack[];
}

/** A single ingredient required by a craft recipe. */
export interface RecipeInput {
  readonly itemId: string;
  readonly quantity: number;
}

/**
 * Craft recipe parsed from `Item.effect.recipe`.
 *
 * Recipes live on the *output* item — the player asks "craft itemX" and we
 * read X.effect.recipe to find what to consume. `outputQuantity` defaults to
 * 1 when absent.
 */
export interface Recipe {
  readonly outputItemId: string;
  readonly outputQuantity: number;
  readonly inputs: readonly RecipeInput[];
}

// ── Service inputs ──────────────────────────────────────────────────────

export interface InventoryListInput {
  readonly userId: bigint;
}

export interface InventoryGrantInput {
  readonly userId: bigint;
  readonly itemId: bigint;
  readonly quantity: number;
  /** Free-form provenance label, e.g. "quest:daily.001", "shop", "system". */
  readonly source: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface InventoryConsumeInput {
  readonly userId: bigint;
  readonly itemId: bigint;
  readonly quantity: number;
  readonly source: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface InventoryEquipInput {
  readonly userId: bigint;
  readonly itemId: bigint;
  readonly userCharacterId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface InventoryUnequipInput {
  readonly userId: bigint;
  readonly itemId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface InventoryCraftInput {
  readonly userId: bigint;
  readonly outputItemId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface InventoryGrantResult {
  readonly stack: InventoryStack;
  readonly granted: number;
}

export interface InventoryConsumeResult {
  readonly stack: InventoryStack | null;
  readonly consumed: number;
}

export interface InventoryCraftResult {
  readonly output: InventoryStack;
  readonly consumed: readonly { readonly itemId: string; readonly quantity: number }[];
}
