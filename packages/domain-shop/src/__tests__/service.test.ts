import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aetheria/core", () => ({
  audit: { write: vi.fn().mockResolvedValue(undefined) },
}));

import { ShopService, type ShopMysqlClient } from "../service.js";

const NOW   = new Date("2026-05-06T12:00:00Z");
const PAST  = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2026-12-31T00:00:00Z");

type TxMock = {
  profile:     { update: ReturnType<typeof vi.fn> };
  shopItem:    { update: ReturnType<typeof vi.fn> };
  inventory:   { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  transaction: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

function makeDeps() {
  const tx: TxMock = {
    profile:     { update: vi.fn().mockResolvedValue({ gold: 900, aether: 0 }) },
    shopItem:    { update: vi.fn().mockResolvedValue(undefined) },
    inventory:   {
      findUnique: vi.fn().mockResolvedValue(null),
      create:     vi.fn().mockResolvedValue(undefined),
      update:     vi.fn().mockResolvedValue(undefined),
      delete:     vi.fn().mockResolvedValue(undefined),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: 42n }),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const mysql = {
    shopItem:    { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    transaction: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    profile:     { findUnique: vi.fn() },
    inventory:   {},
    item:        {},
    $transaction: vi.fn().mockImplementation((fn: (t: TxMock) => Promise<unknown>) => fn(tx)),
  };
  return { mysql, tx };
}

const activeShopItem = {
  id: 1n,
  itemId: 10n,
  currencyType: "gold",
  price: 100,
  availableFrom: PAST,
  availableTo:   FUTURE,
  stock:         null,
  item:          { name: "Iron Sword", tier: "common", maxStack: 99 },
};

const richProfile = { userId: 1n, gold: 1000, aether: 0 };

const mkSvc = (mysql: ReturnType<typeof makeDeps>["mysql"], clock = () => NOW) =>
  new ShopService({ mysql: mysql as unknown as ShopMysqlClient, clock });

// ── catalog ──────────────────────────────────────────────────────────────

describe("ShopService.catalog", () => {
  it("maps raw rows to ShopItemRow", async () => {
    const { mysql } = makeDeps();
    mysql.shopItem.findMany.mockResolvedValue([activeShopItem]);
    const svc = mkSvc(mysql);
    const rows = await svc.catalog();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shopItemId).toBe(1n);
    expect(rows[0]?.currency).toBe("gold");
    expect(rows[0]?.price).toBe(100);
  });

  it("returns empty list when no active items", async () => {
    const { mysql } = makeDeps();
    mysql.shopItem.findMany.mockResolvedValue([]);
    const svc = mkSvc(mysql);
    expect(await svc.catalog()).toHaveLength(0);
  });
});

// ── history ───────────────────────────────────────────────────────────────

describe("ShopService.history", () => {
  it("maps rows and respects limit cap", async () => {
    const { mysql } = makeDeps();
    mysql.transaction.findMany.mockResolvedValue([
      { id: 1n, shopItemId: 1n, currencyType: "gold", amount: 100, status: "completed", createdAt: NOW },
    ]);
    const svc = mkSvc(mysql);
    const rows = await svc.history(1n, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("completed");
  });
});

// ── purchase ─────────────────────────────────────────────────────────────

describe("ShopService.purchase", () => {
  let mysql: ReturnType<typeof makeDeps>["mysql"];
  let tx:    ReturnType<typeof makeDeps>["tx"];

  beforeEach(() => {
    const deps = makeDeps();
    mysql = deps.mysql;
    tx    = deps.tx;
    mysql.shopItem.findUnique.mockResolvedValue(activeShopItem);
    mysql.profile.findUnique.mockResolvedValue(richProfile);
  });

  it("deducts balance and creates transaction row (happy path)", async () => {
    const svc = mkSvc(mysql);
    const result = await svc.purchase({ userId: 1n, shopItemId: 1n, quantity: 1 });
    expect(result.amount).toBe(100);
    expect(result.quantity).toBe(1);
    expect(tx.transaction.create).toHaveBeenCalledOnce();
    expect(tx.profile.update).toHaveBeenCalledOnce();
  });

  it("creates inventory row when none exists", async () => {
    tx.inventory.findUnique.mockResolvedValue(null);
    const svc = mkSvc(mysql);
    await svc.purchase({ userId: 1n, shopItemId: 1n });
    expect(tx.inventory.create).toHaveBeenCalledOnce();
  });

  it("increments existing inventory stack", async () => {
    tx.inventory.findUnique.mockResolvedValue({ id: 5n, quantity: 3 });
    const svc = mkSvc(mysql);
    await svc.purchase({ userId: 1n, shopItemId: 1n });
    expect(tx.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 4 } }),
    );
  });

  it("throws conflict when insufficient balance", async () => {
    mysql.profile.findUnique.mockResolvedValue({ userId: 1n, gold: 50, aether: 0 });
    const svc = mkSvc(mysql);
    await expect(svc.purchase({ userId: 1n, shopItemId: 1n })).rejects.toThrow("Insufficient");
  });

  it("throws conflict when out of stock (finite stock)", async () => {
    mysql.shopItem.findUnique.mockResolvedValue({ ...activeShopItem, stock: 0 });
    const svc = mkSvc(mysql);
    await expect(svc.purchase({ userId: 1n, shopItemId: 1n })).rejects.toThrow("stock");
  });

  it("throws not-found when shop item missing", async () => {
    mysql.shopItem.findUnique.mockResolvedValue(null);
    const svc = mkSvc(mysql);
    await expect(svc.purchase({ userId: 1n, shopItemId: 99n })).rejects.toThrow();
  });

  it("throws conflict on stack overflow", async () => {
    const cappedItem = { ...activeShopItem, item: { ...activeShopItem.item, maxStack: 5 } };
    mysql.shopItem.findUnique.mockResolvedValue(cappedItem);
    tx.inventory.findUnique.mockResolvedValue({ id: 2n, quantity: 5 });
    const svc = mkSvc(mysql);
    await expect(svc.purchase({ userId: 1n, shopItemId: 1n })).rejects.toThrow("stack");
  });

  it("decrements finite stock after purchase", async () => {
    mysql.shopItem.findUnique.mockResolvedValue({ ...activeShopItem, stock: 10 });
    const svc = mkSvc(mysql);
    await svc.purchase({ userId: 1n, shopItemId: 1n });
    expect(tx.shopItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 1 } } }),
    );
  });

  it("throws conflict when item not currently active", async () => {
    const expired = {
      ...activeShopItem,
      availableFrom: PAST,
      availableTo: new Date("2025-01-01T00:00:00Z"),
    };
    mysql.shopItem.findUnique.mockResolvedValue(expired);
    const svc = mkSvc(mysql);
    await expect(svc.purchase({ userId: 1n, shopItemId: 1n })).rejects.toThrow("available");
  });
});

// ── refund ────────────────────────────────────────────────────────────────

describe("ShopService.refund", () => {
  let mysql: ReturnType<typeof makeDeps>["mysql"];
  let tx:    ReturnType<typeof makeDeps>["tx"];

  const completedTx = {
    id:           99n,
    userId:       1n,
    shopItemId:   1n,
    currencyType: "gold",
    amount:       300,
    status:       "completed",
    createdAt:    new Date(NOW.getTime() - 3_600_000), // 1 h ago — within 24 h window
    shopItem:     { itemId: 10n, price: 100 },
  };

  beforeEach(() => {
    const deps = makeDeps();
    mysql = deps.mysql;
    tx    = deps.tx;
    mysql.transaction.findUnique.mockResolvedValue(completedTx);
    tx.profile.update.mockResolvedValue({ gold: 1300, aether: 0 });
    tx.inventory.findUnique.mockResolvedValue({ id: 5n, quantity: 5 });
    tx.inventory.update.mockResolvedValue(undefined);
  });

  it("refunds and adjusts inventory (qty = amount/price = 3)", async () => {
    const svc = mkSvc(mysql);
    const result = await svc.refund({ userId: 1n, transactionId: 99n });
    expect(result.refunded).toBe(true);
    expect(tx.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 2 } }), // 5 - 3 = 2
    );
    expect(tx.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refunded" } }),
    );
  });

  it("deletes inventory row when quantity drops to zero", async () => {
    tx.inventory.findUnique.mockResolvedValue({ id: 5n, quantity: 3 }); // exact match
    const svc = mkSvc(mysql);
    await svc.refund({ userId: 1n, transactionId: 99n });
    expect(tx.inventory.delete).toHaveBeenCalledOnce();
  });

  it("throws forbidden when userId mismatch", async () => {
    const svc = mkSvc(mysql);
    await expect(svc.refund({ userId: 99n, transactionId: 99n })).rejects.toThrow("Cannot refund");
  });

  it("throws conflict when already refunded", async () => {
    mysql.transaction.findUnique.mockResolvedValue({ ...completedTx, status: "refunded" });
    const svc = mkSvc(mysql);
    await expect(svc.refund({ userId: 1n, transactionId: 99n })).rejects.toThrow("refundable");
  });

  it("throws conflict when refund window expired (> 24 h)", async () => {
    const old = { ...completedTx, createdAt: new Date(NOW.getTime() - 25 * 3_600_000) };
    mysql.transaction.findUnique.mockResolvedValue(old);
    const svc = mkSvc(mysql);
    await expect(svc.refund({ userId: 1n, transactionId: 99n })).rejects.toThrow("Refund window");
  });
});
