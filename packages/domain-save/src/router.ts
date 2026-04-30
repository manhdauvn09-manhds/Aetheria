// Aetheria — save tRPC router (factory).
//
// All five procedures are protected. Slot is constrained to 0..3 at the
// validator boundary so service code only sees valid values.

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";
import { jsonValue } from "@aetheria/schema-api/zod";

import type { SaveService } from "./service.js";
import { MAX_SLOT } from "./service.js";

const slotSchema = z.number().int().min(0).max(MAX_SLOT);
const payloadSchema = z.record(jsonValue);
const versionSchema = z.number().int().min(1).max(9_999_999);

const snapshotInput = z.object({
  slot: slotSchema,
  payload: payloadSchema,
  schemaVersion: versionSchema.optional(),
});

const autosaveInput = z.object({
  payload: payloadSchema,
  schemaVersion: versionSchema.optional(),
});

const slotInput = z.object({ slot: slotSchema });

const reconcileInput = z.object({
  slot: slotSchema,
  expectedVersion: versionSchema,
  payload: payloadSchema,
});

export const createSaveRouter = (service: SaveService) =>
  router({
    snapshot: protectedProcedure
      .input(snapshotInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.snapshot({
            userId: ctx.auth.userId,
            slot: input.slot,
            payload: input.payload,
            ...(input.schemaVersion !== undefined ? { schemaVersion: input.schemaVersion } : {}),
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    autosaveTick: protectedProcedure
      .input(autosaveInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.autosaveTick({
            userId: ctx.auth.userId,
            payload: input.payload,
            ...(input.schemaVersion !== undefined ? { schemaVersion: input.schemaVersion } : {}),
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.list(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    load: protectedProcedure
      .input(slotInput)
      .query(async ({ ctx, input }) => {
        try {
          return await service.load({ userId: ctx.auth.userId, slot: input.slot });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    delete: protectedProcedure
      .input(slotInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.delete({ userId: ctx.auth.userId, slot: input.slot });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    reconcile: protectedProcedure
      .input(reconcileInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.reconcile({
            userId: ctx.auth.userId,
            slot: input.slot,
            expectedVersion: input.expectedVersion,
            payload: input.payload,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type SaveRouter = ReturnType<typeof createSaveRouter>;
