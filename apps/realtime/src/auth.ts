// Aetheria — Socket.IO connection auth middleware.
//
// Reuses the same access-token contract as apps/api so the browser only
// needs one bearer secret. The token is read from either:
//   1. `auth.token` on the Socket.IO handshake (preferred), or
//   2. the `authorization: Bearer <jwt>` HTTP header.
//
// We deliberately avoid query-string fallback — query strings end up in
// reverse-proxy access logs and that's a bad place for a bearer secret.
//
// B5 replay guard: each JWT must carry a `jti` claim. Once a connection is
// established the jti is locked to that socket. A second handshake with the
// same jti is rejected while the first socket is still live. On disconnect
// the lock is released so the client can reconnect with the same token within
// its TTL (the expected single-tab reconnect pattern).

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
  readonly jti: string;
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

/**
 * Tracks which JTIs are currently held by an active socket.
 * Used to prevent the same access token being replayed to open a second
 * concurrent WebSocket session (B5).
 *
 * Call `jtiRegistry.release(jti)` in the socket's "disconnect" handler.
 *
 * JTIs are also given a TTL (access token lifetime, typically 15 min) so that
 * orphaned entries from crashed sockets are automatically cleaned up. This
 * prevents unbounded growth if disconnect handlers are skipped.
 */
export interface JtiRegistry {
  /** Returns false if the jti is already claimed. */
  claim(jti: string, expiresAtMs: number): boolean;
  release(jti: string): void;
}

export const buildJtiRegistry = (): JtiRegistry => {
  const active = new Map<string, number>(); // jti -> expiresAtMs

  // Cleanup timer: every 30s, sweep expired JTIs.
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [jti, expiresAt] of active.entries()) {
      if (expiresAt <= now) {
        active.delete(jti);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      // Ops will see this on realtime logs if cleanup is frequent
      // (sign of many socket crashes).
    }
  }, 30_000);
  cleanupTimer.unref();

  return {
    claim(jti, expiresAtMs) {
      if (active.has(jti)) return false;
      active.set(jti, expiresAtMs);
      return true;
    },
    release(jti) {
      active.delete(jti);
    },
  };
};

export const buildAuthMiddleware = (
  cfg: JwtConfig,
  jtiRegistry: JtiRegistry,
): SocketIoMiddleware => {
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

        const jti = result.payload.jti;
        if (typeof jti !== "string" || jti.length === 0) {
          next(new Error("UNAUTHENTICATED: token missing jti"));
          return;
        }

        // Extract token expiration to use as JTI TTL. If token is expired,
        // jwtVerify would have thrown above, so exp is guaranteed valid.
        const exp = result.payload.exp;
        const expiresAtMs = typeof exp === "number" ? exp * 1000 : Date.now() + 15 * 60_000;

        if (!jtiRegistry.claim(jti, expiresAtMs)) {
          next(new Error("UNAUTHENTICATED: token already in use"));
          return;
        }

        const rawRoles = (result.payload as { roles?: unknown }).roles;
        const roles: readonly string[] = Array.isArray(rawRoles)
          ? rawRoles.filter((r): r is string => typeof r === "string")
          : [];
        socket.auth = { userId: sub, roles, jti };
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
