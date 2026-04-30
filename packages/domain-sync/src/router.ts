// Aetheria — sync tRPC router (factory).
//
// Procedures:
//   - sync.push   forward client mutations to MySQL
//   - sync.pull   fetch catalog patches since cursor
//   - sync.tick   one full cycle: drain SQLite queue + apply pulls locally
//   - sync.status queue depth + per-table cursors

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";
import { jsonValue } from "@aetheria/schema-api/zod";

import type { SyncService } from "./service.js";

const operationSchema = z.enum(["insert", "update", "delete"]);

const mutationSchema = z.object({
  tableName: z.string().min(1).max(64),
  rowKey: z.string().min(1).max(128),
  operation: operationSchema,
  payload: z.record(jsonValue),
});

const pushInput = z.object({
  mutations: z.array(mutationSchema).min(0).max(500),
});

const pullInput = z.object({
  tables: z
    .array(
      z.object({
        tableName: z.string().min(1).max(64),
        cursor: z.string().min(1).max(64).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const createSyncRouter = (service: SyncService) =>
  router({
    push: protectedProcedure
      .input(pushInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.push(ctx.auth.userId, input.mutations);
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    pull: protectedProcedure
      .input(pullInput)
      .query(async ({ input }) => {
        try {
          return await service.pull(
            input.tables.map((t) => ({
              tableName: t.tableName,
              cursor: t.cursor ?? null,
            })),
          );
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    tick: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        return await service.tick(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    status: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.status(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),
  });

export type SyncRouter = ReturnType<typeof createSyncRouter>;
