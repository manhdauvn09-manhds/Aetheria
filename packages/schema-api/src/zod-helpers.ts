// Aetheria — Zod helpers.
//
// Provides:
//   * branded-id parsers that round-trip through superjson (BigInt → BigInt)
//   * common input shapes (pagination, sorting, dateRange)
//   * domain enum schemas built from `@aetheria/shared-types/enums`
//
// All `bigIntId(...)` helpers accept `bigint | number | string` on the wire
// and emit a branded `bigint`, so client-side code can pass plain numbers.

import { z } from "zod";

import {
  ChannelTypes,
  CharacterClasses,
  CharacterRoles,
  Currencies,
  FriendshipStatuses,
  GuildRoles,
  ItemTiers,
  ItemTypes,
  LevelTypes,
  PvpModes,
  PvpResults,
  QuestStatuses,
  QuestTypes,
  RealmThemes,
  RunStatuses,
  SkillTypes,
  SyncOperations,
  TransactionStatuses,
  UserStatuses,
  asBigIntId,
  type BattlePassSeasonId,
  type CharacterId,
  type ChatMessageId,
  type FriendshipId,
  type GuildId,
  type InventoryId,
  type ItemId,
  type LevelId,
  type PvpMatchId,
  type QuestId,
  type RealmId,
  type RunId,
  type ShopItemId,
  type SkillId,
  type TransactionId,
  type UserCharacterId,
  type UserId,
} from "@aetheria/shared-types";

// ── branded BigInt id schemas ────────────────────────────────────────
const bigIntLike = z.union([z.bigint(), z.number().int(), z.string().regex(/^-?\d+$/)]);

const bigIntId = <B extends string>() =>
  bigIntLike.transform((v) => asBigIntId<B>(typeof v === "bigint" ? v : BigInt(v)));

export const userIdSchema             = bigIntId<"UserId">();
export const characterIdSchema        = bigIntId<"CharacterId">();
export const skillIdSchema            = bigIntId<"SkillId">();
export const userCharacterIdSchema    = bigIntId<"UserCharacterId">();
export const realmIdSchema            = bigIntId<"RealmId">();
export const levelIdSchema            = bigIntId<"LevelId">();
export const itemIdSchema             = bigIntId<"ItemId">();
export const inventoryIdSchema        = bigIntId<"InventoryId">();
export const runIdSchema              = bigIntId<"RunId">();
export const questIdSchema            = bigIntId<"QuestId">();
export const guildIdSchema            = bigIntId<"GuildId">();
export const friendshipIdSchema       = bigIntId<"FriendshipId">();
export const chatMessageIdSchema      = bigIntId<"ChatMessageId">();
export const pvpMatchIdSchema         = bigIntId<"PvpMatchId">();
export const shopItemIdSchema         = bigIntId<"ShopItemId">();
export const transactionIdSchema      = bigIntId<"TransactionId">();
export const battlePassSeasonIdSchema = bigIntId<"BattlePassSeasonId">();

// Type sanity checks (compile-time only; no runtime cost).
export type _checkUserId             = z.output<typeof userIdSchema>             extends UserId             ? true : never;
export type _checkCharacterId        = z.output<typeof characterIdSchema>        extends CharacterId        ? true : never;
export type _checkSkillId            = z.output<typeof skillIdSchema>            extends SkillId            ? true : never;
export type _checkUserCharacterId    = z.output<typeof userCharacterIdSchema>    extends UserCharacterId    ? true : never;
export type _checkRealmId            = z.output<typeof realmIdSchema>            extends RealmId            ? true : never;
export type _checkLevelId            = z.output<typeof levelIdSchema>            extends LevelId            ? true : never;
export type _checkItemId             = z.output<typeof itemIdSchema>             extends ItemId             ? true : never;
export type _checkInventoryId        = z.output<typeof inventoryIdSchema>        extends InventoryId        ? true : never;
export type _checkRunId              = z.output<typeof runIdSchema>              extends RunId              ? true : never;
export type _checkQuestId            = z.output<typeof questIdSchema>            extends QuestId            ? true : never;
export type _checkGuildId            = z.output<typeof guildIdSchema>            extends GuildId            ? true : never;
export type _checkFriendshipId       = z.output<typeof friendshipIdSchema>       extends FriendshipId       ? true : never;
export type _checkChatMessageId      = z.output<typeof chatMessageIdSchema>      extends ChatMessageId      ? true : never;
export type _checkPvpMatchId         = z.output<typeof pvpMatchIdSchema>         extends PvpMatchId         ? true : never;
export type _checkShopItemId         = z.output<typeof shopItemIdSchema>         extends ShopItemId         ? true : never;
export type _checkTransactionId      = z.output<typeof transactionIdSchema>      extends TransactionId      ? true : never;
export type _checkBattlePassSeasonId = z.output<typeof battlePassSeasonIdSchema> extends BattlePassSeasonId ? true : never;

// ── string brands & primitives ───────────────────────────────────────
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((v) => v.toLowerCase());

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[\p{L}\p{N}_\- ]+$/u, "letters, digits, spaces, _ and - only");

export const guildTagSchema = z
  .string()
  .trim()
  .length(4)
  .regex(/^[A-Z0-9]{4}$/, "4 chars, A-Z and 0-9 only")
  .transform((v) => v.toUpperCase());

export const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .refine((v) => /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v), {
    message: "must include upper, lower, and digit",
  });

export const iso2CountrySchema = z.string().length(2).regex(/^[A-Z]{2}$/);
export const bcp47LanguageSchema = z.string().min(2).max(16).regex(/^[a-zA-Z-]+$/);
export const isoTimestampSchema = z.string().datetime();

export const saveSlotSchema = z.number().int().min(0).max(3);
export const skillSlotSchema = z.number().int().min(1).max(6);

// ── domain enum schemas (derived from shared-types) ──────────────────
const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const userStatusSchema        = enumOf(UserStatuses);
export const characterClassSchema    = enumOf(CharacterClasses);
export const characterRoleSchema     = enumOf(CharacterRoles);
export const skillTypeSchema         = enumOf(SkillTypes);
export const realmThemeSchema       = enumOf(RealmThemes);
export const levelTypeSchema         = enumOf(LevelTypes);
export const itemTierSchema          = enumOf(ItemTiers);
export const itemTypeSchema          = enumOf(ItemTypes);
export const runStatusSchema         = enumOf(RunStatuses);
export const questTypeSchema         = enumOf(QuestTypes);
export const questStatusSchema       = enumOf(QuestStatuses);
export const guildRoleSchema         = enumOf(GuildRoles);
export const friendshipStatusSchema  = enumOf(FriendshipStatuses);
export const channelTypeSchema       = enumOf(ChannelTypes);
export const pvpModeSchema           = enumOf(PvpModes);
export const pvpResultSchema         = enumOf(PvpResults);
export const currencySchema          = enumOf(Currencies);
export const transactionStatusSchema = enumOf(TransactionStatuses);
export const syncOperationSchema     = enumOf(SyncOperations);

// ── common composite shapes ──────────────────────────────────────────
export const paginationInput = z.object({
  cursor: z.string().optional(),
  limit:  z.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.output<typeof paginationInput>;

export const dateRangeInput = z
  .object({ from: isoTimestampSchema, to: isoTimestampSchema })
  .refine((v) => v.from <= v.to, { message: "`from` must be ≤ `to`" });
export type DateRangeInput = z.output<typeof dateRangeInput>;

export const sortDirection = z.enum(["asc", "desc"]).default("desc");

// JSON-safe `Json` value — useful when models accept arbitrary jsonb.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export const jsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);
