export {
  DEFAULT_PROFANITY,
  normalizeForMatch,
  containsProfanity,
  redactProfanity,
} from "./profanity.js";

export {
  DEFAULT_CONTENT_LIMITS,
  DEFAULT_RATE_LIMITS,
  validateContent,
  checkRateLimit,
  isMutedAt,
  shouldFlagMessage,
} from "./rules.js";

export type {
  ChannelType,
  ContentLimits,
  ContentRejectReason,
  RateLimitPolicy,
  RateLimitResult,
  ValidationResult,
} from "./types.js";

export {
  GUILD_NAME_MIN,
  GUILD_NAME_MAX,
  GUILD_TAG_MIN,
  GUILD_TAG_MAX,
  canInvite,
  canKick,
  canPromote,
  canStartRaid,
  isHigherRank,
  inviteExpiresAt,
  isInviteFresh,
} from "./guild/rules.js";

export {
  GuildService,
  type GuildDeps,
  type GuildMysqlClient,
} from "./guild/service.js";

export {
  createGuildRouter,
  type GuildRouter,
} from "./guild/router.js";

export type {
  GuildRole,
  GuildInviteStatus,
  GuildSummary,
  GuildMemberRow,
  GuildDetail,
  GuildInviteRow,
  CreateGuildInput,
  InviteInput,
  RespondInviteInput,
  KickInput,
  PromoteInput,
  StartRaidInput,
  StartRaidResult,
} from "./guild/types.js";

export {
  FriendsService,
  type FriendsDeps,
  type FriendsMysqlClient,
} from "./friends/service.js";

export {
  createFriendsRouter,
  type FriendsRouter,
} from "./friends/router.js";

export {
  buildFriendList,
  toFriendStatus,
} from "./friends/rules.js";

export type {
  FriendStatus,
  FriendEdge,
  FriendList,
  FriendRequestInput,
  FriendRespondInput,
} from "./friends/types.js";

export {
  ChatService,
  type ChatDeps,
  type ChatMysqlClient,
} from "./chat/service.js";

export {
  createChatRouter,
  type ChatRouter,
} from "./chat/router.js";

export type {
  ChatMessageRow,
  SendChatInput,
  HistoryChatInput,
  ReportChatInput,
} from "./chat/types.js";
