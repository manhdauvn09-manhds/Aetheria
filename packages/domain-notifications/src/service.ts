// Aetheria — NotificationsService.
//
// Reads + writes the `notifications` MySQL table. `push` is the single
// write entry point; downstream domains (quest claim, level-up, guild
// invite, …) call it directly. Pure read methods are exposed via the
// router for the in-app dropdown.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

import { parsePayload } from "./rules.js";
import type {
  ListInput,
  MarkReadInput,
  NotificationRow,
  PushInput,
} from "./types.js";

export type NotificationsMysqlClient = Pick<MysqlClient, "notification">;

export interface NotificationsDeps {
  readonly mysql: NotificationsMysqlClient;
  readonly clock?: () => Date;
}

const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;

export class NotificationsService {
  private readonly mysql: NotificationsMysqlClient;
  private readonly clock: () => Date;

  constructor(deps: NotificationsDeps) {
    this.mysql = deps.mysql;
    this.clock = deps.clock ?? ((): Date => new Date());
  }

  async list(input: ListInput): Promise<{
    entries: readonly NotificationRow[];
    unreadCount: number;
  }> {
    const limit = Math.min(PAGE_MAX, Math.max(1, input.limit ?? PAGE_DEFAULT));
    const where = input.unreadOnly
      ? { userId: input.userId, readAt: null }
      : { userId: input.userId };
    const [rows, unreadCount] = await Promise.all([
      this.mysql.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.mysql.notification.count({ where: { userId: input.userId, readAt: null } }),
    ]);
    return {
      entries: rows.map((r) => ({
        notificationId: r.id,
        userId: r.userId,
        type: r.type,
        payload: parsePayload(r.payload),
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
      unreadCount,
    };
  }

  async markRead(input: MarkReadInput): Promise<{ updated: number }> {
    if (!input.all && (!input.notificationIds || input.notificationIds.length === 0)) {
      return { updated: 0 };
    }
    const now = this.clock();
    const where = input.all
      ? { userId: input.userId, readAt: null }
      : {
          userId: input.userId,
          id: { in: [...(input.notificationIds ?? [])] },
          readAt: null,
        };
    const result = await this.mysql.notification.updateMany({
      where,
      data: { readAt: now },
    });
    return { updated: result.count };
  }

  async push(input: PushInput): Promise<NotificationRow> {
    if (typeof input.type !== "string" || input.type.length === 0 || input.type.length > 32) {
      throw AppError.badRequest("Notification type must be 1-32 chars");
    }
    const created = await this.mysql.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        // Prisma's JSON column expects InputJsonValue; Record<string, unknown>
        // is compatible at runtime but TS narrows it stricter.
        payload: (input.payload ?? {}) as MysqlPrisma.Prisma.InputJsonValue,
      },
    });

    // System-pushed notifications are auditable so admins can replay
    // who/what enqueued them.
    await audit.write({
      actor: input.userId,
      action: "notify.push",
      targetType: "notification",
      targetId: created.id,
      payload: { type: input.type },
      ip: null,
      userAgent: null,
    });

    return {
      notificationId: created.id,
      userId: created.userId,
      type: created.type,
      payload: parsePayload(created.payload),
      readAt: created.readAt,
      createdAt: created.createdAt,
    };
  }
}
