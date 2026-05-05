// Aetheria — BattlePassService.
//
// Three responsibilities:
//
// 1. **Read** — `currentSeason()` / `progress(userId)` join the active
//    `BattlePassSeason` row with `BattlePassProgress`, returning a
//    catalog DTO + the user's XP / tier / claimed-tier / premium flag.
//
// 2. **Accrue** — `start()` subscribes to the in-process event bus and
//    adds BP XP to the active season's progress row per `eventXpDelta`.
//    Idempotency is best-effort (events already carry an `id` so a
//    future de-dupe table can latch on); the curve clamps so a flood
//    of replayed events still tops out at MAX_TIER.
//
// 3. **Claim** — atomically advances `claimedTier` (modeled as the
//    `tier` column) by exactly +1 while granting the free reward and
//    (when `premium` is true) the premium reward for that tier. XP
//    rewards delegate to `progression-runtime.applyAccountXp`; item
//    rewards write `Inventory` directly. A row-level CAS makes
//    concurrent claims safe.

import { audit } from "@aetheria/core";
import {
  events as defaultEventBus,
  type AnyDomainEventHandler,
  type DomainEvent,
  type EventBus,
  type Unsubscribe,
} from "@aetheria/domain-events";
import { applyAccountXp } from "@aetheria/progression-runtime";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

import {
  evaluateClaim,
  eventXpDelta,
  maxTier,
  parseTracks,
  tierFromXp,
} from "./rules.js";
import type {
  BattlePassReward,
  BattlePassSeasonCatalog,
  ClaimInput,
  ClaimResult,
  CurrentSeasonInput,
  CurrentSeasonResult,
  ProgressInput,
  ProgressResult,
} from "./types.js";

export type BattlePassMysqlClient = Pick<
  MysqlClient,
  | "battlePassSeason"
  | "battlePassProgress"
  | "inventory"
  | "item"
  | "profile"
  | "$transaction"
>;

export interface BattlePassDeps {
  readonly mysql: BattlePassMysqlClient;
  /** Defaults to the module-level singleton. Tests inject a fresh bus. */
  readonly bus?: EventBus;
}

const buildCatalog = (row: {
  id: bigint;
  name: string;
  startsAt: Date;
  endsAt: Date;
  tracks: unknown;
}): BattlePassSeasonCatalog => {
  const tracks = parseTracks(row.tracks);
  return {
    seasonId: row.id.toString(),
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    tracks,
    maxTier: maxTier(tracks),
  };
};

export class BattlePassService {
  private readonly bus: EventBus;

  constructor(private readonly deps: BattlePassDeps) {
    this.bus = deps.bus ?? defaultEventBus;
  }

  // ── Read ──────────────────────────────────────────────────────────

  async currentSeason(input: CurrentSeasonInput = {}): Promise<CurrentSeasonResult> {
    const now = input.now ?? new Date();
    const row = await this.deps.mysql.battlePassSeason.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { startsAt: "desc" },
    });
    return { season: row ? buildCatalog(row) : null };
  }

  async progress(input: ProgressInput): Promise<ProgressResult> {
    const now = input.now ?? new Date();
    const row = await this.deps.mysql.battlePassSeason.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { startsAt: "desc" },
    });
    if (!row) return { season: null };
    const season = buildCatalog(row);
    const progress = await this.deps.mysql.battlePassProgress.findUnique({
      where: { userId_seasonId: { userId: input.userId, seasonId: row.id } },
    });
    const xp = progress?.xp ?? 0;
    return {
      season,
      state: {
        seasonId: season.seasonId,
        xp,
        currentTier: tierFromXp(xp),
        claimedTier: progress?.tier ?? 0,
        premium: progress?.premium ?? false,
      },
    };
  }

  // ── Accrue (event-driven) ─────────────────────────────────────────

  start(): Unsubscribe[] {
    const handler: AnyDomainEventHandler = async (event) => {
      await this.accrue(event);
    };
    return [
      this.bus.subscribe("EnemyDefeated", handler),
      this.bus.subscribe("ItemCrafted", handler),
      this.bus.subscribe("LevelCompleted", handler),
      this.bus.subscribe("LeveledUp", handler),
      this.bus.subscribe("RunFinished", handler),
    ];
  }

  /**
   * Add BP XP for one event. Public so tests can drive it without going
   * through the bus. No-op when no season is active or the delta is 0.
   */
  async accrue(event: DomainEvent): Promise<void> {
    const delta = eventXpDelta(event);
    if (delta <= 0) return;

    const now = event.occurredAt;
    const season = await this.deps.mysql.battlePassSeason.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { startsAt: "desc" },
      select: { id: true },
    });
    if (!season) return;

    const userId = BigInt(event.userId);
    await this.deps.mysql.battlePassProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      create: {
        userId,
        seasonId: season.id,
        xp: delta,
        tier: 0,
        premium: false,
      },
      update: { xp: { increment: delta } },
    });
  }

  // ── Claim ─────────────────────────────────────────────────────────

  async claim(input: ClaimInput): Promise<ClaimResult> {
    const { userId, seasonId, tier } = input;

    const seasonRow = await this.deps.mysql.battlePassSeason.findUnique({
      where: { id: seasonId },
      select: { id: true, name: true, startsAt: true, endsAt: true, tracks: true },
    });
    if (!seasonRow) throw AppError.notFound("battlePassSeason", seasonId);
    const season = buildCatalog(seasonRow);

    const result = await this.deps.mysql.$transaction(
      async (tx: MysqlPrisma.Prisma.TransactionClient) => {
        const progress = await tx.battlePassProgress.findUnique({
          where: { userId_seasonId: { userId, seasonId } },
          select: { xp: true, tier: true, premium: true },
        });
        const state = {
          xp: progress?.xp ?? 0,
          claimedTier: progress?.tier ?? 0,
          premium: progress?.premium ?? false,
        };

        const eligibility = evaluateClaim(season.tracks, tier, state);
        if (!eligibility.ok || !eligibility.rewards) {
          throw mapClaimReason(eligibility.reason, tier);
        }

        // Atomic CAS — require the row to still be at `claimedTier`.
        // updateMany w/ matching `tier` so a concurrent claim on the
        // same row can't double-grant.
        if (progress) {
          const updated = await tx.battlePassProgress.updateMany({
            where: { userId, seasonId, tier: state.claimedTier },
            data: { tier: tier },
          });
          if (updated.count !== 1) {
            throw AppError.conflict("Battle pass tier already claimed");
          }
        } else {
          // First-ever claim creates the row at the new tier.
          await tx.battlePassProgress.create({
            data: { userId, seasonId, xp: 0, tier, premium: false },
          });
        }

        const granted: BattlePassReward[] = [];
        const leveledUp: {
          from: number;
          to: number;
          milestoneIds: string[];
        }[] = [];

        for (const reward of eligibility.rewards) {
          if (reward.kind === "item") {
            const itemId = BigInt(reward.itemId);
            const item = await tx.item.findUnique({
              where: { id: itemId },
              select: { id: true, maxStack: true },
            });
            if (!item) throw AppError.notFound("item", itemId);
            const existing = await tx.inventory.findUnique({
              where: { userId_itemId: { userId, itemId } },
              select: { id: true, quantity: true },
            });
            const next = (existing?.quantity ?? 0) + reward.quantity;
            if (next > item.maxStack) {
              throw AppError.conflict("Reward would overflow inventory stack", {
                maxStack: item.maxStack,
                current: existing?.quantity ?? 0,
                requested: reward.quantity,
              });
            }
            if (existing) {
              await tx.inventory.update({
                where: { id: existing.id },
                data: { quantity: next },
              });
            } else {
              await tx.inventory.create({
                data: { userId, itemId, quantity: reward.quantity },
              });
            }
            granted.push({ kind: "item", itemId: reward.itemId, quantity: reward.quantity });
          } else {
            const xpResult = await applyAccountXp(tx, userId, reward.amount);
            for (const ev of xpResult.leveledUp) {
              leveledUp.push({
                from: ev.from,
                to: ev.to,
                milestoneIds: [...ev.milestoneIds],
              });
            }
            granted.push({ kind: "xp", amount: reward.amount });
          }
        }

        return { granted, leveledUp };
      },
    );

    await audit.write({
      actor: userId,
      action: "battlepass.claim",
      targetType: "battlePassSeason",
      targetId: seasonId,
      payload: { tier, rewards: result.granted },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    for (const ev of result.leveledUp) {
      await this.bus.emit("LeveledUp", {
        userId: userId.toString(),
        from: ev.from,
        to: ev.to,
        milestoneIds: [...ev.milestoneIds],
      });
    }

    return {
      seasonId: seasonId.toString(),
      tier,
      granted: result.granted,
      leveledUp: result.leveledUp,
    };
  }
}

const mapClaimReason = (
  reason: string | undefined,
  tier: number,
): AppError => {
  switch (reason) {
    case "tier_out_of_range":
      return AppError.badRequest("Battle pass tier out of range", { tier });
    case "tier_locked":
      return AppError.invalidAction("Battle pass tier not yet unlocked", { tier });
    case "already_claimed":
      return AppError.alreadyClaimed("battlePassTier");
    case "must_claim_in_order":
      return AppError.badRequest("Battle pass tiers must be claimed in order", { tier });
    case "no_reward":
      return AppError.notFound("battlePassReward", tier);
    default:
      return AppError.badRequest("Battle pass claim rejected");
  }
};
