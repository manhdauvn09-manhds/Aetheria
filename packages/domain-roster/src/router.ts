// Aetheria — roster + skills tRPC routers (factories).
//
// Two routers share one `RosterService`. All procedures are protected;
// the userId comes from `ctx.auth.userId` so admins can't impersonate
// players via this surface.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { RosterService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createRosterRouter = (service: RosterService) =>
  router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.list(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    unlockCharacter: protectedProcedure
      .input(z.object({ characterId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.unlockCharacter({
            userId: ctx.auth.userId,
            characterId: input.characterId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    ascend: protectedProcedure
      .input(z.object({ userCharacterId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.ascend({
            userId: ctx.auth.userId,
            userCharacterId: input.userCharacterId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    equipSkin: protectedProcedure
      .input(
        z.object({
          userCharacterId: bigIntId,
          skinItemId: bigIntId.nullable(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.equipSkin({
            userId: ctx.auth.userId,
            userCharacterId: input.userCharacterId,
            skinItemId: input.skinItemId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type RosterRouter = ReturnType<typeof createRosterRouter>;

export const createSkillsRouter = (service: RosterService) =>
  router({
    tree: protectedProcedure
      .input(z.object({ userCharacterId: bigIntId }))
      .query(async ({ input, ctx }) => {
        try {
          return await service.getSkillTree({
            userId: ctx.auth.userId,
            userCharacterId: input.userCharacterId,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    invest: protectedProcedure
      .input(z.object({ userCharacterId: bigIntId, skillId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.investSkill({
            userId: ctx.auth.userId,
            userCharacterId: input.userCharacterId,
            skillId: input.skillId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    respec: protectedProcedure
      .input(z.object({ userCharacterId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.respec({
            userId: ctx.auth.userId,
            userCharacterId: input.userCharacterId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type SkillsRouter = ReturnType<typeof createSkillsRouter>;
