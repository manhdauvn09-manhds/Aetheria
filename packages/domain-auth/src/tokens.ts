// Aetheria — JWT signing helpers (server-side only).
//
// Two token kinds:
//   - access  : HS256, JWT_SECRET, 15 min lifetime, carries `roles`. Verified
//               at every API call (apps/api/src/auth/jwt.ts).
//   - refresh : HS256, JWT_REFRESH_SECRET (separate key — leaking either
//               doesn't compromise the other), 30 d lifetime, carries a
//               server-stored `jti`. Used only by the `auth.refreshToken`
//               procedure and rotated on every call.
//
// Refresh-token revocation is achieved by storing `jti -> {userId, expiresAt}`
// in `RefreshTokenStore`. A token is valid iff (a) signature ok, (b) jti
// present in store, (c) not expired. Rotation: on use, the old jti is
// removed and a new one is minted.

import { randomUUID } from "node:crypto";

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

import { AppError } from "@aetheria/schema-api";

export interface TokenConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
}

export const defaultTokenTtl = {
  accessTtlSeconds: 15 * 60,           // 15 min
  refreshTtlSeconds: 30 * 24 * 60 * 60, // 30 d
} as const;

export interface AccessClaims {
  sub: string;
  jti: string;
  roles: readonly string[];
  iat: number;
  exp: number;
}

export interface RefreshClaims {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number; // epoch ms
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: number; // epoch ms
  readonly refreshJti: string;
}

const enc = new TextEncoder();
const nowSec = (): number => Math.floor(Date.now() / 1000);

export const signAccessToken = async (
  userId: bigint,
  roles: readonly string[],
  cfg: TokenConfig,
): Promise<{ token: string; jti: string; expiresAt: number }> => {
  const jti = randomUUID();
  const iat = nowSec();
  const exp = iat + cfg.accessTtlSeconds;
  const token = await new SignJWT({ roles })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId.toString())
    .setJti(jti)
    .setIssuer(cfg.issuer)
    .setAudience(cfg.audience)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(enc.encode(cfg.accessSecret));
  return { token, jti, expiresAt: exp * 1000 };
};

export const signRefreshToken = async (
  userId: bigint,
  cfg: TokenConfig,
): Promise<{ token: string; jti: string; expiresAt: number }> => {
  const jti = randomUUID();
  const iat = nowSec();
  const exp = iat + cfg.refreshTtlSeconds;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId.toString())
    .setJti(jti)
    .setIssuer(cfg.issuer)
    .setAudience(cfg.audience)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(enc.encode(cfg.refreshSecret));
  return { token, jti, expiresAt: exp * 1000 };
};

export const issueTokenPair = async (
  userId: bigint,
  roles: readonly string[],
  cfg: TokenConfig,
): Promise<IssuedTokens> => {
  const [access, refresh] = await Promise.all([
    signAccessToken(userId, roles, cfg),
    signRefreshToken(userId, cfg),
  ]);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
    refreshJti: refresh.jti,
  };
};

/**
 * Verify a refresh token's signature + iss/aud and pull out the claims.
 * Caller still has to check the jti against `RefreshTokenStore` — this
 * function does NOT consult the store.
 */
export const verifyRefreshToken = async (
  token: string,
  cfg: TokenConfig,
): Promise<{ userId: bigint; jti: string; expiresAt: number }> => {
  let claims: RefreshClaims;
  try {
    const result = await jwtVerify(token, enc.encode(cfg.refreshSecret), {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: ["HS256"],
    });
    claims = result.payload as unknown as RefreshClaims;
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw AppError.unauthenticated("Refresh token expired");
    if (e instanceof joseErrors.JWTClaimValidationFailed) throw AppError.unauthenticated("Refresh token claim invalid");
    if (e instanceof joseErrors.JWSSignatureVerificationFailed) throw AppError.unauthenticated("Refresh token signature invalid");
    throw AppError.unauthenticated("Refresh token invalid");
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw AppError.unauthenticated("Refresh token missing subject");
  }
  if (typeof claims.jti !== "string" || claims.jti.length === 0) {
    throw AppError.unauthenticated("Refresh token missing jti");
  }
  let userId: bigint;
  try {
    userId = BigInt(claims.sub);
  } catch {
    throw AppError.unauthenticated("Refresh token subject malformed");
  }
  return { userId, jti: claims.jti, expiresAt: claims.exp * 1000 };
};
