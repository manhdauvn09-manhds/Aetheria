// Aetheria — account tRPC router (factory).
//
// All three procedures are protected — they operate on the authenticated
// user (`ctx.auth.userId`). No `userId` input field exists by design;
// admins go through a separate adminRouter (Phase 4-H).

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";
import {
  bcp47LanguageSchema,
  displayNameSchema,
  iso2CountrySchema,
  jsonValue,
} from "@aetheria/schema-api/zod";

import type { AccountService } from "./service.js";

const updateInput = z
  .object({
    displayName: displayNameSchema.optional(),
    avatarUrl: z.string().url().max(512).nullable().optional(),
    country: iso2CountrySchema.nullable().optional(),
    language: bcp47LanguageSchema.nullable().optional(),
    preferences: z.record(jsonValue).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

const deleteInput = z.object({
  confirmText: z.string().min(1).max(255),
  currentPassword: z.string().min(1).max(1024).optional(),
});

const optionalNullableField = <T>(value: T | null | undefined): { value?: T | null } => {
  if (value === undefined) return {};
  return { value };
};

export const createAccountRouter = (service: AccountService) =>
  router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.getProfile(ctx.auth.userId);
      } catch (e) {
        throw asTrpcError(e);
      }
    }),

    updateProfile: protectedProcedure
      .input(updateInput)
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.updateProfile({
            userId: ctx.auth.userId,
            ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
            ...(optionalNullableField(input.avatarUrl).value !== undefined
              ? { avatarUrl: input.avatarUrl ?? null }
              : {}),
            ...(optionalNullableField(input.country).value !== undefined
              ? { country: input.country ?? null }
              : {}),
            ...(optionalNullableField(input.language).value !== undefined
              ? { language: input.language ?? null }
              : {}),
            ...(input.preferences !== undefined ? { preferences: input.preferences } : {}),
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    deleteAccount: protectedProcedure
      .input(deleteInput)
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.deleteAccount({
            userId: ctx.auth.userId,
            confirmText: input.confirmText,
            ...(input.currentPassword !== undefined
              ? { currentPassword: input.currentPassword }
              : {}),
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type AccountRouter = ReturnType<typeof createAccountRouter>;
