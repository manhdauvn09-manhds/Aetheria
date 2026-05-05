// Aetheria — inventory tRPC router (factory).
//
// All player-facing procedures are protected; the userId always comes from
// `ctx.auth.userId` so admins cannot impersonate players via this surface.
// `grant` is admin-only because it credits items from thin air — quest /
// shop / level-up will call `InventoryService.grant` directly server-side.

import { z } from "zod";

import {
  adminProcedure,
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { InventoryService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

const positiveQuantity = z.number().int().positive().max(1_000_000);

const sourceTag = z.string().min(1).max(64);

export const createInventoryRouter = (service: InventoryService) =>
  router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.list({ userId: ctx.auth.userId });
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    consume: protectedProcedure
      .input(z.object({ itemId: bigIntId, quantity: positiveQuantity }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.consume({
            userId: ctx.auth.userId,
            itemId: input.itemId,
            quantity: input.quantity,
            source: "user",
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    equip: protectedProcedure
      .input(z.object({ itemId: bigIntId, userCharacterId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.equip({
            userId: ctx.auth.userId,
            itemId: input.itemId,
            userCharacterId: input.userCharacterId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    unequip: protectedProcedure
      .input(z.object({ itemId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.unequip({
            userId: ctx.auth.userId,
            itemId: input.itemId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    craft: protectedProcedure
      .input(z.object({ outputItemId: bigIntId }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.craft({
            userId: ctx.auth.userId,
            outputItemId: input.outputItemId,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    /**
     * Admin-only. Credits items to a target user from thin air. Used by
     * console operators; legitimate gameplay grants (quest reward, shop
     * purchase) call `InventoryService.grant` server-side instead.
     */
    grant: adminProcedure
      .input(
        z.object({
          userId: bigIntId,
          itemId: bigIntId,
          quantity: positiveQuantity,
          source: sourceTag,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.grant({
            userId: input.userId,
            itemId: input.itemId,
            quantity: input.quantity,
            source: input.source,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type InventoryRouter = ReturnType<typeof createInventoryRouter>;
