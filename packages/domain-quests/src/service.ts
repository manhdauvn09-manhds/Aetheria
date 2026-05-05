// Aetheria — QuestService.
//
// Three responsibilities:
//
// 1. **Read** — `dailyForUser` / `weeklyForUser` join active Quest catalog
//    rows with the per-user UserQuest progress and decorate them with the
//    parsed requirement + completion flag.
//
// 2. **Progress** — `start()` subscribes to the in-process event bus.
//    Each matched event updates `UserQuest.progress` (upserting the row
//    if absent) and auto-promotes status to `completed` when the
//    requirement is satisfied. Idempotent: re-applying a stale event
//    can never decrement a counter (rules clamp at the target).
//
// 3. **Claim** — atomically transitions `completed` → `claimed`, then
//    distributes rewards: items via direct Prisma upserts (server-side
//    grant), XP via `domain-progression.addXp` against `Profile.accountXp`.
//    Each level crossed emits a `LeveledUp` event so listeners (battle
//    pass, milestone unlocks) react in the same request.

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
  applyEventToProgress,
  eventMatchesRequirement,
  isRequirementComplete,
  parseProgress,
  parseRequirement,
  parseRewards,
} from "./rules.js";
import type {
  QuestCatalog,
  QuestClaimInput,
  QuestClaimResult,
  QuestEntry,
  QuestKind,
  QuestListInput,
  QuestListResult,
  QuestRequirement,
  QuestStatus,
} from "./types.js";

/**
 * Subset of the Prisma client this service touches. Narrowing the
 * dependency keeps unit tests easy to mock and prevents accidental
 * coupling to unrelated tables.
 */
export type QuestsMysqlClient = Pick<
  MysqlClient,
  "quest" | "userQuest" | "inventory" | "item" | "profile" | "$transaction"
>;

export interface QuestsDeps {
  readonly mysql: QuestsMysqlClient;
  /** Defaults to the module-level singleton. Tests inject a fresh bus. */
  readonly bus?: EventBus;
}

const toQuestKind = (raw: string): QuestKind => {
  if (raw === "weekly" || raw === "seasonal" || raw === "story") return raw;
  return "daily";
};

const toQuestStatus = (raw: string): QuestStatus => {
  if (raw === "completed" || raw === "claimed") return raw;
  return "active";
};

export class QuestService {
  private readonly bus: EventBus;

  constructor(private readonly deps: QuestsDeps) {
    this.bus = deps.bus ?? defaultEventBus;
  }

  // ── Read ──────────────────────────────────────────────────────────

  async dailyForUser(input: QuestListInput): Promise<QuestListResult> {
    return this.listForKind(input, "daily");
  }

  async weeklyForUser(input: QuestListInput): Promise<QuestListResult> {
    return this.listForKind(input, "weekly");
  }

  private async listForKind(
    input: QuestListInput,
    kind: QuestKind,
  ): Promise<QuestListResult> {
    const now = input.now ?? new Date();
    const quests = await this.deps.mysql.quest.findMany({
      where: {
        type: kind,
        activeFrom: { lte: now },
        activeTo: { gt: now },
      },
      orderBy: { id: "asc" },
    });
    if (quests.length === 0) return { entries: [] };

    const userQuests = await this.deps.mysql.userQuest.findMany({
      where: {
        userId: input.userId,
        questId: { in: quests.map((q) => q.id) },
      },
    });
    const userQuestById = new Map(
      userQuests.map((u) => [u.questId.toString(), u]),
    );

    const entries: QuestEntry[] = [];
    for (const q of quests) {
      const requirement = parseRequirement(q.requirements);
      if (!requirement) continue; // skip malformed catalog rows
      const catalog: QuestCatalog = {
        questId: q.id.toString(),
        type: toQuestKind(q.type),
        requirement,
        rewards: parseRewards(q.rewards),
        activeFrom: q.activeFrom,
        activeTo: q.activeTo,
      };
      const uq = userQuestById.get(q.id.toString());
      const progress = parseProgress(uq?.progress ?? null);
      const status = toQuestStatus(uq?.status ?? "active");
      const isComplete = isRequirementComplete(requirement, progress);
      entries.push({
        quest: catalog,
        progress,
        status,
        claimedAt: uq?.claimedAt ?? null,
        isComplete,
      });
    }
    return { entries };
  }

  // ── Progress (event-driven) ───────────────────────────────────────

  /**
   * Subscribe to the bus. Returns one `Unsubscribe` per event type so
   * callers can tear down individual listeners; in practice apps/api
   * accumulates all of them and runs them on `onClose`.
   */
  start(): Unsubscribe[] {
    const handler: AnyDomainEventHandler = async (event) => {
      await this.progress(event);
    };
    return [
      this.bus.subscribe("ItemCrafted", handler),
      this.bus.subscribe("EnemyDefeated", handler),
      this.bus.subscribe("LevelCompleted", handler),
      this.bus.subscribe("LeveledUp", handler),
      this.bus.subscribe("RunFinished", handler),
    ];
  }

  /**
   * Apply one event to every active quest the user might be progressing.
   * Public so tests can drive it without going through the bus.
   */
  async progress(event: DomainEvent): Promise<void> {
    const userId = BigInt(event.userId);
    const now = event.occurredAt;
    const candidates = await this.deps.mysql.quest.findMany({
      where: {
        activeFrom: { lte: now },
        activeTo: { gt: now },
      },
      select: { id: true, requirements: true },
    });
    if (candidates.length === 0) return;

    const matches: { questId: bigint; requirement: QuestRequirement }[] = [];
    for (const q of candidates) {
      const req = parseRequirement(q.requirements);
      if (!req) continue;
      if (eventMatchesRequirement(req, event)) {
        matches.push({ questId: q.id, requirement: req });
      }
    }
    if (matches.length === 0) return;

    const existing = await this.deps.mysql.userQuest.findMany({
      where: {
        userId,
        questId: { in: matches.map((m) => m.questId) },
      },
    });
    const existingById = new Map(
      existing.map((u) => [u.questId.toString(), u]),
    );

    for (const { questId, requirement } of matches) {
      const uq = existingById.get(questId.toString());
      if (uq?.status === "claimed") continue; // terminal — don't re-progress
      const currentProgress = parseProgress(uq?.progress ?? null);
      const nextProgress = applyEventToProgress(requirement, currentProgress, event);
      if (nextProgress.count === currentProgress.count) continue; // event didn't move the needle
      const nowComplete = isRequirementComplete(requirement, nextProgress);
      const nextStatus: QuestStatus = nowComplete
        ? "completed"
        : (uq?.status as QuestStatus | undefined) === "completed"
          ? "completed"
          : "active";
      const progressJson = nextProgress as unknown as MysqlPrisma.Prisma.InputJsonValue;

      await this.deps.mysql.userQuest.upsert({
        where: { userId_questId: { userId, questId } },
        create: {
          userId,
          questId,
          progress: progressJson,
          status: nextStatus,
        },
        update: {
          progress: progressJson,
          status: nextStatus,
        },
      });
    }
  }

  // ── Claim ─────────────────────────────────────────────────────────

  async claim(input: QuestClaimInput): Promise<QuestClaimResult> {
    const { userId, questId } = input;

    const quest = await this.deps.mysql.quest.findUnique({
      where: { id: questId },
      select: { id: true, rewards: true },
    });
    if (!quest) throw AppError.notFound("quest", questId);
    const rewards = parseRewards(quest.rewards);
    if (rewards.length === 0) {
      throw AppError.badRequest("Quest has no rewards configured");
    }

    const result = await this.deps.mysql.$transaction(
      async (tx: MysqlPrisma.Prisma.TransactionClient) => {
        const uq = await tx.userQuest.findUnique({
          where: { userId_questId: { userId, questId } },
          select: { status: true, progress: true },
        });
        if (!uq) throw AppError.notFound("userQuest", questId);
        if (uq.status === "claimed") {
          throw AppError.conflict("Quest already claimed");
        }
        if (uq.status !== "completed") {
          throw AppError.questNotReady(questId);
        }

        // Atomic conditional update to lock the row.
        const updated = await tx.userQuest.updateMany({
          where: { userId, questId, status: "completed" },
          data: { status: "claimed", claimedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw AppError.conflict("Quest already claimed");
        }

        const granted: {
          kind: "item" | "xp";
          itemId?: string;
          quantity?: number;
          amount?: number;
        }[] = [];
        const leveledUp: {
          from: number;
          to: number;
          milestoneIds: string[];
        }[] = [];

        for (const r of rewards) {
          if (r.kind === "item") {
            const itemId = BigInt(r.itemId);
            const item = await tx.item.findUnique({
              where: { id: itemId },
              select: { id: true, maxStack: true },
            });
            if (!item) {
              throw AppError.notFound("item", itemId);
            }
            const existing = await tx.inventory.findUnique({
              where: { userId_itemId: { userId, itemId } },
              select: { id: true, quantity: true },
            });
            const next = (existing?.quantity ?? 0) + r.quantity;
            if (next > item.maxStack) {
              throw AppError.conflict("Reward would overflow inventory stack", {
                maxStack: item.maxStack,
                current: existing?.quantity ?? 0,
                requested: r.quantity,
              });
            }
            if (existing) {
              await tx.inventory.update({
                where: { id: existing.id },
                data: { quantity: next },
              });
            } else {
              await tx.inventory.create({
                data: { userId, itemId, quantity: r.quantity },
              });
            }
            granted.push({ kind: "item", itemId: r.itemId, quantity: r.quantity });
          } else {
            // xp reward — delegate to the shared runtime helper so combat,
            // battle-pass, and admin grants all share the same pipeline.
            const xpResult = await applyAccountXp(tx, userId, r.amount);
            for (const ev of xpResult.leveledUp) {
              leveledUp.push({
                from: ev.from,
                to: ev.to,
                milestoneIds: [...ev.milestoneIds],
              });
            }
            granted.push({ kind: "xp", amount: r.amount });
          }
        }

        return { granted, leveledUp };
      },
    );

    await audit.write({
      actor: userId,
      action: "quest.claim",
      targetType: "quest",
      targetId: questId,
      payload: {
        rewards: rewards.map((r) =>
          r.kind === "item"
            ? { kind: r.kind, itemId: r.itemId, quantity: r.quantity }
            : { kind: r.kind, amount: r.amount },
        ),
      },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    // Emit level-ups outside the transaction so subscribers (battle pass,
    // milestone notifications) see a committed Profile when they react.
    for (const ev of result.leveledUp) {
      await this.bus.emit("LeveledUp", {
        userId: userId.toString(),
        from: ev.from,
        to: ev.to,
        milestoneIds: [...ev.milestoneIds],
      });
    }

    return {
      questId: questId.toString(),
      granted: result.granted,
      leveledUp: result.leveledUp,
    };
  }
}
