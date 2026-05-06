// Aetheria — admin tRPC router (factory).
//
// Every procedure is `adminProcedure` so a non-admin caller is rejected
// at the schema-api boundary before the service is ever invoked.

import { z } from "zod";

import {
  adminProcedure,
  asTrpcError,
  router,
} from "@aetheria/schema-api/trpc";

import type { AdminService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createAdminRouter = (service: AdminService) =>
  router({
    banUser: adminProcedure
      .input(z.object({ targetUserId: bigIntId, reason: z.string().min(1).max(500) }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.banUser({
            actorUserId: ctx.auth.userId,
            targetUserId: input.targetUserId,
            reason: input.reason,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    unbanUser: adminProcedure
      .input(z.object({ targetUserId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.unbanUser({
            actorUserId: ctx.auth.userId,
            targetUserId: input.targetUserId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    grantItem: adminProcedure
      .input(
        z.object({
          targetUserId: bigIntId,
          itemId: bigIntId,
          quantity: z.number().int().min(1).max(9999),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.grantItem({
            actorUserId: ctx.auth.userId,
            targetUserId: input.targetUserId,
            itemId: input.itemId,
            quantity: input.quantity,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    listFeatureFlags: adminProcedure.query(async () => {
      try {
        return await service.listFeatureFlags();
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    setFeatureFlag: adminProcedure
      .input(z.object({ key: z.string().min(1).max(128), value: z.unknown() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.setFeatureFlag({
            actorUserId: ctx.auth.userId,
            key: input.key,
            value: input.value,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    replay: adminProcedure
      .input(
        z.object({
          action:     z.string().min(1).max(64).optional(),
          targetType: z.string().min(1).max(64).optional(),
          limit:      z.number().int().min(1).max(500).optional(),
          before:     z.date().optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await service.replay({
            ...(input.action     !== undefined ? { action:     input.action }     : {}),
            ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
            ...(input.limit      !== undefined ? { limit:      input.limit }      : {}),
            ...(input.before     !== undefined ? { before:     input.before }     : {}),
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type AdminRouter = ReturnType<typeof createAdminRouter>;
