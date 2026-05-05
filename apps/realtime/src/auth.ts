// Aetheria — Socket.IO connection auth middleware.
//
// Reuses the same access-token contract as apps/api so the browser only
// needs one bearer secret. The token is read from either:
//   1. `auth.token` on the Socket.IO handshake (preferred), or
//   2. the `authorization: Bearer <jwt>` HTTP header.
//
// We deliberately avoid query-string fallback — query strings end up in
// reverse-proxy access logs and that's a bad place for a bearer secret.

import { errors as joseErrors, jwtVerify } from "jose";

import type { Socket } from "socket.io";

const enc = new TextEncoder();

export interface JwtConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
}

export interface SocketAuth {
  readonly userId: string;
  readonly roles: readonly string[];
}

/**
 * Augment Socket.IO's connection data with our verified user. Avoids
 * polluting `socket.handshake` and keeps types narrow.
 */
declare module "socket.io" {
  interface Socket {
    auth?: SocketAuth;
  }
}

const extractToken = (socket: Socket): string | null => {
  const authObj = socket.handshake.auth as Record<string, unknown> | undefined;
  const fromHandshake = typeof authObj?.token === "string" ? authObj.token : null;
  if (fromHandshake) return fromHandshake;

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (m?.[1]) return m[1];
  }
  return null;
};

export type SocketIoMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
) => void;

export const buildAuthMiddleware = (cfg: JwtConfig): SocketIoMiddleware => {
  const key = enc.encode(cfg.secret);
  return (socket, next): void => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error("UNAUTHENTICATED: missing token"));
      return;
    }
    jwtVerify(token, key, {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: ["HS256"],
    })
      .then((result) => {
        const sub = result.payload.sub;
        if (typeof sub !== "string" || sub.length === 0) {
          next(new Error("UNAUTHENTICATED: token missing subject"));
          return;
        }
        const rawRoles = (result.payload as { roles?: unknown }).roles;
        const roles: readonly string[] = Array.isArray(rawRoles)
          ? rawRoles.filter((r): r is string => typeof r === "string")
          : [];
        socket.auth = { userId: sub, roles };
        next();
      })
      .catch((e: unknown) => {
        if (e instanceof joseErrors.JWTExpired) {
          next(new Error("UNAUTHENTICATED: token expired"));
          return;
        }
        next(new Error("UNAUTHENTICATED: invalid token"));
      });
  };
};
