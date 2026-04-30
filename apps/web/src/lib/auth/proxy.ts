// Aetheria — Next API ↔ tRPC API proxy helpers.
//
// The Next /api/auth/* routes mediate between the browser and the Aetheria
// tRPC API. Two reasons:
//   1. Refresh token never crosses into JS — set as httpOnly cookie on the
//      same origin as the web app.
//   2. Errors from the API surface uniformly as HTTP 4xx with a small JSON
//      body the React forms can render.
//
// This module owns the server-side tRPC client + cookie + error helpers.

import { TRPCClientError } from "@trpc/client";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@aetheria/api/router";

import { env } from "../env";

export const REFRESH_COOKIE = "aetheria_refresh";

export const apiClient = (): ReturnType<typeof createTRPCProxyClient<AppRouter>> =>
  createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${env.NEXT_PUBLIC_API_URL}/trpc`,
        headers: () => ({ "x-aetheria-client": "web-route" }),
      }),
    ],
  });

export interface ProxyError {
  readonly status: number;
  readonly body: { code: string; message: string; details?: unknown };
}

/** Convert a thrown tRPC client error into the wire shape we send to the browser. */
export const proxyErrorFor = (e: unknown): ProxyError => {
  if (e instanceof TRPCClientError) {
    const data = (e.data ?? {}) as {
      app?: { code?: string; message?: string; details?: unknown; httpStatus?: number };
      httpStatus?: number;
    };
    if (data.app) {
      return {
        status: data.app.httpStatus ?? 400,
        body: {
          code: data.app.code ?? "BAD_REQUEST",
          message: data.app.message ?? e.message,
          ...(data.app.details !== undefined ? { details: data.app.details } : {}),
        },
      };
    }
    return {
      status: data.httpStatus ?? 500,
      body: { code: "INTERNAL", message: e.message },
    };
  }
  return {
    status: 500,
    body: { code: "INTERNAL", message: e instanceof Error ? e.message : "Unexpected error" },
  };
};

export interface RefreshCookieOptions {
  /** Epoch ms from the API (`refreshTokenExpiresAt`). */
  readonly expiresAt: number;
}

/** Build the `Set-Cookie` header value for the refresh token. */
export const buildRefreshCookie = (
  token: string,
  opts: RefreshCookieOptions,
): string => {
  const ttlSec = Math.max(0, Math.floor((opts.expiresAt - Date.now()) / 1000));
  const parts = [
    `${REFRESH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ttlSec}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
};

/** Build the `Set-Cookie` header value that clears the refresh cookie. */
export const buildClearRefreshCookie = (): string => {
  const parts = [
    `${REFRESH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
};

export interface SessionResponseBody {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly string[];
    readonly oauthProvider: "google" | "discord" | null;
  };
  readonly access: {
    readonly value: string;
    readonly expiresAt: number;
  };
}

export const sessionResponseFromTrpc = (res: {
  user: SessionResponseBody["user"];
  tokens: { accessToken: string; accessTokenExpiresAt: number };
}): SessionResponseBody => ({
  user: res.user,
  access: { value: res.tokens.accessToken, expiresAt: res.tokens.accessTokenExpiresAt },
});
