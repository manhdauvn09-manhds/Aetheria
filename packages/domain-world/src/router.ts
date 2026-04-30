// Aetheria — world tRPC router (factory).
//
// All procedures are protected — they read state for the authenticated
// user (`ctx.auth.userId`).

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { WorldService } from "./service.js";

const realmIdInput = z.object({
  realmId: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => (typeof v === "bigint" ? v : BigInt(v))),
});

const startLevelInput = z.object({
  levelNumber: z.number().int().min(1).max(9999),
});

const runIdInput = z.object({
  runId: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => (typeof v === "bigint" ? v : BigInt(v))),
});

export const createWorldRouter = (service: WorldService) =>
  router({
    realms: protectedProcedure.query(async () => {
      try {
        return await service.realms();
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    levelsForRealm: protectedProcedure
      .input(realmIdInput)
      .query(async ({ input }) => {
        try {
          return await service.levelsForRealm(input.realmId);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    startLevel: protectedProcedure
      .input(startLevelInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.startLevel({
            userId: ctx.auth.userId,
            levelNumber: input.levelNumber,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    resumeRun: protectedProcedure
      .input(runIdInput)
      .query(async ({ ctx, input }) => {
        try {
          return await service.resumeRun({
            userId: ctx.auth.userId,
            runId: input.runId,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    abandonRun: protectedProcedure
      .input(runIdInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.abandonRun({
            userId: ctx.auth.userId,
            runId: input.runId,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type WorldRouter = ReturnType<typeof createWorldRouter>;
