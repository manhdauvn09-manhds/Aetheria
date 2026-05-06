// Aetheria — pvp tRPC router (factory).
//
// All procedures protected; userId comes from `ctx.auth.userId`. The
// matcher loop runs server-side; players never tick it directly.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { LeaderboardService } from "./leaderboard.js";
import type { PvpMatchService } from "./match.js";
import type { MmrService } from "./mmr.js";
import type { PvpMatchmakingService } from "./service.js";

const modeSchema = z.union([z.literal("1v1"), z.literal("3v3")]);
const regionSchema = z.union([
  z.literal("na"),
  z.literal("eu"),
  z.literal("ap"),
]);

const bigIntId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\d+$/, "must be a positive integer string")
  .transform((s) => BigInt(s));

export const createPvpRouter = (
  service: PvpMatchmakingService,
  matches: PvpMatchService,
  mmr: MmrService,
  lb: LeaderboardService,
) =>
  router({
    queue: protectedProcedure
      .input(z.object({ mode: modeSchema, region: regionSchema }))
      .mutation(async ({ input, ctx }) => {
        try {
          const mmr = await service.resolveMmr(ctx.auth.userId, input.mode);
          return await service.queue({
            userId: ctx.auth.userId,
            mode: input.mode,
            region: input.region,
            mmr,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    cancelQueue: protectedProcedure
      .input(z.object({ mode: modeSchema, region: regionSchema }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.cancelQueue({
            userId: ctx.auth.userId,
            mode: input.mode,
            region: input.region,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    status: protectedProcedure.query(async ({ ctx }) => {
      try {
        const s = await service.status(ctx.auth.userId);
        if (!s.inQueue || !s.joinedAt) return s;
        return {
          ...s,
          bracketWidth: service.estimatedBracket(s.joinedAt),
        };
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    match: protectedProcedure
      .input(z.object({ matchId: bigIntId }))
      .query(async ({ input, ctx }) => {
        try {
          return await matches.get(input.matchId, ctx.auth.userId);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    activeMatch: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await matches.activeMatchFor(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    mmr: protectedProcedure
      .input(z.object({ mode: modeSchema }))
      .query(async ({ input, ctx }) => {
        try {
          return await mmr.get(ctx.auth.userId, input.mode);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    lbTop: protectedProcedure
      .input(
        z.object({
          mode: modeSchema,
          limit: z.number().int().min(1).max(500).optional(),
          seasonId: z.string().min(1).max(32).optional(),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await lb.top(input.mode, input.limit ?? 50, input.seasonId);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    lbAroundMe: protectedProcedure
      .input(
        z.object({
          mode: modeSchema,
          radius: z.number().int().min(0).max(50).optional(),
          seasonId: z.string().min(1).max(32).optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        try {
          return await lb.aroundUser(
            ctx.auth.userId,
            input.mode,
            input.radius ?? 5,
            input.seasonId,
          );
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type PvpRouter = ReturnType<typeof createPvpRouter>;
