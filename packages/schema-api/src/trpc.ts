// Aetheria — tRPC root setup.
//
// Exposes:
//   - `router`, `mergeRouters`     for composing sub-routers
//   - `publicProcedure`            no auth required
//   - `protectedProcedure`         requires `ctx.auth` (throws AppError otherwise)
//   - `adminProcedure`             requires `roles` to include "admin"
//
// Error handling: any thrown `AppError` is converted to a TRPCError whose
// `data.app` carries the wire-shape (code, message, details, httpStatus)
// so the client can pattern-match without re-implementing translation.

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { AppError, isAppError } from "./errors.js";
import type { AuthedContext, BaseContext } from "./context.js";

const t = initTRPC.context<BaseContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // 1) Zod validation errors → wire-friendly VALIDATION_FAILED
    if (error.cause instanceof ZodError) {
      const validation = AppError.validation(
        { issues: error.cause.flatten() },
        "Validation failed",
      );
      return {
        ...shape,
        message: validation.message,
        data: { ...shape.data, app: validation.toJSON() },
      };
    }
    // 2) Domain AppError (server threw via .toTRPCError() or directly as cause)
    const cause = error.cause;
    if (isAppError(cause)) {
      return {
        ...shape,
        message: cause.message,
        data: { ...shape.data, app: cause.toJSON() },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.auth) throw AppError.unauthenticated().toTRPCError();
  const authedCtx: AuthedContext = { ...ctx, auth: ctx.auth };
  return next({ ctx: authedCtx });
});

const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.auth) throw AppError.unauthenticated().toTRPCError();
  if (!ctx.auth.roles.includes("admin")) throw AppError.forbidden().toTRPCError();
  const authedCtx: AuthedContext = { ...ctx, auth: ctx.auth };
  return next({ ctx: authedCtx });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
export const adminProcedure = t.procedure.use(enforceAdmin);

/**
 * Wrap an arbitrary error as a TRPCError so the HTTP layer picks up the
 * right status. Callers do `throw asTrpcError(e)` — returning the error
 * (rather than throwing internally) keeps return-type inference clean for
 * resolvers that catch and re-surface errors.
 */
export const asTrpcError = (e: unknown): TRPCError => {
  if (isAppError(e)) return e.toTRPCError();
  if (e instanceof TRPCError) return e;
  return AppError.internal("Unexpected error", e).toTRPCError();
};
