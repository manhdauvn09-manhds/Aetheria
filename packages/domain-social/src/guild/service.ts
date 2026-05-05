// Aetheria — GuildService.
//
// Orchestrates the guild lifecycle (create → invite → respond → kick →
// promote → startRaid) on top of `Guild`, `GuildMember`, and
// `GuildInvite` rows in MySQL. All multi-row writes are wrapped in
// `$transaction` for atomicity. Permission checks delegate to the pure
// helpers in `./rules.ts`.
//
// `startRaid` is intentionally lightweight: it writes a single audit log
// entry and returns the raid id + timestamp. The weekly raid lifecycle
// (rewards, scoring, completion) is owned by the worker scheduler in
// task 4.57 — wiring there will read from the same audit trail.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import {
  canInvite,
  canKick,
  canPromote,
  canStartRaid,
  GUILD_NAME_MAX,
  GUILD_NAME_MIN,
  GUILD_TAG_MAX,
  GUILD_TAG_MIN,
  inviteExpiresAt,
  isInviteFresh,
} from "./rules.js";
import type {
  CreateGuildInput,
  GuildDetail,
  GuildInviteRow,
  GuildInviteStatus,
  GuildMemberRow,
  GuildRole,
  InviteInput,
  KickInput,
  PromoteInput,
  RespondInviteInput,
  StartRaidInput,
  StartRaidResult,
} from "./types.js";

/**
 * Subset of the Prisma client this service touches. Narrowing the
 * dependency keeps unit tests easy to mock and prevents accidental
 * coupling to unrelated tables.
 */
export type GuildMysqlClient = Pick<
  MysqlClient,
  "guild" | "guildMember" | "guildInvite" | "$transaction"
>;

export interface GuildDeps {
  readonly mysql: GuildMysqlClient;
  /** Defaults to `Date.now()`. Tests inject a frozen clock. */
  readonly clock?: () => Date;
}

const toRole = (raw: string): GuildRole => {
  if (raw === "leader" || raw === "officer") return raw;
  return "member";
};

const toInviteStatus = (raw: string): GuildInviteStatus => {
  if (
    raw === "accepted" ||
    raw === "declined" ||
    raw === "cancelled" ||
    raw === "expired"
  ) {
    return raw;
  }
  return "pending";
};

export class GuildService {
  private readonly mysql: GuildMysqlClient;
  private readonly clock: () => Date;

  constructor(deps: GuildDeps) {
    this.mysql = deps.mysql;
    this.clock = deps.clock ?? ((): Date => new Date());
  }

  // ──────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────

  async getGuild(guildId: bigint): Promise<GuildDetail> {
    const guild = await this.mysql.guild.findUnique({
      where: { id: guildId },
      include: { members: true },
    });
    if (!guild) throw AppError.notFound("guild", guildId);
    const members: GuildMemberRow[] = guild.members.map((m) => ({
      userId: m.userId,
      role: toRole(m.role),
      joinedAt: m.joinedAt,
      contribution: m.contribution,
    }));
    return {
      guildId: guild.id,
      name: guild.name,
      tag: guild.tag,
      description: guild.description,
      leaderUserId: guild.leaderUserId,
      level: guild.level,
      xp: guild.xp,
      memberCount: members.length,
      members,
    };
  }

  async listInvitesForUser(targetUserId: bigint): Promise<readonly GuildInviteRow[]> {
    const rows = await this.mysql.guildInvite.findMany({
      where: { targetUserId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      inviteId: r.id,
      guildId: r.guildId,
      targetUserId: r.targetUserId,
      inviterUserId: r.inviterUserId,
      status: toInviteStatus(r.status),
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
      expiresAt: r.expiresAt,
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // Mutations
  // ──────────────────────────────────────────────────────────────────

  async create(input: CreateGuildInput): Promise<GuildDetail> {
    const name = input.name.trim();
    const tag = input.tag.trim();
    if (name.length < GUILD_NAME_MIN || name.length > GUILD_NAME_MAX) {
      throw AppError.badRequest(`Guild name must be ${GUILD_NAME_MIN.toString()}-${GUILD_NAME_MAX.toString()} chars`);
    }
    if (tag.length < GUILD_TAG_MIN || tag.length > GUILD_TAG_MAX) {
      throw AppError.badRequest(`Guild tag must be ${GUILD_TAG_MIN.toString()}-${GUILD_TAG_MAX.toString()} chars`);
    }

    const existing = await this.mysql.guildMember.findFirst({
      where: { userId: input.userId },
      select: { guildId: true },
    });
    if (existing) {
      throw AppError.conflict("User is already in a guild", { guildId: existing.guildId.toString() });
    }

    const created = await this.mysql.$transaction(async (tx) => {
      const guild = await tx.guild.create({
        data: {
          name,
          tag,
          description: input.description ?? null,
          leaderUserId: input.userId,
        },
      });
      await tx.guildMember.create({
        data: { guildId: guild.id, userId: input.userId, role: "leader" },
      });
      return guild;
    });

    await audit.write({
      actor: input.userId,
      action: "guild.create",
      targetType: "guild",
      targetId: created.id,
      payload: { name, tag },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return this.getGuild(created.id);
  }

  async invite(input: InviteInput): Promise<GuildInviteRow> {
    const actor = await this.requireMember(input.guildId, input.actorUserId);
    if (!canInvite(actor.role)) {
      throw AppError.forbidden("Only leaders or officers can invite");
    }
    if (input.targetUserId === input.actorUserId) {
      throw AppError.badRequest("Cannot invite yourself");
    }

    const existingMembership = await this.mysql.guildMember.findUnique({
      where: { guildId_userId: { guildId: input.guildId, userId: input.targetUserId } },
      select: { userId: true },
    });
    if (existingMembership) {
      throw AppError.conflict("Target is already a guild member");
    }

    const existingPending = await this.mysql.guildInvite.findFirst({
      where: { guildId: input.guildId, targetUserId: input.targetUserId, status: "pending" },
      select: { id: true },
    });
    if (existingPending) {
      throw AppError.conflict("Pending invite already exists", { inviteId: existingPending.id.toString() });
    }

    const now = this.clock();
    const created = await this.mysql.guildInvite.create({
      data: {
        guildId: input.guildId,
        targetUserId: input.targetUserId,
        inviterUserId: input.actorUserId,
        status: "pending",
        createdAt: now,
        expiresAt: inviteExpiresAt(now),
      },
    });

    await audit.write({
      actor: input.actorUserId,
      action: "guild.invite",
      targetType: "user",
      targetId: input.targetUserId,
      payload: { guildId: input.guildId.toString(), inviteId: created.id.toString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      inviteId: created.id,
      guildId: created.guildId,
      targetUserId: created.targetUserId,
      inviterUserId: created.inviterUserId,
      status: "pending",
      createdAt: created.createdAt,
      respondedAt: created.respondedAt,
      expiresAt: created.expiresAt,
    };
  }

  async respond(input: RespondInviteInput): Promise<GuildInviteRow> {
    const invite = await this.mysql.guildInvite.findUnique({ where: { id: input.inviteId } });
    if (!invite) throw AppError.notFound("guildInvite", input.inviteId);
    if (invite.targetUserId !== input.actorUserId) {
      throw AppError.forbidden("Only the invited user may respond to this invite");
    }
    if (invite.status !== "pending") {
      throw AppError.conflict("Invite already resolved", { status: invite.status });
    }

    const now = this.clock();
    if (!isInviteFresh(invite.expiresAt, now)) {
      const expired = await this.mysql.guildInvite.update({
        where: { id: invite.id },
        data: { status: "expired", respondedAt: now },
      });
      throw AppError.conflict("Invite expired", { inviteId: expired.id.toString() });
    }

    const newStatus: GuildInviteStatus = input.accept ? "accepted" : "declined";
    const updated = await this.mysql.$transaction(async (tx) => {
      if (input.accept) {
        const stillExisting = await tx.guildMember.findFirst({
          where: { userId: input.actorUserId },
          select: { guildId: true },
        });
        if (stillExisting) {
          throw AppError.conflict("User joined another guild before responding");
        }
        await tx.guildMember.create({
          data: { guildId: invite.guildId, userId: input.actorUserId, role: "member" },
        });
      }
      return tx.guildInvite.update({
        where: { id: invite.id },
        data: { status: newStatus, respondedAt: now },
      });
    });

    await audit.write({
      actor: input.actorUserId,
      action: input.accept ? "guild.invite.accept" : "guild.invite.decline",
      targetType: "guildInvite",
      targetId: invite.id,
      payload: { guildId: invite.guildId.toString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      inviteId: updated.id,
      guildId: updated.guildId,
      targetUserId: updated.targetUserId,
      inviterUserId: updated.inviterUserId,
      status: newStatus,
      createdAt: updated.createdAt,
      respondedAt: updated.respondedAt,
      expiresAt: updated.expiresAt,
    };
  }

  async kick(input: KickInput): Promise<{ kickedUserId: bigint; guildId: bigint }> {
    const actor = await this.requireMember(input.guildId, input.actorUserId);
    const target = await this.requireMember(input.guildId, input.targetUserId);
    if (!canKick(actor.role, target.role)) {
      throw AppError.forbidden("Insufficient permissions to kick this member");
    }
    await this.mysql.guildMember.delete({
      where: { guildId_userId: { guildId: input.guildId, userId: input.targetUserId } },
    });

    await audit.write({
      actor: input.actorUserId,
      action: "guild.kick",
      targetType: "user",
      targetId: input.targetUserId,
      payload: { guildId: input.guildId.toString(), priorRole: target.role },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { kickedUserId: input.targetUserId, guildId: input.guildId };
  }

  async promote(input: PromoteInput): Promise<{ targetUserId: bigint; newRole: GuildRole }> {
    const actor = await this.requireMember(input.guildId, input.actorUserId);
    const target = await this.requireMember(input.guildId, input.targetUserId);
    if (!canPromote(actor.role, target.role, input.newRole)) {
      throw AppError.forbidden("Cannot perform this role change");
    }

    // Promoting someone to leader transfers leadership atomically:
    // demote the current leader to officer and update Guild.leaderUserId.
    if (input.newRole === "leader") {
      await this.mysql.$transaction(async (tx) => {
        await tx.guildMember.update({
          where: { guildId_userId: { guildId: input.guildId, userId: input.actorUserId } },
          data: { role: "officer" },
        });
        await tx.guildMember.update({
          where: { guildId_userId: { guildId: input.guildId, userId: input.targetUserId } },
          data: { role: "leader" },
        });
        await tx.guild.update({
          where: { id: input.guildId },
          data: { leaderUserId: input.targetUserId },
        });
      });
    } else {
      await this.mysql.guildMember.update({
        where: { guildId_userId: { guildId: input.guildId, userId: input.targetUserId } },
        data: { role: input.newRole },
      });
    }

    await audit.write({
      actor: input.actorUserId,
      action: "guild.promote",
      targetType: "user",
      targetId: input.targetUserId,
      payload: {
        guildId: input.guildId.toString(),
        from: target.role,
        to: input.newRole,
      },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { targetUserId: input.targetUserId, newRole: input.newRole };
  }

  async startRaid(input: StartRaidInput): Promise<StartRaidResult> {
    const actor = await this.requireMember(input.guildId, input.actorUserId);
    if (!canStartRaid(actor.role)) {
      throw AppError.forbidden("Only the guild leader can start a raid");
    }
    if (input.raidId.length === 0 || input.raidId.length > 64) {
      throw AppError.badRequest("raidId must be 1-64 chars");
    }

    const startedAt = this.clock();
    await audit.write({
      actor: input.actorUserId,
      action: "guild.raid.start",
      targetType: "guild",
      targetId: input.guildId,
      payload: { raidId: input.raidId, startedAt: startedAt.toISOString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { guildId: input.guildId, raidId: input.raidId, startedAt };
  }

  // ──────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────

  private async requireMember(
    guildId: bigint,
    userId: bigint,
  ): Promise<{ userId: bigint; role: GuildRole }> {
    const row = await this.mysql.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { userId: true, role: true },
    });
    if (!row) {
      throw AppError.forbidden("Not a member of this guild");
    }
    return { userId: row.userId, role: toRole(row.role) };
  }
}
