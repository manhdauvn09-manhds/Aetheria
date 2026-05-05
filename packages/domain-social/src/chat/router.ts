// Aetheria — chat tRPC router (factory).

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { ChatService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

const channelType = z.union([
  z.literal("global"),
  z.literal("guild"),
  z.literal("party"),
  z.literal("whisper"),
]);

export const createChatRouter = (service: ChatService) =>
  router({
    send: protectedProcedure
      .input(
        z.object({
          channelType,
          channelId: bigIntId.optional(),
          content: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.send({
            actorUserId: ctx.auth.userId,
            channelType: input.channelType,
            channelId: input.channelId ?? null,
            content: input.content,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    history: protectedProcedure
      .input(
        z.object({
          channelType,
          channelId: bigIntId.optional(),
          limit: z.number().int().min(1).max(200).optional(),
          before: z.date().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        try {
          return await service.history({
            actorUserId: ctx.auth.userId,
            channelType: input.channelType,
            channelId: input.channelId ?? null,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
            ...(input.before !== undefined ? { before: input.before } : {}),
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    report: protectedProcedure
      .input(z.object({ messageId: bigIntId, reason: z.string().min(1).max(500) }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.report({
            actorUserId: ctx.auth.userId,
            messageId: input.messageId,
            reason: input.reason,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type ChatRouter = ReturnType<typeof createChatRouter>;
