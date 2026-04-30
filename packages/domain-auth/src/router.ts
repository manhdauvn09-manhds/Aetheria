// Aetheria — auth tRPC router (factory).
//
// `apps/api` builds an AuthService and calls `createAuthRouter(service)` to
// get the router. The router is then merged into `appRouter` under `auth`.
//
// All four procedures are public — they don't require an auth header.
// `logout` is technically a "you must have a refresh token" call, but it
// never reads the access token and is safe to call when already logged out
// (the body is treated as best-effort revocation).

import { z } from "zod";

import {
  publicProcedure,
  router,
  throwAsTrpc,
} from "@aetheria/schema-api/trpc";
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  iso2CountrySchema,
  bcp47LanguageSchema,
} from "@aetheria/schema-api/zod";

import type { AuthService } from "./service.js";

const signupInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  country: iso2CountrySchema.optional(),
  language: bcp47LanguageSchema.optional(),
});

const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024), // verify only — don't enforce composition rules on login
});

const refreshInput = z.object({
  refreshToken: z.string().min(20).max(4096),
});

const logoutInput = z.object({
  refreshToken: z.string().min(20).max(4096),
});

export const createAuthRouter = (service: AuthService) =>
  router({
    signupWithEmail: publicProcedure
      .input(signupInput)
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.signupWithEmail({
            email: input.email,
            password: input.password,
            displayName: input.displayName,
            ...(input.country !== undefined ? { country: input.country } : {}),
            ...(input.language !== undefined ? { language: input.language } : {}),
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throwAsTrpc(e);
        }
      }),

    loginWithEmail: publicProcedure
      .input(loginInput)
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.loginWithEmail({
            email: input.email,
            password: input.password,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throwAsTrpc(e);
        }
      }),

    refreshToken: publicProcedure.input(refreshInput).mutation(async ({ input }) => {
      try {
        return await service.refreshToken({ refreshToken: input.refreshToken });
      } catch (e) {
        throwAsTrpc(e);
      }
    }),

    logout: publicProcedure.input(logoutInput).mutation(async ({ input }) => {
      try {
        return await service.logout({ refreshToken: input.refreshToken });
      } catch (e) {
        throwAsTrpc(e);
      }
    }),
  });

export type AuthRouter = ReturnType<typeof createAuthRouter>;
