// Aetheria — shop tRPC router (factory).

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { ShopService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createShopRouter = (service: ShopService) =>
  router({
    catalog: protectedProcedure.query(async () => {
      try {
        return await service.catalog();
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }))
      .query(async ({ input, ctx }) => {
        try {
          return await service.history(ctx.auth.userId, input.limit);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    purchase: protectedProcedure
      .input(
        z.object({
          shopItemId: bigIntId,
          quantity: z.number().int().min(1).max(99).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.purchase({
            userId: ctx.auth.userId,
            shopItemId: input.shopItemId,
            ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    refund: protectedProcedure
      .input(z.object({ transactionId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.refund({
            userId: ctx.auth.userId,
            transactionId: input.transactionId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type ShopRouter = ReturnType<typeof createShopRouter>;
