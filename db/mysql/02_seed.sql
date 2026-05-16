-- Aetheria — minimal MySQL seed (catalog placeholders)
-- Just enough rows for the app to boot in dev. Real content lives in Step 4 (level designer).
-- Idempotent via INSERT IGNORE.

USE `aetheria`;

-- 5 realms (placeholders; full lore TBD in Step 4)
INSERT IGNORE INTO `realms` (`id`, `name`, `theme`, `color_hex`, `order_index`) VALUES
  (1, 'Verdant Reach',   'forest',   '#2E7D32', 1),
  (2, 'Ashen Wastes',    'volcanic', '#B71C1C', 2),
  (3, 'Aetheric Spires', 'sky',      '#1565C0', 3),
  (4, 'Sunken Hollow',   'ocean',    '#006064', 4),
  (5, 'Hollow Vault',    'void',     '#311B92', 5);

-- 8 starter characters (placeholder stats; balanced in Step 4)
INSERT IGNORE INTO `characters` (`id`, `codename`, `name`, `class`, `role`, `base_stats`, `lore`, `version`) VALUES
  (1, 'kael',   'Kael Vorn',     'warrior',  'tank',    JSON_OBJECT('hp',1200,'atk',80,'def',120,'spd',45), 'Exiled blade-knight of the Reach.', 1),
  (2, 'lyra',   'Lyra Nightsong','rogue',    'dps',     JSON_OBJECT('hp',900, 'atk',130,'def',60, 'spd',95), 'Whisper-thief of the Spires.',      1),
  (3, 'thane',  'Thane Brightoak','ranger',  'dps',     JSON_OBJECT('hp',1000,'atk',110,'def',75, 'spd',80), 'Last warden of the Verdant.',       1),
  (4, 'morwyn', 'Morwyn Ashe',   'pyromancer','dps',    JSON_OBJECT('hp',850, 'atk',150,'def',55, 'spd',70), 'Cinder-witch of the Wastes.',       1),
  (5, 'sora',   'Sora Tideborn', 'mystic',   'support', JSON_OBJECT('hp',950, 'atk',90, 'def',80, 'spd',85), 'Songkeeper of the Hollow seas.',    1),
  (6, 'duran',  'Duran Ironvein','guardian', 'tank',    JSON_OBJECT('hp',1400,'atk',70, 'def',140,'spd',35), 'Vault-warden, oath-bound.',         1),
  (7, 'vex',    'Vex Cinderfall','arcanist', 'control', JSON_OBJECT('hp',880, 'atk',120,'def',65, 'spd',75), 'Time-cracked scholar.',             1),
  (8, 'iris',   'Iris Veilwoven','prismblade','dps',    JSON_OBJECT('hp',920, 'atk',125,'def',70, 'spd',88), 'Aetherforged duellist.',            1);

-- one feature flag so the app can boot
INSERT IGNORE INTO `feature_flags` (`key`, `value`, `updated_by`) VALUES
  ('maintenance_mode',     JSON_OBJECT('enabled', false), 'seed'),
  ('pvp_enabled',          JSON_OBJECT('enabled', true ), 'seed'),
  ('battle_pass_enabled',  JSON_OBJECT('enabled', true ), 'seed');

-- 8 levels (placeholders matching packages/game-assets level JSONs). Full
-- map/encounter/rewards live in the JSON files and are loaded by the
-- WorldService dev-fallback path when the column is empty — we still need
-- the level row to exist so `runs.level_id` FK passes. Real designer-tuned
-- map JSON gets backfilled by the Step 4 level pipeline.
INSERT IGNORE INTO `levels` (`id`, `realm_id`, `level_number`, `name`, `type`,
  `map`, `encounter`, `rewards`, `difficulty`, `min_account_level`, `version`) VALUES
  (1, 1, 1, 'Forest Trail',        'story',    JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 1, 1, 1),
  (2, 2, 2, 'Cinder Pass',         'combat',   JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 2, 1, 1),
  (3, 3, 3, 'Cloudbridge',         'puzzle',   JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 2, 2, 1),
  (4, 4, 4, 'Tideglass Reef',      'combat',   JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 3, 3, 1),
  (5, 5, 5, 'Voidstep Atrium',     'boss',     JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 5, 5, 1),
  (6, 1, 6, 'Hidden Glade',        'treasure', JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 3, 4, 1),
  (7, 3, 7, 'Spire Trial',         'rift',     JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 4, 6, 1),
  (8, 5, 8, 'Mirror Rift',         'hidden',   JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 6, 8, 1);
