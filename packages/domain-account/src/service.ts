// Aetheria — AccountService.
//
// Owns the post-auth account lifecycle:
//   - getProfile        (read everything the user can see about their own row)
//   - updateProfile     (displayName / avatar / country / language / prefs)
//   - deleteAccount     (GDPR-compliant: status=deleted, PII scrubbed,
//                        sessions revoked)
//   - bootstrapLocal    (open / migrate the user's per-player SQLite file
//                        and seed `local_profile` from the server profile)
//
// AccountService re-uses the same `AuthMysqlClient` shape as AuthService
// plus a `RefreshTokenStore` reference (so deleteAccount can revoke all
// active refresh tokens for the user).

import { audit } from "@aetheria/core";
import { verifyPassword } from "@aetheria/domain-auth";
import type {
  AuthMysqlClient,
  RefreshTokenStore,
  OAuthProvider,
} from "@aetheria/domain-auth";
import { AppError } from "@aetheria/schema-api";
import type { MysqlPrisma } from "@aetheria/schema-db/mysql";
import {
  applyInitSchema,
  sqliteFor,
  sqlitePathFor,
} from "@aetheria/schema-db";

export interface AccountDeps {
  readonly mysql: AuthMysqlClient;
  readonly refreshStore: RefreshTokenStore;
}

export interface ProfileResult {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly emailVerifiedAt: Date | null;
    readonly oauthProvider: OAuthProvider | null;
    readonly status: string;
    readonly createdAt: Date;
    readonly lastLoginAt: Date | null;
  };
  readonly profile: {
    readonly displayName: string;
    readonly avatarUrl: string | null;
    readonly country: string | null;
    readonly language: string | null;
    readonly accountLevel: number;
    readonly accountXp: number;
    readonly preferences: Readonly<Record<string, unknown>>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
}

export interface UpdateProfileInput {
  readonly userId: bigint;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly country?: string | null;
  readonly language?: string | null;
  readonly preferences?: Readonly<Record<string, unknown>>;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface DeleteAccountInput {
  readonly userId: bigint;
  /**
   * Free-form confirmation text the user typed; must equal `DELETE` or
   * the user's email (case-insensitive). Enforced server-side as a
   * second-look guard against accidental clicks.
   */
  readonly confirmText: string;
  /**
   * Required for accounts that have a password set. OAuth-only accounts
   * skip this — they're already authenticated via the access token.
   */
  readonly currentPassword?: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface BootstrapLocalResult {
  readonly ok: true;
  /** Absolute path of the per-player SQLite file. */
  readonly sqlitePath: string;
  /** Local profile row (mirror of the server profile + last_login_at = now). */
  readonly localProfile: {
    readonly remoteUserId: string;
    readonly displayName: string;
    readonly email: string;
    readonly accountLevel: number;
    readonly accountXp: number;
    readonly lastLoginAt: string;
  };
}

export class AccountService {
  constructor(private readonly deps: AccountDeps) {}

  async getProfile(userId: bigint): Promise<ProfileResult> {
    const row = await this.deps.mysql.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        oauthProvider: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        lastLoginAt: true,
        profile: {
          select: {
            displayName: true,
            avatarUrl: true,
            country: true,
            language: true,
            accountLevel: true,
            accountXp: true,
            preferences: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!row) throw AppError.notFound("user", userId);
    if (row.deletedAt !== null) throw AppError.notFound("user", userId);
    if (!row.profile) throw AppError.internal("Account is missing its profile");

    return {
      user: {
        id: row.id.toString(),
        email: row.email,
        emailVerifiedAt: row.emailVerifiedAt,
        oauthProvider: (row.oauthProvider as OAuthProvider | null) ?? null,
        status: row.status,
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
      },
      profile: {
        displayName: row.profile.displayName,
        avatarUrl: row.profile.avatarUrl,
        country: row.profile.country,
        language: row.profile.language,
        accountLevel: row.profile.accountLevel,
        accountXp: row.profile.accountXp,
        preferences: prefsAsObject(row.profile.preferences),
        createdAt: row.profile.createdAt,
        updatedAt: row.profile.updatedAt,
      },
    };
  }

  async updateProfile(input: UpdateProfileInput): Promise<ProfileResult> {
    if (
      input.displayName === undefined &&
      input.avatarUrl === undefined &&
      input.country === undefined &&
      input.language === undefined &&
      input.preferences === undefined
    ) {
      // Empty patch — return current state. Saves a write + matches PATCH
      // semantics of "no fields, no change".
      return this.getProfile(input.userId);
    }

    // Verify the account exists + isn't deleted before doing the write —
    // gives a clean NOT_FOUND rather than a Prisma constraint failure.
    const exists = await this.deps.mysql.user.findUnique({
      where: { id: input.userId },
      select: { id: true, deletedAt: true, status: true },
    });
    if (!exists) throw AppError.notFound("user", input.userId);
    if (exists.deletedAt !== null) throw AppError.notFound("user", input.userId);
    if (exists.status !== "active") throw AppError.forbidden("Account is not active");

    if (input.displayName !== undefined) {
      const dup = await this.deps.mysql.profile.findUnique({
        where: { displayName: input.displayName },
        select: { userId: true },
      });
      if (dup && dup.userId !== input.userId) {
        throw AppError.conflict("Display name is already taken", { field: "displayName" });
      }
    }

    const patch: MysqlPrisma.Prisma.ProfileUpdateInput = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
    if (input.country !== undefined) patch.country = input.country;
    if (input.language !== undefined) patch.language = input.language;
    if (input.preferences !== undefined) {
      patch.preferences = input.preferences as MysqlPrisma.Prisma.InputJsonValue;
    }

    const updatedProfile = await this.deps.mysql.profile.update({
      where: { userId: input.userId },
      data: patch,
      select: {
        displayName: true,
        avatarUrl: true,
        country: true,
        language: true,
        accountLevel: true,
        accountXp: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await audit.write({
      actor: input.userId,
      action: "account.profile.update",
      targetType: "user",
      targetId: input.userId,
      payload: {
        fields: Object.keys(patch),
      },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    // Read user + profile separately but avoid double-read of profile via
    // getProfile(): we already have the updated profile from the update().
    const user = await this.deps.mysql.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        oauthProvider: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw AppError.internal("User vanished after update");
    if (user.deletedAt !== null) throw AppError.internal("User was deleted after update");

    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        oauthProvider: (user.oauthProvider as OAuthProvider | null) ?? null,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      profile: {
        displayName: updatedProfile.displayName,
        avatarUrl: updatedProfile.avatarUrl,
        country: updatedProfile.country,
        language: updatedProfile.language,
        accountLevel: updatedProfile.accountLevel,
        accountXp: updatedProfile.accountXp,
        preferences: prefsAsObject(updatedProfile.preferences),
        createdAt: updatedProfile.createdAt,
        updatedAt: updatedProfile.updatedAt,
      },
    };
  }

  /**
   * GDPR-compliant account deletion:
   *   - User.status = "deleted", deletedAt = now()
   *   - Email + passwordHash + oauth bindings scrubbed (preserves the row
   *     for foreign-key targets like guild_members.user_id, audit_log.actor_user_id,
   *     pvp_matches references — but anonymizes the PII).
   *   - Profile.displayName replaced with `deleted_{id}` (still unique).
   *   - All optional profile fields cleared.
   *   - All refresh tokens revoked → every active session dies.
   *
   * Hard-delete is intentionally NOT performed: too many tables FK to user.id.
   * A separate offline job can purge `users.deletedAt < now() - 30d` rows.
   */
  async deleteAccount(input: DeleteAccountInput): Promise<{ ok: true }> {
    const row = await this.deps.mysql.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!row) throw AppError.notFound("user", input.userId);
    if (row.deletedAt !== null) throw AppError.notFound("user", input.userId);
    if (row.status !== "active") throw AppError.forbidden("Account is not active");

    const confirm = input.confirmText.trim().toLowerCase();
    const expected = ["delete", row.email.toLowerCase()];
    if (!expected.includes(confirm)) {
      throw AppError.badRequest("Confirmation text does not match", { field: "confirmText" });
    }

    if (row.passwordHash) {
      if (!input.currentPassword) {
        throw AppError.badRequest("Current password required", { field: "currentPassword" });
      }
      const ok = await verifyPassword(input.currentPassword, row.passwordHash);
      if (!ok) throw AppError.unauthenticated("Invalid password");
    }

    const anonymizedEmail = `deleted-${row.id.toString()}@aetheria.invalid`;
    const anonymizedDisplayName = `deleted_${row.id.toString()}`;
    const now = new Date();

    await this.deps.mysql.$transaction(
      async (tx: MysqlPrisma.Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            status: "deleted",
            deletedAt: now,
            email: anonymizedEmail,
            passwordHash: null,
            oauthProvider: null,
            oauthSubject: null,
            emailVerifiedAt: null,
          },
        });
        await tx.profile.update({
          where: { userId: input.userId },
          data: {
            displayName: anonymizedDisplayName,
            avatarUrl: null,
            country: null,
            language: null,
            preferences: {},
          },
        });
      },
    );

    await this.deps.refreshStore.revokeAllForUser(input.userId);

    await audit.write({
      actor: input.userId,
      action: "account.delete",
      targetType: "user",
      targetId: input.userId,
      payload: { method: row.passwordHash ? "password" : "session" },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { ok: true };
  }

  /**
   * Open / create the user's per-player SQLite file, run the schema, and
   * upsert `local_profile` (singleton) from the canonical MySQL profile.
   * Idempotent — safe to call on every login. The web client is expected
   * to call this right after `auth.loginWithEmail` / `auth.refreshToken`.
   */
  async bootstrapLocal(userId: bigint): Promise<BootstrapLocalResult> {
    const profile = await this.getProfile(userId);

    const db = await sqliteFor(userId);
    await applyInitSchema(db);

    const remoteUserId = BigInt(profile.user.id);
    const lastLoginAtIso = (profile.user.lastLoginAt ?? new Date()).toISOString();

    // Use a parameterised raw upsert — the Prisma model would be defined
    // in prisma/sqlite/schema.prisma but the migration table-name is
    // `local_profile`. Hand-rolled SQL keeps this independent of the
    // generated client's shape (which currently has no `localProfile`
    // model exposed).
    await db.$executeRawUnsafe(
      `INSERT INTO local_profile (
         id, remote_user_id, email, display_name, avatar_url, country, language,
         account_level, account_xp, preferences, last_login_at, updated_at
       ) VALUES (
         1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')
       )
       ON CONFLICT(id) DO UPDATE SET
         remote_user_id = excluded.remote_user_id,
         email          = excluded.email,
         display_name   = excluded.display_name,
         avatar_url     = excluded.avatar_url,
         country        = excluded.country,
         language       = excluded.language,
         account_level  = excluded.account_level,
         account_xp     = excluded.account_xp,
         preferences    = excluded.preferences,
         last_login_at  = excluded.last_login_at,
         updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now');`,
      remoteUserId,
      profile.user.email,
      profile.profile.displayName,
      profile.profile.avatarUrl,
      profile.profile.country,
      profile.profile.language,
      profile.profile.accountLevel,
      profile.profile.accountXp,
      JSON.stringify(profile.profile.preferences),
      lastLoginAtIso,
    );

    await audit.write({
      actor: userId,
      action: "account.local.bootstrap",
      targetType: "user",
      targetId: userId,
      payload: {},
    });

    return {
      ok: true,
      sqlitePath: sqlitePathFor(userId),
      localProfile: {
        remoteUserId: profile.user.id,
        displayName: profile.profile.displayName,
        email: profile.user.email,
        accountLevel: profile.profile.accountLevel,
        accountXp: profile.profile.accountXp,
        lastLoginAt: lastLoginAtIso,
      },
    };
  }
}

const prefsAsObject = (raw: unknown): Readonly<Record<string, unknown>> => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Readonly<Record<string, unknown>>;
};
