// Typed error codes shared by api ↔ web. The runtime AppError class lives in
// the core utility package added in Step 4.6; this file only provides the
// compile-time surface so domain code can already throw with the right shape.

export const ErrorCodes = [
  // 4xx — client / domain
  "BAD_REQUEST",
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PRECONDITION_FAILED",
  "STALE_VERSION",          // optimistic-concurrency mismatch (save reconcile)
  "INSUFFICIENT_CURRENCY",
  "INSUFFICIENT_LEVEL",
  "ITEM_OUT_OF_STOCK",
  "QUEST_NOT_READY",
  "ALREADY_CLAIMED",
  "INVALID_ACTION",         // combat: action not legal in current state

  // 5xx — server / infra
  "INTERNAL",
  "DB_UNAVAILABLE",
  "REDIS_UNAVAILABLE",
  "DEPENDENCY_TIMEOUT",
  "NOT_IMPLEMENTED",
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];

export interface AppErrorShape {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

// HTTP status used by tRPC's error formatter (filled in 4.5/4.6).
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  BAD_REQUEST:           400,
  VALIDATION_FAILED:     400,
  UNAUTHENTICATED:       401,
  FORBIDDEN:             403,
  NOT_FOUND:             404,
  CONFLICT:              409,
  RATE_LIMITED:          429,
  PRECONDITION_FAILED:   412,
  STALE_VERSION:         409,
  INSUFFICIENT_CURRENCY: 402,
  INSUFFICIENT_LEVEL:    403,
  ITEM_OUT_OF_STOCK:     409,
  QUEST_NOT_READY:       409,
  ALREADY_CLAIMED:       409,
  INVALID_ACTION:        422,
  INTERNAL:              500,
  DB_UNAVAILABLE:        503,
  REDIS_UNAVAILABLE:     503,
  DEPENDENCY_TIMEOUT:    504,
  NOT_IMPLEMENTED:       501,
};
