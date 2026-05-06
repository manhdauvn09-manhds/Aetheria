-- Aetheria — Prisma migration 0004_currency_balance (MySQL).
-- Adds dual-currency wallets to the `profiles` table so the shop can
-- debit purchases and downstream rewards can credit grants.

ALTER TABLE `profiles`
  ADD COLUMN `gold`   INT NOT NULL DEFAULT 0,
  ADD COLUMN `aether` INT NOT NULL DEFAULT 0;
