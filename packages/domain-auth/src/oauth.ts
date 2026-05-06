// Aetheria — OAuth identity verification.
//
// We accept *already-issued* OAuth credentials from the client and verify
// them server-side before linking to a user. This keeps the server in
// control of the source of truth: a stolen NextAuth cookie can't forge
// an identity because the JWKS / Discord API will fail.
//
// Two providers in scope:
//   - Google  : verifies an OIDC id_token via Google's JWKS (jose).
//   - Discord : exchanges an access_token via /users/@me. Discord doesn't
//               issue an id_token, so this is the canonical pattern.

import { createRemoteJWKSet, jwtVerify } from "jose";

import { AppError } from "@aetheria/schema-api";

export type OAuthProvider = "google" | "discord";

export interface OAuthIdentity {
  readonly provider: OAuthProvider;
  /** Stable provider-side user id (`sub` for Google, snowflake for Discord). */
  readonly providerSubject: string;
  readonly email: string;
  /** Whether the provider attests the email is verified. */
  readonly emailVerified: boolean;
  /** Provider-supplied display hint; may be null if user hides it. */
  readonly displayName: string | null;
}

// ── Google ─────────────────────────────────────────────────────────────

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
// The JWKS object caches keys + auto-rotates. Module-scope is fine —
// jose handles concurrent fetches.
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

interface GoogleIdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
}

export const verifyGoogleIdToken = async (
  idToken: string,
  audience: string,
): Promise<OAuthIdentity> => {
  let claims: GoogleIdTokenClaims;
  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      issuer: GOOGLE_ISSUERS,
      audience,
      algorithms: ["RS256"],
    });
    claims = payload;
  } catch {
    throw AppError.unauthenticated("Google identity verification failed");
  }
  if (!claims.sub || !claims.email) {
    throw AppError.unauthenticated("Google identity is missing required fields");
  }
  return {
    provider: "google",
    providerSubject: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
    displayName: claims.name ?? claims.given_name ?? null,
  };
};

// ── Discord ────────────────────────────────────────────────────────────
//
// B8 note: The OAuth `state` CSRF parameter and PKCE verification are
// handled by NextAuth.js during the authorization-code callback
// (apps/web/src/app/api/auth/[...nextauth]/route.ts). This server-side
// domain function only receives a *completed* access token that the client
// obtained from NextAuth after state was already validated. Delegating
// state/PKCE to NextAuth is the correct design for this architecture.

interface DiscordUserResponse {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
}

const DISCORD_USERS_ME = "https://discord.com/api/v10/users/@me";

export const verifyDiscordAccessToken = async (
  accessToken: string,
): Promise<OAuthIdentity> => {
  let res: Response;
  try {
    res = await fetch(DISCORD_USERS_ME, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Avoid hanging the request thread on a slow Discord response.
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw AppError.unauthenticated("Discord identity verification failed");
  }
  if (!res.ok) {
    // 401 ⇒ token bad/expired; anything else ⇒ Discord trouble — surface as auth fail
    // either way (the user can retry).
    throw AppError.unauthenticated("Discord identity verification failed");
  }
  const data = (await res.json()) as DiscordUserResponse;
  if (!data.id || !data.email) {
    throw AppError.unauthenticated("Discord identity is missing required fields");
  }
  const display = data.global_name ?? data.username ?? null;
  return {
    provider: "discord",
    providerSubject: data.id,
    email: data.email.toLowerCase(),
    emailVerified: data.verified === true,
    displayName: display,
  };
};
