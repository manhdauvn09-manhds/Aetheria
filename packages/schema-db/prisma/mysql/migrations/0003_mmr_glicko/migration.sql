-- Aetheria — Prisma migration 0003_mmr_glicko (MySQL).
-- Adds Glicko-2 deviation + volatility columns to the `mmr` table.

ALTER TABLE `mmr`
  ADD COLUMN `rd`         DOUBLE NOT NULL DEFAULT 350.0,
  ADD COLUMN `volatility` DOUBLE NOT NULL DEFAULT 0.06;
