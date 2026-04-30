// Aetheria — AuthService.
//
// Owns the four auth flows:
//   - signupWithEmail   (creates user + profile, issues tokens)
//   - loginWithEmail    (verifies password, issues tokens)
//   - refreshToken      (rotates: validates+revokes old jti, issues new pair)
//   - logout            (revokes the supplied refresh jti)
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

/** Subset of MySQL Prisma we actually call. Lets tests stub easily. */
export type AuthMysqlClient = Pick<MysqlClient, "user" | "profile" | "$transaction">;

export interface AuthDeps {
  readonly mysql: AuthMysqlClient;
  readonly refreshStore: RefreshTokenStore;
  readonly tokenConfig: TokenConfig;
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

export interface RefreshInput {
  readonly refreshToken: string;
}

export interface LogoutInput {
  readonly refreshToken: string;
}

export interface AuthSessionResult {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly string[];
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
}
