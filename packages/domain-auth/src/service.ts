// Aetheria — AuthService.
//
// Owns the auth flows:
//   - signupWithEmail               (creates user + profile, issues tokens)
//   - loginWithEmail                (verifies password, issues tokens)
//   - loginWithOAuth                (find/link/create user from a verified
//                                    OAuth identity; issues tokens)
//   - loginWithGoogleIdToken        (verifies Google id_token then loginWithOAuth)
//   - loginWithDiscordAccessToken   (verifies Discord access_token then loginWithOAuth)
//   - refreshToken                  (rotates: validates+revokes old jti, issues new pair)
//   - logout                        (revokes the supplied refresh jti)
//   - requestPasswordReset          (mints + emails a reset token; never enumerates)
//   - confirmPasswordReset          (consumes token, sets new password, revokes sessions)
//   - requestEmailVerification      (mints + emails a verification token)
//   - confirmEmailVerification      (consumes token, sets email_verified_at)
//
// Designed to be composed: `apps/api` builds one instance with concrete
// dependencies (Prisma client, refresh store, jwt config) and passes it to
// the tRPC auth router.

import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";
import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";

import { hashPassword, verifyPassword } from "./password.js";
import {
  type IssuedTokens,
  type TokenConfig,
  issueTokenPair,
  verifyRefreshToken,
} from "./tokens.js";
import type { RefreshTokenStore } from "./refresh-store.js";
import {
  type OAuthIdentity,
  type OAuthProvider,
  verifyDiscordAccessToken,
  verifyGoogleIdToken,
} from "./oauth.js";
import {
  type OneShotTokenStore,
  generateOneShotToken,
} from "./token-store.js";
import type { Mailer } from "./mailer.js";

/** Subset of MySQL Prisma we actually call. Lets tests stub easily. */
export type AuthMysqlClient = Pick<MysqlClient, "user" | "profile" | "$transaction">;

export interface OAuthConfig {
  readonly google?: { readonly clientId: string };
  readonly discord?: Record<string, never>;
}

export interface PasswordResetConfig {
  /** TTL for password-reset tokens. Default: 1 h. */
  readonly ttlSeconds?: number;
  /**
   * Front-end URL the email link points at. The token is appended as
   * `?token=…`. Example: `https://aetheria.example/reset-password`.
   */
  readonly redirectUrl: string;
}

export interface EmailVerificationConfig {
  /** TTL for email-verification tokens. Default: 24 h. */
  readonly ttlSeconds?: number;
  /** Front-end URL the verification link points at. */
  readonly redirectUrl: string;
}

export interface AuthDeps {
  readonly mysql: AuthMysqlClient;
  readonly refreshStore: RefreshTokenStore;
  readonly tokenConfig: TokenConfig;
  readonly oauth?: OAuthConfig;
  /** Token store for password-reset / email-verification one-shot codes. */
  readonly oneShotStore?: OneShotTokenStore;
  readonly mailer?: Mailer;
  readonly passwordReset?: PasswordResetConfig;
  readonly emailVerification?: EmailVerificationConfig;
}

export interface SignupInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly country?: string;
  readonly language?: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface OAuthLoginInput {
  readonly identity: OAuthIdentity;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface OAuthGoogleInput {
  readonly idToken: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface OAuthDiscordInput {
  readonly accessToken: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface RefreshInput {
  readonly refreshToken: string;
}

export interface LogoutInput {
  readonly refreshToken: string;
}

export interface RequestPasswordResetInput {
  readonly email: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface ConfirmPasswordResetInput {
  readonly token: string;
  readonly newPassword: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface RequestEmailVerificationInput {
  readonly userId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface ConfirmEmailVerificationInput {
  readonly token: string;
}

export interface AuthSessionResult {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly string[];
    readonly oauthProvider: OAuthProvider | null;
  };
  readonly tokens: IssuedTokens;
}

/** Roles are derived from the row for now — reserved for admin tooling. */
const rolesForUser = (_user: { id: bigint; status: string }): readonly string[] => {
  // Hook for Step 4-H admin: read from `user_roles` table once it exists.
  return [];
};

const persistRefresh = async (
  store: RefreshTokenStore,
  tokens: IssuedTokens,
  userId: bigint,
): Promise<void> => {
  await store.put(tokens.refreshJti, {
    userId,
    expiresAt: tokens.refreshTokenExpiresAt,
  });
};

export class AuthService {
  constructor(private readonly deps: AuthDeps) {}

  async signupWithEmail(input: SignupInput): Promise<AuthSessionResult> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    const created = await this.deps.mysql.$transaction(
      async (tx: MysqlPrisma.Prisma.TransactionClient) => {
        const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) throw AppError.conflict("Email is already registered", { field: "email" });

        const dupName = await tx.profile.findUnique({
          where: { displayName: input.displayName },
          select: { userId: true },
        });
        if (dupName) throw AppError.conflict("Display name is already taken", { field: "displayName" });

        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            status: "active",
            profile: {
              create: {
                displayName: input.displayName,
                country: input.country ?? null,
                language: input.language ?? null,
              },
            },
          },
          select: {
            id: true,
            email: true,
            status: true,
            profile: { select: { displayName: true } },
          },
        });
        return user;
      },
    );

    if (!created.profile) {
      // create() above always creates the profile; this guards the type narrowing.
      throw AppError.internal("Profile not provisioned");
    }

    const roles = rolesForUser({ id: created.id, status: created.status });
    const tokens = await issueTokenPair(created.id, roles, this.deps.tokenConfig);
    await persistRefresh(this.deps.refreshStore, tokens, created.id);

    await audit.write({
      actor: created.id,
      action: "auth.signup",
      targetType: "user",
      targetId: created.id,
      payload: { method: "email", email },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      user: {
        id: created.id.toString(),
        email: created.email,
        displayName: created.profile.displayName,
        roles,
        oauthProvider: null,
      },
      tokens,
    };
  }

  async loginWithEmail(input: LoginInput): Promise<AuthSessionResult> {
    const email = input.email.trim().toLowerCase();

    const user = await this.deps.mysql.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        oauthProvider: true,
        profile: { select: { displayName: true } },
      },
    });
    // Generic error so attackers can't enumerate emails.
    const invalid = AppError.unauthenticated("Invalid email or password");
    if (!user) throw invalid;
    if (user.deletedAt !== null) throw invalid;
    if (user.status !== "active") {
      throw AppError.forbidden("Account is not active");
    }
    if (!user.passwordHash) throw invalid;
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw invalid;
    if (!user.profile) {
      throw AppError.internal("Account is missing its profile");
    }

    const roles = rolesForUser({ id: user.id, status: user.status });
    const tokens = await issueTokenPair(user.id, roles, this.deps.tokenConfig);
    await persistRefresh(this.deps.refreshStore, tokens, user.id);

    await this.deps.mysql.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await audit.write({
      actor: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      payload: { method: "email" },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        displayName: user.profile.displayName,
        roles,
        oauthProvider: (user.oauthProvider as OAuthProvider | null) ?? null,
      },
      tokens,
    };
  }

  async refreshToken(input: RefreshInput): Promise<AuthSessionResult> {
    const claims = await verifyRefreshToken(input.refreshToken, this.deps.tokenConfig);
    const record = await this.deps.refreshStore.get(claims.jti);
    if (!record) throw AppError.unauthenticated("Refresh token revoked or unknown");
    if (record.userId !== claims.userId) {
      // Defence in depth — claim & store agreed at issue time, so a mismatch
      // means the refresh secret has been rotated underneath us. Reject.
      throw AppError.unauthenticated("Refresh token mismatch");
    }

    // Rotate: kill the old jti before minting the new pair.
    await this.deps.refreshStore.revoke(claims.jti);

    const user = await this.deps.mysql.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        email: true,
        status: true,
        deletedAt: true,
        oauthProvider: true,
        profile: { select: { displayName: true } },
      },
    });
    if (!user) throw AppError.unauthenticated("Account no longer eligible");
    if (user.deletedAt !== null || user.status !== "active") {
      throw AppError.unauthenticated("Account no longer eligible");
    }
    if (!user.profile) {
      throw AppError.internal("Account is missing its profile");
    }

    const roles = rolesForUser({ id: user.id, status: user.status });
    const tokens = await issueTokenPair(user.id, roles, this.deps.tokenConfig);
    await persistRefresh(this.deps.refreshStore, tokens, user.id);

    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        displayName: user.profile.displayName,
        roles,
        oauthProvider: (user.oauthProvider as OAuthProvider | null) ?? null,
      },
      tokens,
    };
  }

  async logout(input: LogoutInput): Promise<{ ok: true }> {
    // Best-effort: if signature is bad we treat logout as a no-op so the
    // client can always "clear" without surfacing 401.
    try {
      const claims = await verifyRefreshToken(input.refreshToken, this.deps.tokenConfig);
      await this.deps.refreshStore.revoke(claims.jti);
      await audit.write({
        actor: claims.userId,
        action: "auth.logout",
        targetType: "user",
        targetId: claims.userId,
        payload: {},
      });
    } catch {
      // ignore — already invalid; nothing to revoke.
    }
    return { ok: true };
  }

  async loginWithGoogleIdToken(input: OAuthGoogleInput): Promise<AuthSessionResult> {
    const cfg = this.deps.oauth?.google;
    if (!cfg) throw AppError.notImplemented("Google OAuth");
    const identity = await verifyGoogleIdToken(input.idToken, cfg.clientId);
    return this.loginWithOAuth({
      identity,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  async loginWithDiscordAccessToken(input: OAuthDiscordInput): Promise<AuthSessionResult> {
    if (!this.deps.oauth?.discord) throw AppError.notImplemented("Discord OAuth");
    const identity = await verifyDiscordAccessToken(input.accessToken);
    return this.loginWithOAuth({
      identity,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  /**
   * Find / link / create a user from a verified OAuth identity.
   *  1. Match by (oauthProvider, oauthSubject) — already linked.
   *  2. Else, if the provider attests the email, match by email and link.
   *  3. Else, create a fresh user; pick a unique displayName based on the
   *     provider hint (or the email local-part) with a numeric suffix on
   *     collision.
   */
  async loginWithOAuth(input: OAuthLoginInput): Promise<AuthSessionResult> {
    const { provider, providerSubject, email, emailVerified, displayName } = input.identity;
    return this.loginWithOAuthIdentity({
      provider,
      providerSubject,
      email,
      emailVerified,
      displayName,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  private async loginWithOAuthIdentity(args: {
    provider: OAuthProvider;
    providerSubject: string;
    email: string;
    emailVerified: boolean;
    displayName: string | null;
    ip: string | null;
    userAgent: string | null;
  }): Promise<AuthSessionResult> {
    const { provider, providerSubject, email, emailVerified, displayName, ip, userAgent } = args;

    // 1) Existing OAuth link
    let dbUser = await this.deps.mysql.user.findFirst({
      where: { oauthProvider: provider, oauthSubject: providerSubject },
      select: {
        id: true,
        email: true,
        status: true,
        deletedAt: true,
        oauthProvider: true,
        profile: { select: { displayName: true } },
      },
    });

    let auditAction: "auth.oauth.login" | "auth.oauth.link" | "auth.oauth.signup" = "auth.oauth.login";

    if (!dbUser && emailVerified) {
      // 2) Link to existing email-based account
      const byEmail = await this.deps.mysql.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          status: true,
          deletedAt: true,
          oauthProvider: true,
          profile: { select: { displayName: true } },
        },
      });
      if (byEmail) {
        if (byEmail.deletedAt !== null) throw AppError.forbidden("Account is deleted");
        if (byEmail.oauthProvider && byEmail.oauthProvider !== provider) {
          throw AppError.conflict(
            "Account already linked to a different provider",
            { existingProvider: byEmail.oauthProvider, newProvider: provider },
          );
        }
        await this.deps.mysql.user.update({
          where: { id: byEmail.id },
          data: {
            oauthProvider: provider,
            oauthSubject: providerSubject,
            emailVerifiedAt: new Date(),
          },
        });
        dbUser = { ...byEmail, oauthProvider: provider };
        auditAction = "auth.oauth.link";
      }
    }

    if (!dbUser) {
      // 3) Fresh signup
      const finalDisplayName = await this.pickUniqueDisplayName(displayName, email);
      const created = await this.deps.mysql.$transaction(
        async (tx: MysqlPrisma.Prisma.TransactionClient) => {
          // Re-check email + displayName under the transaction to handle races.
          const dupEmail = await tx.user.findUnique({ where: { email }, select: { id: true } });
          if (dupEmail) {
            throw AppError.conflict("Email is already registered", { field: "email" });
          }
          const dupName = await tx.profile.findUnique({
            where: { displayName: finalDisplayName },
            select: { userId: true },
          });
          if (dupName) {
            // Extremely unlikely after pickUniqueDisplayName — bail with a
            // generic conflict so the client can retry.
            throw AppError.conflict("Display name collision; please retry", { field: "displayName" });
          }
          return tx.user.create({
            data: {
              email,
              passwordHash: null,
              oauthProvider: provider,
              oauthSubject: providerSubject,
              emailVerifiedAt: emailVerified ? new Date() : null,
              status: "active",
              profile: { create: { displayName: finalDisplayName } },
            },
            select: {
              id: true,
              email: true,
              status: true,
              deletedAt: true,
              oauthProvider: true,
              profile: { select: { displayName: true } },
            },
          });
        },
      );
      dbUser = created;
      auditAction = "auth.oauth.signup";
    }

    if (dbUser.status !== "active") throw AppError.forbidden("Account is not active");
    if (!dbUser.profile) throw AppError.internal("Account is missing its profile");

    const roles = rolesForUser({ id: dbUser.id, status: dbUser.status });
    const tokens = await issueTokenPair(dbUser.id, roles, this.deps.tokenConfig);
    await persistRefresh(this.deps.refreshStore, tokens, dbUser.id);

    if (auditAction !== "auth.oauth.signup") {
      // Track most recent login on returning users only — signup row already
      // sets created_at.
      await this.deps.mysql.user.update({
        where: { id: dbUser.id },
        data: { lastLoginAt: new Date() },
      });
    }

    await audit.write({
      actor: dbUser.id,
      action: auditAction,
      targetType: "user",
      targetId: dbUser.id,
      payload: { provider, providerSubject },
      ip,
      userAgent,
    });

    return {
      user: {
        id: dbUser.id.toString(),
        email: dbUser.email,
        displayName: dbUser.profile.displayName,
        roles,
        oauthProvider: provider,
      },
      tokens,
    };
  }

  /** Pick a display name unique across `profiles.display_name`. */
  private async pickUniqueDisplayName(hint: string | null, email: string): Promise<string> {
    const local = email.split("@")[0] ?? "player";
    const sanitize = (raw: string): string => {
      // Allowed by displayNameSchema: letters, digits, spaces, _ and -.
      const trimmed = raw.normalize("NFKC").trim();
      const cleaned = trimmed.replace(/[^\p{L}\p{N}_\- ]/gu, "");
      return cleaned.slice(0, 28).trim() || "player";
    };
    const base = sanitize(hint ?? local);
    // Try base, then base_2, base_3, ... up to ~100 attempts. After that
    // append a random 6-digit tail.
    for (let i = 0; i < 100; i++) {
      const candidate = i === 0 ? base : `${base.slice(0, 26)}_${i + 1}`;
      const dup = await this.deps.mysql.profile.findUnique({
        where: { displayName: candidate },
        select: { userId: true },
      });
      if (!dup) return candidate;
    }
    const tail = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0");
    return `${base.slice(0, 22)}_${tail}`;
  }

  // ── Password reset ────────────────────────────────────────────────

  /**
   * Mint a password-reset token and email it to the user. Always resolves
   * to `{ ok: true }` regardless of whether the email exists, so attackers
   * can't enumerate the user table. The actual token / email is only
   * generated for accounts that exist + are active + have a password.
   */
  async requestPasswordReset(input: RequestPasswordResetInput): Promise<{ ok: true }> {
    const { oneShotStore, mailer, cfg } = this.resolvePasswordResetDeps();
    const email = input.email.trim().toLowerCase();
    const user = await this.deps.mysql.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, deletedAt: true, passwordHash: true },
    });

    // Same-shape response on miss / inactive / oauth-only — no enumeration.
    if (!user) return { ok: true };
    if (user.deletedAt !== null || user.status !== "active" || !user.passwordHash) {
      return { ok: true };
    }

    const ttlSec = cfg.ttlSeconds ?? 60 * 60;
    const token = generateOneShotToken();
    await oneShotStore.put(token, {
      userId: user.id,
      purpose: "password_reset",
      expiresAt: Date.now() + ttlSec * 1000,
    });

    const link = appendTokenQuery(cfg.redirectUrl, token);
    await mailer.send({
      to: user.email,
      subject: "Reset your Aetheria password",
      text:
        `We received a request to reset your password.\n\n` +
        `Open this link to set a new password (expires in ${Math.round(ttlSec / 60)} min):\n\n${link}\n\n` +
        `If you didn't request this, you can ignore this email — your password won't change.`,
    });

    await audit.write({
      actor: user.id,
      action: "auth.password_reset.request",
      targetType: "user",
      targetId: user.id,
      payload: { email: user.email },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { ok: true };
  }

  /**
   * Consume a password-reset token: hash + persist the new password,
   * revoke every refresh-token jti for the user (logging them out
   * everywhere), and clear `lastLoginAt` so the next login is treated
   * as "fresh" by downstream telemetry.
   */
  async confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<{ ok: true }> {
    const { oneShotStore } = this.resolvePasswordResetDeps();
    const record = await oneShotStore.take("password_reset", input.token);
    if (!record) throw AppError.unauthenticated("Reset token invalid or expired");

    const passwordHash = await hashPassword(input.newPassword);
    const updated = await this.deps.mysql.user.update({
      where: { id: record.userId },
      data: { passwordHash },
      select: { id: true, email: true, deletedAt: true, status: true },
    });
    if (updated.deletedAt !== null || updated.status !== "active") {
      throw AppError.forbidden("Account is not active");
    }

    await this.deps.refreshStore.revokeAllForUser(record.userId);

    await audit.write({
      actor: record.userId,
      action: "auth.password_reset.confirm",
      targetType: "user",
      targetId: record.userId,
      payload: {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { ok: true };
  }

  // ── Email verification ────────────────────────────────────────────

  /**
   * Mint an email-verification token for the *currently authenticated*
   * user and email it. Idempotent: caller can retry if the user lost the
   * email — each retry mints a fresh token (the previous one stays valid
   * until its TTL expires, but a successful confirm with the new token
   * doesn't invalidate the old token automatically — `take` only removes
   * the one used).
   */
  async requestEmailVerification(input: RequestEmailVerificationInput): Promise<{ ok: true }> {
    const { oneShotStore, mailer, cfg } = this.resolveEmailVerificationDeps();
    const user = await this.deps.mysql.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        status: true,
        deletedAt: true,
        emailVerifiedAt: true,
      },
    });
    if (!user) throw AppError.notFound("user", input.userId);
    if (user.deletedAt !== null || user.status !== "active") {
      throw AppError.forbidden("Account is not active");
    }
    if (user.emailVerifiedAt !== null) {
      // Already verified — pretend we sent something; client UX stays simple.
      return { ok: true };
    }

    const ttlSec = cfg.ttlSeconds ?? 24 * 60 * 60;
    const token = generateOneShotToken();
    await oneShotStore.put(token, {
      userId: user.id,
      purpose: "email_verification",
      expiresAt: Date.now() + ttlSec * 1000,
      meta: { email: user.email },
    });

    const link = appendTokenQuery(cfg.redirectUrl, token);
    await mailer.send({
      to: user.email,
      subject: "Verify your Aetheria email",
      text:
        `Welcome! Click the link below to verify this email address ` +
        `(expires in ${Math.round(ttlSec / 3600)} h):\n\n${link}\n\n` +
        `If you didn't sign up for Aetheria, you can safely ignore this email.`,
    });

    await audit.write({
      actor: user.id,
      action: "auth.email_verification.request",
      targetType: "user",
      targetId: user.id,
      payload: { email: user.email },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { ok: true };
  }

  /** Consume an email-verification token; sets `email_verified_at`. */
  async confirmEmailVerification(input: ConfirmEmailVerificationInput): Promise<{ ok: true }> {
    const { oneShotStore } = this.resolveEmailVerificationDeps();
    const record = await oneShotStore.take("email_verification", input.token);
    if (!record) throw AppError.unauthenticated("Verification token invalid or expired");

    await this.deps.mysql.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });

    await audit.write({
      actor: record.userId,
      action: "auth.email_verification.confirm",
      targetType: "user",
      targetId: record.userId,
      payload: {},
    });

    return { ok: true };
  }

  // ── Internal config guards ────────────────────────────────────────

  private resolvePasswordResetDeps(): {
    oneShotStore: OneShotTokenStore;
    mailer: Mailer;
    cfg: PasswordResetConfig;
  } {
    const { oneShotStore, mailer, passwordReset } = this.deps;
    if (!oneShotStore || !mailer || !passwordReset) {
      throw AppError.notImplemented("password reset");
    }
    return { oneShotStore, mailer, cfg: passwordReset };
  }

  private resolveEmailVerificationDeps(): {
    oneShotStore: OneShotTokenStore;
    mailer: Mailer;
    cfg: EmailVerificationConfig;
  } {
    const { oneShotStore, mailer, emailVerification } = this.deps;
    if (!oneShotStore || !mailer || !emailVerification) {
      throw AppError.notImplemented("email verification");
    }
    return { oneShotStore, mailer, cfg: emailVerification };
  }
}

const appendTokenQuery = (base: string, token: string): string => {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
};
