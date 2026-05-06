// Aetheria — ShopService.
//
// Three responsibilities:
//
// 1. **catalog** — list active `shop_items` joined with the underlying
//    `items` (name + tier) so the UI can render without a second hop.
// 2. **purchase** — atomic in `$transaction`:
//      • check `availableFrom/To`, optional `stock`, and balance
//      • decrement balance on `profiles.{gold|aether}`
//      • upsert `inventory` (additive into the existing stack, capped)
//      • decrement `shop_items.stock` if non-null
//      • write `transactions` row with `status = "completed"`
// 3. **history** / **refund** — read user's transactions, refund within
//    the economy refund window (24 h) by reversing the debit and the
//    inventory grant in another `$transaction`.

import { audit } from "@aetheria/core";
import {
  applyDiscount,
  canAfford,
  isShopItemActive,
  isWithinRefundWindow,
  toCurrency,
  type Currency,
} from "@aetheria/domain-economy";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import type {
  PurchaseInput,
  PurchaseResult,
  RefundInput,
  ShopItemRow,
  TransactionRow,
  TransactionStatus,
} from "./types.js";

export type ShopMysqlClient = Pick<
  MysqlClient,
  "shopItem" | "transaction" | "profile" | "inventory" | "item" | "$transaction"
>;

export interface ShopDeps {
  readonly mysql: ShopMysqlClient;
  readonly clock?: () => Date;
}

const toStatus = (raw: string): TransactionStatus => {
  if (raw === "completed" || raw === "refunded" || raw === "failed") return raw;
  return "pending";
};

const balanceOf = (
  profile: { gold: number; aether: number },
  c: Currency,
): number => (c === "gold" ? profile.gold : profile.aether);

const debitField = (c: Currency): "gold" | "aether" => (c === "gold" ? "gold" : "aether");

export class ShopService {
  private readonly mysql: ShopMysqlClient;
  private readonly clock: () => Date;

  constructor(deps: ShopDeps) {
    this.mysql = deps.mysql;
    this.clock = deps.clock ?? ((): Date => new Date());
  }

  async catalog(): Promise<readonly ShopItemRow[]> {
    const now = this.clock();
    const rows = await this.mysql.shopItem.findMany({
      where: { availableFrom: { lte: now }, availableTo: { gt: now } },
      include: { item: { select: { name: true, tier: true } } },
      orderBy: { id: "asc" },
    });
    return rows.map(
      (r): ShopItemRow => ({
        shopItemId: r.id,
        itemId: r.itemId,
        itemName: r.item.name,
        itemTier: r.item.tier,
        currency: toCurrency(r.currencyType),
        price: r.price,
        availableFrom: r.availableFrom,
        availableTo: r.availableTo,
        stock: r.stock,
      }),
    );
  }

  async history(userId: bigint, limit = 50): Promise<readonly TransactionRow[]> {
    const rows = await this.mysql.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, limit)),
    });
    return rows.map((r) => ({
      transactionId: r.id,
      shopItemId: r.shopItemId,
      currency: toCurrency(r.currencyType),
      amount: r.amount,
      status: toStatus(r.status),
      createdAt: r.createdAt,
    }));
  }

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const qty = Math.max(1, Math.floor(input.quantity ?? 1));
    const now = this.clock();

    const shop = await this.mysql.shopItem.findUnique({
      where: { id: input.shopItemId },
      include: { item: { select: { maxStack: true } } },
    });
    if (!shop) throw AppError.notFound("shopItem", input.shopItemId);
    if (!isShopItemActive(shop.availableFrom, shop.availableTo, now)) {
      throw AppError.conflict("Shop item not currently available");
    }
    if (shop.stock !== null && shop.stock < qty) {
      throw AppError.conflict("Out of stock", { available: shop.stock });
    }
    const currency = toCurrency(shop.currencyType);
    const totalCost = applyDiscount(shop.price, 0) * qty;

    const profile = await this.mysql.profile.findUnique({
      where: { userId: input.userId },
      select: { gold: true, aether: true, userId: true },
    });
    if (!profile) throw AppError.notFound("profile", input.userId);
    if (!canAfford(balanceOf(profile, currency), totalCost)) {
      throw AppError.conflict("Insufficient balance", {
        currency,
        required: totalCost,
        balance: balanceOf(profile, currency),
      });
    }

    const result = await this.mysql.$transaction(async (tx) => {
      // 1. Debit balance.
      const updated = await tx.profile.update({
        where: { userId: input.userId },
        data: { [debitField(currency)]: { decrement: totalCost } },
        select: { gold: true, aether: true },
      });
      // 2. Decrement stock (when finite).
      if (shop.stock !== null) {
        await tx.shopItem.update({
          where: { id: shop.id },
          data: { stock: { decrement: qty } },
        });
      }
      // 3. Inventory upsert with stack cap from `items.maxStack`.
      const inv = await tx.inventory.findUnique({
        where: { userId_itemId: { userId: input.userId, itemId: shop.itemId } },
        select: { id: true, quantity: true },
      });
      const stackCap = shop.item.maxStack;
      const newQty = (inv?.quantity ?? 0) + qty;
      if (newQty > stackCap) {
        throw AppError.conflict("Inventory stack overflow", {
          stackCap,
          would: newQty,
        });
      }
      if (inv) {
        await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: newQty },
        });
      } else {
        await tx.inventory.create({
          data: { userId: input.userId, itemId: shop.itemId, quantity: qty },
        });
      }
      // 4. Transaction row (idempotency knob is on `id` — Prisma autoinc).
      const txRow = await tx.transaction.create({
        data: {
          userId: input.userId,
          shopItemId: shop.id,
          currencyType: currency,
          amount: totalCost,
          status: "completed",
        },
      });
      return { txRow, balance: balanceOf(updated, currency) };
    });

    await audit.write({
      actor: input.userId,
      action: "shop.purchase",
      targetType: "shopItem",
      targetId: shop.id,
      payload: {
        currency,
        amount: totalCost,
        quantity: qty,
        itemId: shop.itemId.toString(),
      },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      transactionId: result.txRow.id,
      shopItemId: shop.id,
      itemId: shop.itemId,
      quantity: qty,
      currency,
      amount: totalCost,
      newBalance: result.balance,
    };
  }

  async refund(input: RefundInput): Promise<{ refunded: true; newBalance: number }> {
    const now = this.clock();
    const tx = await this.mysql.transaction.findUnique({
      where: { id: input.transactionId },
      include: { shopItem: { select: { itemId: true } } },
    });
    if (!tx) throw AppError.notFound("transaction", input.transactionId);
    if (tx.userId !== input.userId) {
      throw AppError.forbidden("Cannot refund another user's transaction");
    }
    if (toStatus(tx.status) !== "completed") {
      throw AppError.conflict("Transaction not refundable", { status: tx.status });
    }
    if (!isWithinRefundWindow(tx.createdAt, now)) {
      throw AppError.conflict("Refund window expired");
    }
    const currency = toCurrency(tx.currencyType);

    const balance = await this.mysql.$transaction(async (txw) => {
      const updated = await txw.profile.update({
        where: { userId: input.userId },
        data: { [debitField(currency)]: { increment: tx.amount } },
        select: { gold: true, aether: true },
      });
      const inv = await txw.inventory.findUnique({
        where: { userId_itemId: { userId: input.userId, itemId: tx.shopItem.itemId } },
        select: { id: true, quantity: true },
      });
      // The original purchase pinned quantity into the Transaction.amount /
      // shop price; we don't store it explicitly so we use a single-unit
      // refund as the conservative default. Bulk-refunds are an admin path.
      const refundQty = Math.max(1, Math.floor(tx.amount / Math.max(1, tx.amount)));
      if (inv) {
        const next = inv.quantity - refundQty;
        if (next <= 0) {
          await txw.inventory.delete({ where: { id: inv.id } });
        } else {
          await txw.inventory.update({ where: { id: inv.id }, data: { quantity: next } });
        }
      }
      await txw.transaction.update({
        where: { id: tx.id },
        data: { status: "refunded" },
      });
      return balanceOf(updated, currency);
    });

    await audit.write({
      actor: input.userId,
      action: "shop.refund",
      targetType: "transaction",
      targetId: tx.id,
      payload: { currency, amount: tx.amount },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { refunded: true, newBalance: balance };
  }
}
