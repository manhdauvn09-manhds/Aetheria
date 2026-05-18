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

// Avatar URLs are rendered by the client in <img> tags. Allow only public
// http/https — block javascript:, data:, file:, and RFC1918 / link-local
// hostnames so:
//   1. A malicious URL can't ride through to XSS via any future
//      server-side render that doesn't escape it.
//   2. The server doesn't accidentally SSRF cloud-metadata endpoints
//      (169.254.169.254) if we ever prefetch / thumbnail avatars.
const PRIVATE_HOST_RE = /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|localhost$)/i;
const PRIVATE_HOST_PREFIX_172 = /^172\.(1[6-9]|2[0-9]|3[01])\./;
const avatarUrlSchema = z
  .string()
  .url()
  .max(512)
  .refine((raw) => {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      const host = u.hostname.toLowerCase();
      if (PRIVATE_HOST_RE.test(host)) return false;
      if (PRIVATE_HOST_PREFIX_172.test(host)) return false;
      return true;
    } catch {
      return false;
    }
  }, "avatarUrl must be http/https with a public hostname");

// Preferences is a free-form JSON blob persisted to the profile row.
// Cap size + key count so a single user can't bloat the row to MBs
// (slows getProfile, which is on every page load) or DoS the JSON
// serializer.
const preferencesSchema = z
  .record(jsonValue)
  .refine((o) => Object.keys(o).length <= 64, "preferences: max 64 keys")
  .refine((o) => JSON.stringify(o).length <= 8 * 1024, "preferences: max 8 KB serialized");

const updateInput = z
  .object({
    displayName: displayNameSchema.optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
    country: iso2CountrySchema.nullable().optional(),
    language: bcp47LanguageSchema.nullable().optional(),
    preferences: preferencesSchema.optional(),
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
