// Aetheria — request context shape.
//
// The actual context factory lives in `apps/api` (Step 4.7) where Fastify
// supplies the request/response. This package only defines the *type*, so
// procedures can be authored against a stable contract before infra exists.

import type { UserId } from "@aetheria/shared-types";

export interface RequestInfo {
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
  readonly requestId: string;
}

export interface AuthContext {
  /** Decoded subject from the access token. */
  readonly userId: UserId;
  /** Scopes / roles, if any. Reserved for admin endpoints. */
  readonly roles: readonly string[];
}

export interface BaseContext {
  readonly request: RequestInfo;
  /** Present iff a valid access token was supplied. */
  readonly auth: AuthContext | null;
}

/** Convenience: a context guaranteed to be authenticated. */
export interface AuthedContext extends BaseContext {
  readonly auth: AuthContext;
}

/**
 * Default empty context for unit tests / skeleton dev runs.
 * Real factories live in `apps/api`.
 */
export const emptyContext = (): BaseContext => ({
  request: { ip: undefined, userAgent: undefined, requestId: "test" },
  auth: null,
});
