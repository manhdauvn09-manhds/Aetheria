-- Aetheria — SQLite catalog cache placeholder
-- After login the client pulls full catalogs from the server and writes them here.
-- This file just primes sync_meta so the first pull starts from the beginning of time.

INSERT OR IGNORE INTO sync_meta (table_name, last_pulled_at) VALUES
  ('characters',          NULL),
  ('skills',              NULL),
  ('character_skills',    NULL),
  ('realms',              NULL),
  ('levels',              NULL),
  ('items',               NULL),
  ('quests',              NULL),
  ('battle_pass_seasons', NULL),
  ('shop_items',          NULL);
