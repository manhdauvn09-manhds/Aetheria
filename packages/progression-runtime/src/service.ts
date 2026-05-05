// Aetheria — account-XP runtime.
//
// Bridges the pure `domain-progression.addXp` engine to the persisted
// `Profile.accountXp` / `Profile.accountLevel` columns and the in-process
// event bus. One canonical place to grant account XP so combat,
// quest-claim, battle-pass, and admin tools all share the same:
//
//   read profile → addXp → write back → emit `LeveledUp` per crossed level
//
// `applyAccountXp` runs **inside** an existing Prisma transaction (so the
// caller can bundle the grant with related mutations and roll them all
// back together). Bus emits and the audit row are deferred to the
// `grantAccountXp` wrapper which owns the transaction itself.

import { audit } from "@aetheria/core";
import {
  events as defaultEventBus,
  type EventBus,
} from "@aetheria/domain-events";
import { addXp, levelFromTotalXp } from "@aetheria/domain-progression";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

/**
 * Single level-up emitted by `applyAccountXp`. `milestoneIds` is plain
 * `string[]` so it lines up with the `LeveledUp` event payload without
 * the caller having to re-map.
 */
export interface AccountLevelUp {
  readonly from: number;
  readonly to: number;
  readonly milestoneIds: readonly string[];
}

export interface ApplyAccountXpResult {
  readonly level: number;
  readonly totalXp: number;
  readonly xpIntoLevel: number;
  readonly overflowXp: number;
  readonly leveledUp: readonly AccountLevelUp[];
}

/** Subset of the Prisma client the helpers touch. */
export type ProgressionMysqlClient = Pick<MysqlClient, "profile" | "$transaction">;

/**
 * Apply an XP grant to a user's `Profile` inside a Prisma transaction.
 *
 * Caller is expected to:
 *   1. own the surrounding `$transaction`,
 *   2. emit the returned `leveledUp` events on the bus **after** the
 *      transaction commits (so subscribers see committed Profile state).
 *
 * Throws `AppError.notFound("user", userId)` if no Profile row exists,
 * and `AppError.badRequest` for non-positive amounts (a no-op grant is
 * almost certainly a bug at the call site — quests, BP, and combat
 * should never reach here with `0`).
 */
export const applyAccountXp = async (
  tx: MysqlPrisma.Prisma.TransactionClient,
  userId: bigint,
  amount: number,
): Promise<ApplyAccountXpResult> => {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw AppError.badRequest("XP amount must be a positive integer", { amount });
  }

  const profile = await tx.profile.findUnique({
    where: { userId },
    select: { accountXp: true },
  });
  if (!profile) throw AppError.notFound("user", userId);

  const { level, xpIntoLevel } = levelFromTotalXp(profile.accountXp);
  const result = addXp(
    { level, xpIntoLevel, totalXp: profile.accountXp },
    amount,
  );

  await tx.profile.update({
    where: { userId },
    data: {
      accountLevel: result.progression.level,
      accountXp: result.progression.totalXp,
    },
  });

  const leveledUp: AccountLevelUp[] = result.events.map((ev) => ({
    from: ev.from,
    to: ev.to,
    milestoneIds: ev.milestones.map((m) => m.id),
  }));

  return {
    level: result.progression.level,
    totalXp: result.progression.totalXp,
    xpIntoLevel: result.progression.xpIntoLevel,
    overflowXp: result.overflowXp,
    leveledUp,
  };
};

export interface GrantAccountXpInput {
  readonly userId: bigint;
  readonly amount: number;
  /** Audit `action` suffix — e.g. "quest", "battlepass", "admin". */
  readonly source: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface GrantAccountXpDeps {
  readonly mysql: ProgressionMysqlClient;
  /** Defaults to the module-level singleton; tests inject a fresh bus. */
  readonly bus?: EventBus;
}

/**
 * Top-level convenience: opens a transaction, applies the grant, writes
 * an `account.xp_grant` audit row, then emits one `LeveledUp` per level
 * crossed **after** commit so subscribers (battle pass, milestones) see
 * the new Profile when they react.
 */
export const grantAccountXp = async (
  deps: GrantAccountXpDeps,
  input: GrantAccountXpInput,
): Promise<ApplyAccountXpResult> => {
  const bus = deps.bus ?? defaultEventBus;
  const result = await deps.mysql.$transaction(
    async (tx: MysqlPrisma.Prisma.TransactionClient) =>
      applyAccountXp(tx, input.userId, input.amount),
  );

  await audit.write({
    actor: input.userId,
    action: "account.xp_grant",
    targetType: "profile",
    targetId: input.userId,
    payload: { amount: input.amount, source: input.source },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  for (const ev of result.leveledUp) {
    await bus.emit("LeveledUp", {
      userId: input.userId.toString(),
      from: ev.from,
      to: ev.to,
      milestoneIds: [...ev.milestoneIds],
    });
  }

  return result;
};
