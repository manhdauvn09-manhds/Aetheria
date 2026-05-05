// Aetheria — quests tRPC router (factory).
//
// All procedures are protected; userId comes from `ctx.auth.userId` so
// admins can't impersonate players via this surface. The progress path
// is event-driven (bus subscription in `QuestService.start`), so there
// is no `progress` procedure here — players never push progress directly.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { QuestService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createQuestsRouter = (service: QuestService) =>
  router({
    daily: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.dailyForUser({ userId: ctx.auth.userId });
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    weekly: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.weeklyForUser({ userId: ctx.auth.userId });
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    claim: protectedProcedure
      .input(z.object({ questId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.claim({
            userId: ctx.auth.userId,
            questId: input.questId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type QuestsRouter = ReturnType<typeof createQuestsRouter>;
