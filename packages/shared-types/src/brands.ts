// Branded primitive types — prevent accidental cross-assignment of unrelated ids
// (e.g. passing a UserId where a CharacterId is expected).
//
// Construct with the `as` helpers; never widen back to the underlying primitive in app code.
//
// We use a string-tagged brand (not `unique symbol`) so the type is freely
// nameable across declaration boundaries — important for emitting `.d.ts`
// from packages that re-export branded types via Zod schemas.

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId               = Brand<bigint, "UserId">;
export type CharacterId          = Brand<bigint, "CharacterId">;
export type SkillId              = Brand<bigint, "SkillId">;
export type UserCharacterId      = Brand<bigint, "UserCharacterId">;
export type RealmId              = Brand<bigint, "RealmId">;
export type LevelId              = Brand<bigint, "LevelId">;
export type ItemId               = Brand<bigint, "ItemId">;
export type InventoryId          = Brand<bigint, "InventoryId">;
export type RunId                = Brand<bigint, "RunId">;
export type QuestId              = Brand<bigint, "QuestId">;
export type GuildId              = Brand<bigint, "GuildId">;
export type FriendshipId         = Brand<bigint, "FriendshipId">;
export type ChatMessageId        = Brand<bigint, "ChatMessageId">;
export type PvpMatchId           = Brand<bigint, "PvpMatchId">;
export type ShopItemId           = Brand<bigint, "ShopItemId">;
export type TransactionId        = Brand<bigint, "TransactionId">;
export type BattlePassSeasonId   = Brand<bigint, "BattlePassSeasonId">;
export type AuditLogId           = Brand<bigint, "AuditLogId">;

// Slot indices and small numeric brands.
export type SaveSlot = Brand<number, "SaveSlot">; // 0..3
export type SkillSlot = Brand<number, "SkillSlot">; // 1..6

// String brands.
export type Email          = Brand<string, "Email">;
export type DisplayName    = Brand<string, "DisplayName">;
export type GuildTag       = Brand<string, "GuildTag">; // 4 chars
export type Bcp47Language  = Brand<string, "Bcp47Language">;
export type Iso2Country    = Brand<string, "Iso2Country">;
export type IsoTimestamp   = Brand<string, "IsoTimestamp">; // ISO-8601 UTC

// ── constructors (validation lives in schema-api Zod layer) ───────────
export const asBigIntId = <B extends string>(value: bigint): Brand<bigint, B> => value as Brand<bigint, B>;
export const asNumericId = <B extends string>(value: number): Brand<number, B> => value as Brand<number, B>;
export const asStringId  = <B extends string>(value: string): Brand<string, B> => value as Brand<string, B>;
