// Domain enums as TS literal unions. Mirror the `VARCHAR` discriminators used
// in db/mysql/01_init.sql and db/sqlite/01_init.sql.

export const UserStatuses = ["active", "banned", "suspended"] as const;
export type UserStatus = (typeof UserStatuses)[number];

export const CharacterClasses = [
  "warrior", "rogue", "ranger", "pyromancer",
  "mystic", "guardian", "arcanist", "prismblade",
] as const;
export type CharacterClass = (typeof CharacterClasses)[number];

export const CharacterRoles = ["tank", "dps", "support", "control"] as const;
export type CharacterRole = (typeof CharacterRoles)[number];

export const SkillTypes = ["active", "passive"] as const;
export type SkillType = (typeof SkillTypes)[number];

export const RealmThemes = ["forest", "volcanic", "sky", "ocean", "void"] as const;
export type RealmTheme = (typeof RealmThemes)[number];

export const LevelTypes = [
  "story", "combat", "puzzle", "treasure", "boss", "hidden", "rift",
] as const;
export type LevelType = (typeof LevelTypes)[number];

export const ItemTiers = ["common", "rare", "epic", "mythic", "aetherforged"] as const;
export type ItemTier = (typeof ItemTiers)[number];

export const ItemTypes = ["weapon", "armor", "relic", "consumable", "material"] as const;
export type ItemType = (typeof ItemTypes)[number];

export const RunStatuses = ["in_progress", "completed", "failed", "abandoned"] as const;
export type RunStatus = (typeof RunStatuses)[number];

export const QuestTypes = ["daily", "weekly", "seasonal", "story"] as const;
export type QuestType = (typeof QuestTypes)[number];

export const QuestStatuses = ["active", "completed", "claimed"] as const;
export type QuestStatus = (typeof QuestStatuses)[number];

export const GuildRoles = ["leader", "officer", "member"] as const;
export type GuildRole = (typeof GuildRoles)[number];

export const FriendshipStatuses = ["pending", "accepted", "blocked"] as const;
export type FriendshipStatus = (typeof FriendshipStatuses)[number];

export const ChannelTypes = ["global", "guild", "party", "whisper"] as const;
export type ChannelType = (typeof ChannelTypes)[number];

export const PvpModes = ["1v1", "3v3", "raid"] as const;
export type PvpMode = (typeof PvpModes)[number];

export const PvpResults = ["win", "loss", "draw"] as const;
export type PvpResult = (typeof PvpResults)[number];

export const Currencies = ["gold", "aether"] as const;
export type Currency = (typeof Currencies)[number];

export const TransactionStatuses = ["pending", "completed", "failed", "refunded"] as const;
export type TransactionStatus = (typeof TransactionStatuses)[number];

export const SyncOperations = ["insert", "update", "delete"] as const;
export type SyncOperation = (typeof SyncOperations)[number];

// Account-level milestones (per docs/02_FLOWS.md §4).
export const AccountMilestones = [
  { level: 5,   reward: "photo_mode" },
  { level: 10,  reward: "second_character_slot" },
  { level: 15,  reward: "daily_quests" },
  { level: 25,  reward: "co_op_raids" },
  { level: 40,  reward: "ranked_pvp" },
  { level: 60,  reward: "guild_creation" },
  { level: 80,  reward: "endless_tower" },
  { level: 100, reward: "epilogue_new_plus" },
] as const;
export type AccountMilestone = (typeof AccountMilestones)[number];
