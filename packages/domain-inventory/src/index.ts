export {
  InventoryService,
  type InventoryDeps,
  type InventoryMysqlClient,
} from "./service.js";

export {
  createInventoryRouter,
  type InventoryRouter,
} from "./router.js";

export {
  EQUIPPABLE_TYPES,
  KNOWN_ITEM_TYPES,
  coerceItemType,
  isEquippable,
  isConsumable,
  equipSlotFor,
  tryStack,
  tryConsume,
  parseRecipe,
  evaluateCraft,
  type EquippableType,
  type StackResult,
  type ConsumeResult,
  type CraftEvaluation,
} from "./rules.js";

export type {
  ItemType,
  EquipSlot,
  InventoryItemMeta,
  InventoryStack,
  InventoryListResult,
  Recipe,
  RecipeInput,
  InventoryListInput,
  InventoryGrantInput,
  InventoryConsumeInput,
  InventoryEquipInput,
  InventoryUnequipInput,
  InventoryCraftInput,
  InventoryGrantResult,
  InventoryConsumeResult,
  InventoryCraftResult,
} from "./types.js";
