// Aetheria — JWT verify (access tokens).
//
// Token issuance lives in the auth domain (Step 4.9). This module only
// handles verification at the API boundary so that protected procedures
// have a populated `ctx.auth`.

import { jwtVerify, errors as joseErrors } from "jose";

import { asBigIntId, type UserId } from "@aetheria/shared-types";
import { AppError } from "@aetheria/schema-api";

export interface AccessTokenClaims {
  /** Subject — string-encoded user id (BigInt → string for JWT compatibility). */
  sub: string;
  /** Roles list (e.g. ["admin"]). Empty for regular users. */
  roles?: readonly string[];
  iat: number;
  exp: number;
  iss?: string;
  aud?: string | readonly string[];
}

export interface VerifiedUser {
  readonly userId: UserId;
  readonly roles: readonly string[];
}

export interface JwtConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
}

const enc = new TextEncoder();

/**
 * Verify an access token and return the user it identifies.
 * Throws AppError("UNAUTHENTICATED", ...) for any failure mode the client
 * is allowed to see (expired, malformed, signature mismatch).
 */
export const verifyAccessToken = async (
  token: string,
  cfg: JwtConfig,
): Promise<VerifiedUser> => {
  let payload: AccessTokenClaims;
  try {
    const result = await jwtVerify(token, enc.encode(cfg.secret), {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: ["HS256"],
    });
    payload = result.payload as unknown as AccessTokenClaims;
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw AppError.unauthenticated("Token expired");
    if (e instanceof joseErrors.JWTClaimValidationFailed) throw AppError.unauthenticated("Token claim invalid");
    if (e instanceof joseErrors.JWSSignatureVerificationFailed) throw AppError.unauthenticated("Bad signature");
    throw AppError.unauthenticated("Invalid token");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw AppError.unauthenticated("Token missing subject");
  }
  let userId: UserId;
  try {
    userId = asBigIntId<"UserId">(BigInt(payload.sub));
  } catch {
    throw AppError.unauthenticated("Token subject malformed");
  }
  const roles: readonly string[] = Array.isArray(payload.roles)
    ? payload.roles.filter((r): r is string => typeof r === "string")
    : [];
  return { userId, roles };
};

/** Pull a Bearer token out of an `authorization` header value. */
export const extractBearer = (header: string | undefined): string | null => {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1] ?? null;
};
