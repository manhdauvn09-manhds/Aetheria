import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aetheria/core", () => ({
  audit: { write: vi.fn().mockResolvedValue(undefined) },
}));

import { AdminService, type AdminMysqlClient } from "../service.js";

const NOW = new Date("2026-05-06T12:00:00Z");

function makeMysql() {
  return {
    user:        { findUnique: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    inventory:   { findUnique: vi.fn(), create: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
    item:        { findUnique: vi.fn() },
    featureFlag: { findMany: vi.fn(), upsert: vi.fn() },
    auditLog:    { findMany: vi.fn() },
  };
}

const mkSvc = (mysql: ReturnType<typeof makeMysql>) =>
  new AdminService({ mysql: mysql as unknown as AdminMysqlClient });

// ── banUser ───────────────────────────────────────────────────────────────

describe("AdminService.banUser", () => {
  it("bans an active user and returns status=banned", async () => {
    const mysql = makeMysql();
    mysql.user.findUnique.mockResolvedValue({ id: 2n, status: "active" });
    const svc = mkSvc(mysql);
    const result = await svc.banUser({ actorUserId: 1n, targetUserId: 2n, reason: "spam" });
    expect(result.status).toBe("banned");
    expect(mysql.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "banned" } }),
    );
  });

  it("throws not-found when user does not exist", async () => {
    const mysql = makeMysql();
    mysql.user.findUnique.mockResolvedValue(null);
    const svc = mkSvc(mysql);
    await expect(svc.banUser({ actorUserId: 1n, targetUserId: 99n, reason: "test" })).rejects.toThrow();
  });

  it("throws bad-request for empty reason", async () => {
    const mysql = makeMysql();
    mysql.user.findUnique.mockResolvedValue({ id: 2n, status: "active" });
    const svc = mkSvc(mysql);
    await expect(svc.banUser({ actorUserId: 1n, targetUserId: 2n, reason: "" })).rejects.toThrow("reason");
  });

  it("throws bad-request for reason over 500 chars", async () => {
    const mysql = makeMysql();
    mysql.user.findUnique.mockResolvedValue({ id: 2n, status: "active" });
    const svc = mkSvc(mysql);
    await expect(
      svc.banUser({ actorUserId: 1n, targetUserId: 2n, reason: "x".repeat(501) }),
    ).rejects.toThrow("reason");
  });
});

// ── unbanUser ─────────────────────────────────────────────────────────────

describe("AdminService.unbanUser", () => {
  it("unbans a user and returns status=active", async () => {
    const mysql = makeMysql();
    mysql.user.findUnique.mockResolvedValue({ id: 2n, status: "banned" });
    const svc = mkSvc(mysql);
    const result = await svc.unbanUser({ actorUserId: 1n, targetUserId: 2n });
    expect(result.status).toBe("active");
    expect(mysql.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active" } }),
    );
  });

  it("throws not-found for unknown user", async () => {
    const mysql = makeMysql();
    mysql.user.findUnique.mockResolvedValue(null);
    const svc = mkSvc(mysql);
    await expect(svc.unbanUser({ actorUserId: 1n, targetUserId: 99n })).rejects.toThrow();
  });
});

// ── grantItem ─────────────────────────────────────────────────────────────

describe("AdminService.grantItem", () => {
  let mysql: ReturnType<typeof makeMysql>;

  beforeEach(() => {
    mysql = makeMysql();
    mysql.item.findUnique.mockResolvedValue({ id: 5n, maxStack: 99 });
    mysql.inventory.findUnique.mockResolvedValue(null);
  });

  it("creates inventory row for new item grant", async () => {
    const svc = mkSvc(mysql);
    const result = await svc.grantItem({ actorUserId: 1n, targetUserId: 2n, itemId: 5n, quantity: 3 });
    expect(result.granted).toBe(3);
    expect(result.newQuantity).toBe(3);
    expect(mysql.inventory.create).toHaveBeenCalledOnce();
  });

  it("updates existing stack", async () => {
    mysql.inventory.findUnique.mockResolvedValue({ id: 10n, quantity: 5 });
    const svc = mkSvc(mysql);
    const result = await svc.grantItem({ actorUserId: 1n, targetUserId: 2n, itemId: 5n, quantity: 2 });
    expect(result.newQuantity).toBe(7);
    expect(mysql.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 7 } }),
    );
  });

  it("throws conflict on stack overflow", async () => {
    mysql.item.findUnique.mockResolvedValue({ id: 5n, maxStack: 10 });
    mysql.inventory.findUnique.mockResolvedValue({ id: 10n, quantity: 9 });
    const svc = mkSvc(mysql);
    await expect(
      svc.grantItem({ actorUserId: 1n, targetUserId: 2n, itemId: 5n, quantity: 5 }),
    ).rejects.toThrow("stack");
  });

  it("throws bad-request for non-positive quantity", async () => {
    const svc = mkSvc(mysql);
    await expect(
      svc.grantItem({ actorUserId: 1n, targetUserId: 2n, itemId: 5n, quantity: 0 }),
    ).rejects.toThrow("Quantity");
  });

  it("throws not-found when item missing", async () => {
    mysql.item.findUnique.mockResolvedValue(null);
    const svc = mkSvc(mysql);
    await expect(
      svc.grantItem({ actorUserId: 1n, targetUserId: 2n, itemId: 99n, quantity: 1 }),
    ).rejects.toThrow();
  });
});

// ── setFeatureFlag ────────────────────────────────────────────────────────

describe("AdminService.setFeatureFlag", () => {
  it("upserts flag and returns row", async () => {
    const mysql = makeMysql();
    mysql.featureFlag.upsert.mockResolvedValue({
      key: "pvp_enabled",
      value: true,
      updatedBy: "1",
      updatedAt: NOW,
    });
    const svc = mkSvc(mysql);
    const row = await svc.setFeatureFlag({ actorUserId: 1n, key: "pvp_enabled", value: true });
    expect(row.key).toBe("pvp_enabled");
    expect(mysql.featureFlag.upsert).toHaveBeenCalledOnce();
  });

  it("throws bad-request for empty key", async () => {
    const svc = mkSvc(makeMysql());
    await expect(svc.setFeatureFlag({ actorUserId: 1n, key: "", value: true })).rejects.toThrow("key");
  });

  it("throws bad-request for key over 128 chars", async () => {
    const svc = mkSvc(makeMysql());
    await expect(
      svc.setFeatureFlag({ actorUserId: 1n, key: "k".repeat(129), value: null }),
    ).rejects.toThrow("key");
  });
});

// ── replay ────────────────────────────────────────────────────────────────

describe("AdminService.replay", () => {
  it("returns mapped audit entries", async () => {
    const mysql = makeMysql();
    mysql.auditLog.findMany.mockResolvedValue([
      {
        id: 1n,
        actorUserId: 2n,
        action: "shop.purchase",
        targetType: "shopItem",
        targetId: 3n,
        payload: {},
        ip: null,
        userAgent: null,
        createdAt: NOW,
      },
    ]);
    const svc = mkSvc(mysql);
    const entries = await svc.replay({ action: "shop.purchase" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("shop.purchase");
  });

  it("applies limit cap (max 500)", async () => {
    const mysql = makeMysql();
    mysql.auditLog.findMany.mockResolvedValue([]);
    const svc = mkSvc(mysql);
    await svc.replay({ limit: 9999 });
    expect(mysql.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it("filters by targetType when provided", async () => {
    const mysql = makeMysql();
    mysql.auditLog.findMany.mockResolvedValue([]);
    const svc = mkSvc(mysql);
    await svc.replay({ targetType: "user" });
    expect(mysql.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { targetType: "user" } }),
    );
  });
});
