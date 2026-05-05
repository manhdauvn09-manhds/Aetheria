// Aetheria — battle pass tRPC router (factory).
//
// All procedures protected. Players never push XP — accrual is bus-driven.
// `claim` is the one mutation; `currentSeason` and `progress` are reads.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { BattlePassService } from "./service.js";

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createBattlePassRouter = (service: BattlePassService) =>
  router({
    currentSeason: protectedProcedure.query(async () => {
      try {
        return await service.currentSeason({});
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    progress: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.progress({ userId: ctx.auth.userId });
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    claim: protectedProcedure
      .input(
        z.object({
          seasonId: bigIntId,
          tier: z.number().int().positive().max(1000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.claim({
            userId: ctx.auth.userId,
            seasonId: input.seasonId,
            tier: input.tier,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type BattlePassRouter = ReturnType<typeof createBattlePassRouter>;
