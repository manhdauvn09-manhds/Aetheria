// Aetheria — guild tRPC router (factory).
//
// All procedures are protected; the actor's `userId` comes from
// `ctx.auth.userId` so a leader cannot impersonate another member via
// this surface. Permission checks live in the service.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import {
  GUILD_NAME_MAX,
  GUILD_NAME_MIN,
  GUILD_TAG_MAX,
  GUILD_TAG_MIN,
} from "./rules.js";
import type { GuildService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

const roleSchema = z.union([
  z.literal("leader"),
  z.literal("officer"),
  z.literal("member"),
]);

export const createGuildRouter = (service: GuildService) =>
  router({
    get: protectedProcedure
      .input(z.object({ guildId: bigIntId }))
      .query(async ({ input }) => {
        try {
          return await service.getGuild(input.guildId);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    myMembership: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.myMembership(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    pendingInvites: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.listInvitesForUser(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(GUILD_NAME_MIN).max(GUILD_NAME_MAX),
          tag: z.string().min(GUILD_TAG_MIN).max(GUILD_TAG_MAX),
          description: z.string().max(1024).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.create({
            userId: ctx.auth.userId,
            name: input.name,
            tag: input.tag,
            description: input.description ?? null,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    invite: protectedProcedure
      .input(z.object({ guildId: bigIntId, targetUserId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.invite({
            actorUserId: ctx.auth.userId,
            guildId: input.guildId,
            targetUserId: input.targetUserId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    respond: protectedProcedure
      .input(z.object({ inviteId: bigIntId, accept: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.respond({
            actorUserId: ctx.auth.userId,
            inviteId: input.inviteId,
            accept: input.accept,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    kick: protectedProcedure
      .input(z.object({ guildId: bigIntId, targetUserId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.kick({
            actorUserId: ctx.auth.userId,
            guildId: input.guildId,
            targetUserId: input.targetUserId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    promote: protectedProcedure
      .input(
        z.object({
          guildId: bigIntId,
          targetUserId: bigIntId,
          newRole: roleSchema,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.promote({
            actorUserId: ctx.auth.userId,
            guildId: input.guildId,
            targetUserId: input.targetUserId,
            newRole: input.newRole,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    startRaid: protectedProcedure
      .input(z.object({ guildId: bigIntId, raidId: z.string().min(1).max(64) }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.startRaid({
            actorUserId: ctx.auth.userId,
            guildId: input.guildId,
            raidId: input.raidId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type GuildRouter = ReturnType<typeof createGuildRouter>;
