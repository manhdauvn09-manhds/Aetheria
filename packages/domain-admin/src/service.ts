// Aetheria — AdminService.
//
// All operations write an audit log entry so the trail is complete even
// when the underlying state already reflected the requested change. The
// actor is the calling admin (`adminProcedure` enforces the role
// upstream — this layer just records who did what).

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

import type {
  AuditEntry,
  BanInput,
  FeatureFlagRow,
  FeatureFlagSetInput,
  GrantItemInput,
  ReplayQuery,
  UnbanInput,
} from "./types.js";

export type AdminMysqlClient = Pick<
  MysqlClient,
  "user" | "inventory" | "item" | "featureFlag" | "auditLog"
>;

export interface AdminDeps {
  readonly mysql: AdminMysqlClient;
}

const REPLAY_DEFAULT = 50;
const REPLAY_MAX = 500;

export class AdminService {
  private readonly mysql: AdminMysqlClient;

  constructor(deps: AdminDeps) {
    this.mysql = deps.mysql;
  }

  // ──────────────────────────────────────────────────────────────────
  // User moderation
  // ──────────────────────────────────────────────────────────────────

  async banUser(input: BanInput): Promise<{ status: "banned" }> {
    if (input.reason.trim().length === 0 || input.reason.length > 500) {
      throw AppError.badRequest("Ban reason must be 1-500 chars");
    }
    const target = await this.mysql.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, status: true },
    });
    if (!target) throw AppError.notFound("user", input.targetUserId);

    await this.mysql.user.update({
      where: { id: input.targetUserId },
      data: { status: "banned" },
    });

    await audit.write({
      actor: input.actorUserId,
      action: "admin.banUser",
      targetType: "user",
      targetId: input.targetUserId,
      payload: { reason: input.reason.trim(), priorStatus: target.status },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { status: "banned" };
  }

  async unbanUser(input: UnbanInput): Promise<{ status: "active" }> {
    const target = await this.mysql.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, status: true },
    });
    if (!target) throw AppError.notFound("user", input.targetUserId);

    await this.mysql.user.update({
      where: { id: input.targetUserId },
      data: { status: "active" },
    });

    await audit.write({
      actor: input.actorUserId,
      action: "admin.unbanUser",
      targetType: "user",
      targetId: input.targetUserId,
      payload: { priorStatus: target.status },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { status: "active" };
  }

  // ──────────────────────────────────────────────────────────────────
  // Item grant
  // ──────────────────────────────────────────────────────────────────

  async grantItem(input: GrantItemInput): Promise<{ granted: number; newQuantity: number }> {
    if (input.quantity <= 0) throw AppError.badRequest("Quantity must be positive");

    const item = await this.mysql.item.findUnique({
      where: { id: input.itemId },
      select: { id: true, maxStack: true },
    });
    if (!item) throw AppError.notFound("item", input.itemId);

    const inv = await this.mysql.inventory.findUnique({
      where: { userId_itemId: { userId: input.targetUserId, itemId: input.itemId } },
      select: { id: true, quantity: true },
    });
    const newQty = (inv?.quantity ?? 0) + input.quantity;
    if (newQty > item.maxStack) {
      throw AppError.conflict("Inventory stack overflow", {
        stackCap: item.maxStack,
        would: newQty,
      });
    }

    if (inv) {
      await this.mysql.inventory.update({
        where: { id: inv.id },
        data: { quantity: newQty },
      });
    } else {
      await this.mysql.inventory.create({
        data: {
          userId: input.targetUserId,
          itemId: input.itemId,
          quantity: input.quantity,
        },
      });
    }

    await audit.write({
      actor: input.actorUserId,
      action: "admin.grantItem",
      targetType: "user",
      targetId: input.targetUserId,
      payload: {
        itemId: input.itemId.toString(),
        quantity: input.quantity,
      },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { granted: input.quantity, newQuantity: newQty };
  }

  // ──────────────────────────────────────────────────────────────────
  // Feature flags
  // ──────────────────────────────────────────────────────────────────

  async listFeatureFlags(): Promise<readonly FeatureFlagRow[]> {
    const rows = await this.mysql.featureFlag.findMany({ orderBy: { key: "asc" } });
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt,
    }));
  }

  async setFeatureFlag(input: FeatureFlagSetInput): Promise<FeatureFlagRow> {
    if (input.key.length === 0 || input.key.length > 128) {
      throw AppError.badRequest("Feature flag key must be 1-128 chars");
    }
    const value = (input.value ?? null) as unknown as MysqlPrisma.Prisma.InputJsonValue;
    const row = await this.mysql.featureFlag.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        value,
        updatedBy: input.actorUserId.toString(),
      },
      update: {
        value,
        updatedBy: input.actorUserId.toString(),
      },
    });

    await audit.write({
      actor: input.actorUserId,
      action: "admin.featureFlag.set",
      targetType: "featureFlag",
      targetId: null,
      payload: { key: input.key, value: input.value ?? null },
      ip: null,
      userAgent: null,
    });

    return {
      key: row.key,
      value: row.value,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Audit replay
  // ──────────────────────────────────────────────────────────────────

  async replay(query: ReplayQuery): Promise<readonly AuditEntry[]> {
    const limit = Math.min(REPLAY_MAX, Math.max(1, query.limit ?? REPLAY_DEFAULT));
    const where: Record<string, unknown> = {};
    if (query.action) where.action = query.action;
    if (query.actorUserId !== undefined) where.actorUserId = query.actorUserId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.before) where.createdAt = { lt: query.before };

    const rows = await this.mysql.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      payload: r.payload,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
    }));
  }
}
