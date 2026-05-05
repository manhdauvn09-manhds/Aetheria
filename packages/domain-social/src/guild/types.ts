// Aetheria — Guild domain types.
//
// Pure data shapes consumed by guild rules + service. Mirrors `Guild`,
// `GuildMember`, and `GuildInvite` rows in `schema-db`.

export type GuildRole = "leader" | "officer" | "member";

export type GuildInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export interface GuildSummary {
  readonly guildId: bigint;
  readonly name: string;
  readonly tag: string;
  readonly description: string | null;
  readonly leaderUserId: bigint;
  readonly level: number;
  readonly xp: number;
  readonly memberCount: number;
}

export interface GuildMemberRow {
  readonly userId: bigint;
  readonly role: GuildRole;
  readonly joinedAt: Date;
  readonly contribution: number;
}

export interface GuildDetail extends GuildSummary {
  readonly members: readonly GuildMemberRow[];
}

export interface GuildInviteRow {
  readonly inviteId: bigint;
  readonly guildId: bigint;
  readonly targetUserId: bigint;
  readonly inviterUserId: bigint;
  readonly status: GuildInviteStatus;
  readonly createdAt: Date;
  readonly respondedAt: Date | null;
  readonly expiresAt: Date;
}

export interface CreateGuildInput {
  readonly userId: bigint;
  readonly name: string;
  readonly tag: string;
  readonly description?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface InviteInput {
  readonly actorUserId: bigint;
  readonly guildId: bigint;
  readonly targetUserId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface RespondInviteInput {
  readonly actorUserId: bigint;
  readonly inviteId: bigint;
  readonly accept: boolean;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface KickInput {
  readonly actorUserId: bigint;
  readonly guildId: bigint;
  readonly targetUserId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface PromoteInput {
  readonly actorUserId: bigint;
  readonly guildId: bigint;
  readonly targetUserId: bigint;
  readonly newRole: GuildRole;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface StartRaidInput {
  readonly actorUserId: bigint;
  readonly guildId: bigint;
  readonly raidId: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface StartRaidResult {
  readonly guildId: bigint;
  readonly raidId: string;
  readonly startedAt: Date;
}
