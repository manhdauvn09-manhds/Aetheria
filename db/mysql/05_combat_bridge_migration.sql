-- Aetheria — combat-bridge migration (idempotent).
--
-- Supports the "combat uses real level data + roster ownership" work:
--   1. runs.party_config : JSON snapshot of the resolved party hero-IDs
--      used when the run's combat was initialised. Lets combat.replay
--      rebuild the IDENTICAL init (selectedTeam can change in the
--      profile between play and replay, which would otherwise produce
--      a false tamper flag).
--   2. characters reseed : align the catalog codenames with the combat
--      roster (aevra/kyo/lyra/brann/mira/vex/solen/null) so
--      user_characters ownership maps 1:1 to the heroes used in combat.
--      Stats mirror HERO_ROSTER in domain-combat-runtime.
--
-- All statements are idempotent (guarded ADD COLUMN / upsert) so this
-- can be re-applied safely.

USE `aetheria`;

-- ── 1. runs.party_config ────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'runs'
    AND COLUMN_NAME = 'party_config'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE `runs` ADD COLUMN `party_config` JSON NULL AFTER `snapshot`',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. characters reseed (codename = combat roster id) ──────────────
-- Two-phase to avoid the codename UNIQUE collision when heroes move
-- slots (old id7=vex → new id6=vex; old id2=lyra → new id3=lyra). First
-- park every codename at a temp value so no real codename exists, then
-- upsert the real values. Idempotent on re-run.
UPDATE `characters` SET `codename` = CONCAT('migrating_', `id`) WHERE `id` BETWEEN 1 AND 8;

INSERT INTO `characters` (`id`, `codename`, `name`, `class`, `role`, `base_stats`, `lore`, `version`) VALUES
  (1, 'aevra', 'Aevra',  'aetherwalker', 'dps',     JSON_OBJECT('hp',92, 'atk',32,'def',12,'spd',65), 'Aetherbound vanguard; teleporting blade.',      1),
  (2, 'kyo',   'Kyo',    'bladepriest',  'bruiser', JSON_OBJECT('hp',112,'atk',26,'def',20,'spd',50), 'Parry-chain monk of the broken sky.',           1),
  (3, 'lyra',  'Lyra',   'stormcaller',  'mage',    JSON_OBJECT('hp',76, 'atk',40,'def',8, 'spd',60), 'Tempest-sigil glass cannon.',                   1),
  (4, 'brann', 'Brann',  'earthwarden',  'tank',    JSON_OBJECT('hp',134,'atk',20,'def',28,'spd',40), 'Bulwark of the Verdant Reach.',                 1),
  (5, 'mira',  'Mira',   'lifebinder',   'support', JSON_OBJECT('hp',88, 'atk',18,'def',16,'spd',55), 'Verdant-pact healer.',                          1),
  (6, 'vex',   'Vex',    'shadowblade',  'control', JSON_OBJECT('hp',72, 'atk',38,'def',10,'spd',80), 'Voidstep assassin, rank-D PvP unlock.',         1),
  (7, 'solen', 'Solen',  'sunoracle',    'support', JSON_OBJECT('hp',90, 'atk',22,'def',16,'spd',58), 'Daybreak support oracle.',                      1),
  (8, 'null',  'Null',   'voidchild',    'control', JSON_OBJECT('hp',96, 'atk',30,'def',14,'spd',62), 'Entropy wildcard; secret unlock.',              1)
ON DUPLICATE KEY UPDATE
  `codename`   = VALUES(`codename`),
  `name`       = VALUES(`name`),
  `class`      = VALUES(`class`),
  `role`       = VALUES(`role`),
  `base_stats` = VALUES(`base_stats`),
  `lore`       = VALUES(`lore`),
  `version`    = VALUES(`version`);
