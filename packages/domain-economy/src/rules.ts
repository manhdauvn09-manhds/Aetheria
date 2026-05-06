// Aetheria — economy primitives.
//
// Pure helpers shared by the shop, marketplace audit, and admin
// grant flows. No DB / I/O.

export type Currency = "gold" | "aether";

const CURRENCIES: readonly Currency[] = ["gold", "aether"];

export const isCurrency = (s: string): s is Currency =>
  (CURRENCIES as readonly string[]).includes(s);

/** Defaults to "gold" on garbage input — the service still rejects unknown currencies via this guard. */
export const toCurrency = (raw: unknown): Currency => {
  if (typeof raw === "string" && isCurrency(raw)) return raw;
  return "gold";
};

/** Window during which a purchase can still be refunded. */
export const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True iff `now - createdAt < REFUND_WINDOW_MS`. */
export const isWithinRefundWindow = (
  createdAt: Date,
  now: Date,
  windowMs: number = REFUND_WINDOW_MS,
): boolean => now.getTime() - createdAt.getTime() < windowMs;

/**
 * Apply a percent discount to a base price (integer math).
 * `discountBp` is in basis points (1/100 of a %); 1500 bp = 15 %.
 */
export const applyDiscount = (basePrice: number, discountBp = 0): number => {
  if (basePrice < 0) return 0;
  const bp = Math.max(0, Math.min(10_000, Math.round(discountBp)));
  const off = Math.floor((basePrice * bp) / 10_000);
  return Math.max(0, basePrice - off);
};

/** Window check for `ShopItem.availableFrom <= now < availableTo`. */
export const isShopItemActive = (
  availableFrom: Date,
  availableTo: Date,
  now: Date,
): boolean =>
  availableFrom.getTime() <= now.getTime() && now.getTime() < availableTo.getTime();

/** True iff `balance >= price`. */
export const canAfford = (balance: number, price: number): boolean =>
  balance >= price && price >= 0;

/** Total cost for `quantity` units of a possibly-discounted item. */
export const lineTotal = (basePrice: number, quantity: number, discountBp = 0): number => {
  if (quantity <= 0) return 0;
  return applyDiscount(basePrice, discountBp) * Math.floor(quantity);
};
