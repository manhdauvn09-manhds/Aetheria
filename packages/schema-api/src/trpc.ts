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

const isProd = (): boolean => process.env.NODE_ENV === "production";

/**
 * Strip the fields tRPC's default shape would leak in production:
 *   - `stack`     internal Node call stack (path disclosure)
 *   - `zodError`  raw zod issue tree (we already mirror it under `data.app`
 *                 in a wire-shape both server and client agree on)
 */
const stripLeaksInProd = <T extends { data?: Record<string, unknown> }>(shape: T): T => {
  if (!isProd()) return shape;
  const data = { ...(shape.data ?? {}) };
  delete data["stack"];
  delete data["zodError"];
  return { ...shape, data };
};

const t = initTRPC.context<BaseContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // 1) Zod validation errors → wire-friendly VALIDATION_FAILED
    if (error.cause instanceof ZodError) {
      const validation = AppError.validation(
        { issues: error.cause.flatten() },
        "Validation failed",
      );
      return stripLeaksInProd({
        ...shape,
        message: validation.message,
        data: { ...shape.data, app: validation.toJSON() },
      });
    }
    // 2) Domain AppError (server threw via .toTRPCError() or directly as cause)
    const cause = error.cause;
    if (isAppError(cause)) {
      return stripLeaksInProd({
        ...shape,
        message: cause.message,
        data: { ...shape.data, app: cause.toJSON() },
      });
    }
    // 3) Anything else — generic shape with leak guards in prod.
    return stripLeaksInProd(shape);
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
