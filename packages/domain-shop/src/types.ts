// Aetheria — shop domain types.

import type { Currency } from "@aetheria/domain-economy";

export type TransactionStatus = "pending" | "completed" | "refunded" | "failed";

export interface ShopItemRow {
  readonly shopItemId: bigint;
  readonly itemId: bigint;
  readonly itemName: string;
  readonly itemTier: string;
  readonly currency: Currency;
  readonly price: number;
  readonly availableFrom: Date;
  readonly availableTo: Date;
  readonly stock: number | null;
}

export interface PurchaseInput {
  readonly userId: bigint;
  readonly shopItemId: bigint;
  readonly quantity?: number;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface PurchaseResult {
  readonly transactionId: bigint;
  readonly shopItemId: bigint;
  readonly itemId: bigint;
  readonly quantity: number;
  readonly currency: Currency;
  readonly amount: number;
  readonly newBalance: number;
}

export interface TransactionRow {
  readonly transactionId: bigint;
  readonly shopItemId: bigint;
  readonly currency: Currency;
  readonly amount: number;
  readonly status: TransactionStatus;
  readonly createdAt: Date;
}

export interface RefundInput {
  readonly userId: bigint;
  readonly transactionId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}
