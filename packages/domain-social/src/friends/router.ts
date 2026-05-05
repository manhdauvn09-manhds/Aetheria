// Aetheria — friends tRPC router (factory).
//
// All procedures protected; `userId` comes from `ctx.auth.userId`.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { FriendsService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createFriendsRouter = (service: FriendsService) =>
  router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.list(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    request: protectedProcedure
      .input(z.object({ targetUserId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.request({
            actorUserId: ctx.auth.userId,
            targetUserId: input.targetUserId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    respond: protectedProcedure
      .input(z.object({ requesterUserId: bigIntId, accept: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.respond({
            actorUserId: ctx.auth.userId,
            requesterUserId: input.requesterUserId,
            accept: input.accept,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type FriendsRouter = ReturnType<typeof createFriendsRouter>;
