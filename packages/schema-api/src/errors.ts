// Aetheria — runtime AppError class.
//
// Pairs with the compile-time surface in `@aetheria/shared-types/errors`
// (ErrorCode + ErrorHttpStatus). Throw AppError everywhere on the server;
// the tRPC error formatter (see ./trpc.ts) translates it to a wire-shape
// the web client can pattern-match on.

import { TRPCError } from "@trpc/server";

import {
  type AppErrorShape,
  type ErrorCode,
  ErrorHttpStatus,
} from "@aetheria/shared-types";

// tRPC's TRPCError code enum is narrower than the HTTP status space, so we
// fold a few codes onto their closest neighbours (e.g. 402/503 → CONFLICT/INTERNAL).
const TRPC_CODE_BY_HTTP: Record<number, TRPCError["code"]> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  402: "BAD_REQUEST",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  408: "TIMEOUT",
  409: "CONFLICT",
  412: "PRECONDITION_FAILED",
  422: "UNPROCESSABLE_CONTENT",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
  501: "NOT_IMPLEMENTED",
  503: "INTERNAL_SERVER_ERROR",
  504: "TIMEOUT",
};

export class AppError extends Error implements AppErrorShape {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { details?: Readonly<Record<string, unknown>>; cause?: unknown },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (opts?.details) this.details = opts.details;
    if (opts?.cause !== undefined) this.cause = opts.cause;
  }

  /** HTTP status for this error (per ErrorHttpStatus map). */
  get httpStatus(): number {
    return ErrorHttpStatus[this.code];
  }

  /** Wire-safe JSON shape (excludes stack + cause by default). */
  toJSON(): AppErrorShape & { httpStatus: number } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      httpStatus: this.httpStatus,
    };
  }

  /** Convert to a tRPC error (server boundary). */
  toTRPCError(): TRPCError {
    const trpcCode = TRPC_CODE_BY_HTTP[this.httpStatus] ?? "INTERNAL_SERVER_ERROR";
    return new TRPCError({
      code: trpcCode,
      message: this.message,
      cause: this,
    });
  }

  // ── Common factories — keep call sites short and readable ────────────
  static badRequest(message = "Bad request", details?: Record<string, unknown>): AppError {
    return new AppError("BAD_REQUEST", message, details ? { details } : undefined);
  }
  static validation(details: Record<string, unknown>, message = "Validation failed"): AppError {
    return new AppError("VALIDATION_FAILED", message, { details });
  }
  static unauthenticated(message = "Authentication required"): AppError {
    return new AppError("UNAUTHENTICATED", message);
  }
  static forbidden(message = "Forbidden", details?: Record<string, unknown>): AppError {
    return new AppError("FORBIDDEN", message, details ? { details } : undefined);
  }
  static notFound(resource: string, id?: bigint | number | string): AppError {
    const msg = id === undefined ? `${resource} not found` : `${resource} '${String(id)}' not found`;
    return new AppError("NOT_FOUND", msg, id === undefined ? undefined : { details: { id: String(id) } });
  }
  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError("CONFLICT", message, details ? { details } : undefined);
  }
  static rateLimited(message = "Too many requests"): AppError {
    return new AppError("RATE_LIMITED", message);
  }
  static staleVersion(message = "Stale version", details?: Record<string, unknown>): AppError {
    return new AppError("STALE_VERSION", message, details ? { details } : undefined);
  }
  static insufficientCurrency(currency: string, need: number, have: number): AppError {
    return new AppError("INSUFFICIENT_CURRENCY", "Insufficient currency", {
      details: { currency, need, have },
    });
  }
  static insufficientLevel(need: number, have: number): AppError {
    return new AppError("INSUFFICIENT_LEVEL", "Account level too low", {
      details: { need, have },
    });
  }
  static itemOutOfStock(itemId: bigint | string): AppError {
    return new AppError("ITEM_OUT_OF_STOCK", "Item is out of stock", {
      details: { itemId: String(itemId) },
    });
  }
  static questNotReady(questId: bigint | string): AppError {
    return new AppError("QUEST_NOT_READY", "Quest progress incomplete", {
      details: { questId: String(questId) },
    });
  }
  static alreadyClaimed(resource: string): AppError {
    return new AppError("ALREADY_CLAIMED", `${resource} already claimed`);
  }
  static invalidAction(reason: string, details?: Record<string, unknown>): AppError {
    return new AppError("INVALID_ACTION", reason, details ? { details } : undefined);
  }
  static internal(message = "Internal server error", cause?: unknown): AppError {
    return new AppError("INTERNAL", message, cause === undefined ? undefined : { cause });
  }
  static notImplemented(feature: string): AppError {
    return new AppError("NOT_IMPLEMENTED", `${feature} is not implemented yet`);
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
