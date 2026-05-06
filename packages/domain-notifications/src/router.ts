// Aetheria — notifications tRPC router (factory).

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { NotificationsService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createNotificationsRouter = (service: NotificationsService) =>
  router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).optional(),
          unreadOnly: z.boolean().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        try {
          return await service.list({
            userId: ctx.auth.userId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
            ...(input.unreadOnly !== undefined ? { unreadOnly: input.unreadOnly } : {}),
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    markRead: protectedProcedure
      .input(
        z.object({
          notificationIds: z.array(bigIntId).max(200).optional(),
          all: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.markRead({
            userId: ctx.auth.userId,
            ...(input.notificationIds !== undefined
              ? { notificationIds: input.notificationIds }
              : {}),
            ...(input.all !== undefined ? { all: input.all } : {}),
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type NotificationsRouter = ReturnType<typeof createNotificationsRouter>;
