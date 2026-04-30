-- Aetheria — Prisma migration 0001_init (SQLite, per-user).
-- DDL mirrors db/sqlite/01_init.sql. PRAGMAs are set by the app on open.

-- ────────────────────────────────────────────────────────────────────
-- Local profile (singleton)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_profile (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  remote_user_id  INTEGER NOT NULL UNIQUE,
  email           TEXT    NOT NULL,
  display_name    TEXT    NOT NULL,
  avatar_url      TEXT,
  country         TEXT,
  language        TEXT,
  account_level   INTEGER NOT NULL DEFAULT 1,
  account_xp      INTEGER NOT NULL DEFAULT 0,
  preferences     TEXT    NOT NULL DEFAULT '{}',
  last_login_at   TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ────────────────────────────────────────────────────────────────────
-- Catalog cache (mirrors of MySQL master, refreshed on login / patch)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS characters (
  id                 INTEGER PRIMARY KEY,
  codename           TEXT    NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  class              TEXT    NOT NULL,
  role               TEXT    NOT NULL,
  base_stats         TEXT    NOT NULL,
  art_url            TEXT,
  lore               TEXT,
  unlock_requirement TEXT,
  version            INTEGER NOT NULL DEFAULT 1,
  cached_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  ap_cost      INTEGER NOT NULL DEFAULT 0,
  cooldown     INTEGER NOT NULL DEFAULT 0,
  effect       TEXT    NOT NULL,
  icon_url     TEXT,
  cached_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_skills_character ON skills(character_id);

CREATE TABLE IF NOT EXISTS character_skills (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot         INTEGER NOT NULL,
  skill_id     INTEGER NOT NULL REFERENCES skills(id)     ON DELETE CASCADE,
  PRIMARY KEY (character_id, slot)
);

CREATE TABLE IF NOT EXISTS realms (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  theme       TEXT    NOT NULL,
  color_hex   TEXT    NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
  id                 INTEGER PRIMARY KEY,
  realm_id           INTEGER NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
  level_number       INTEGER NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  type               TEXT    NOT NULL,
  map                TEXT    NOT NULL,
  encounter          TEXT    NOT NULL,
  rewards            TEXT    NOT NULL,
  difficulty         INTEGER NOT NULL DEFAULT 1,
  min_account_level  INTEGER NOT NULL DEFAULT 1,
  discovery_secrets  TEXT,
  version            INTEGER NOT NULL DEFAULT 1,
  cached_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_levels_realm ON levels(realm_id);

CREATE TABLE IF NOT EXISTS items (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  tier      TEXT    NOT NULL,
  type      TEXT    NOT NULL,
  effect    TEXT    NOT NULL,
  icon_url  TEXT,
  max_stack INTEGER NOT NULL DEFAULT 1,
  cached_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS quests (
  id           INTEGER PRIMARY KEY,
  type         TEXT    NOT NULL,
  requirements TEXT    NOT NULL,
  rewards      TEXT    NOT NULL,
  active_from  TEXT    NOT NULL,
  active_to    TEXT    NOT NULL,
  cached_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_quests_type_active ON quests(type, active_from);

CREATE TABLE IF NOT EXISTS battle_pass_seasons (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at   TEXT NOT NULL,
  tracks    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_items (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  currency_type  TEXT    NOT NULL,
  price          INTEGER NOT NULL,
  available_from TEXT    NOT NULL,
  available_to   TEXT    NOT NULL,
  stock          INTEGER
);

-- ────────────────────────────────────────────────────────────────────
-- Personal play state (writable; primary copy lives here)
-- `dirty = 1` flags rows the sync worker still needs to push to MySQL.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_characters (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id        INTEGER UNIQUE,
  character_id     INTEGER NOT NULL UNIQUE REFERENCES characters(id) ON DELETE RESTRICT,
  ascension        INTEGER NOT NULL DEFAULT 0,
  xp               INTEGER NOT NULL DEFAULT 0,
  equipped_skin_id INTEGER,
  unlocked_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dirty            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_skills (
  skill_id    INTEGER PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL DEFAULT 1,
  unlocked_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dirty       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id                     INTEGER UNIQUE,
  item_id                       INTEGER NOT NULL UNIQUE REFERENCES items(id) ON DELETE RESTRICT,
  quantity                      INTEGER NOT NULL DEFAULT 1,
  equipped_to_user_character_id INTEGER REFERENCES user_characters(id) ON DELETE SET NULL,
  updated_at                    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dirty                         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id  INTEGER UNIQUE,
  level_id   INTEGER NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
  status     TEXT    NOT NULL,
  started_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at   TEXT,
  score      INTEGER NOT NULL DEFAULT 0,
  stars      INTEGER NOT NULL DEFAULT 0,
  action_log TEXT    NOT NULL,
  snapshot   TEXT,
  dirty      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS ix_runs_level  ON runs(level_id);

CREATE TABLE IF NOT EXISTS save_states (
  slot           INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 3),
  payload        TEXT    NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dirty          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_quests (
  quest_id   INTEGER PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
  progress   TEXT    NOT NULL DEFAULT '{}',
  status     TEXT    NOT NULL DEFAULT 'active',
  claimed_at TEXT,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dirty      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_user_quests_status ON user_quests(status);

CREATE TABLE IF NOT EXISTS battle_pass_progress (
  season_id  INTEGER PRIMARY KEY REFERENCES battle_pass_seasons(id) ON DELETE CASCADE,
  tier       INTEGER NOT NULL DEFAULT 0,
  premium    INTEGER NOT NULL DEFAULT 0,
  xp         INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dirty      INTEGER NOT NULL DEFAULT 1
);

-- ────────────────────────────────────────────────────────────────────
-- Sync infrastructure
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT    NOT NULL,
  row_key    TEXT    NOT NULL,
  operation  TEXT    NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS ix_sync_queue_created ON sync_queue(created_at);

CREATE TABLE IF NOT EXISTS sync_meta (
  table_name     TEXT PRIMARY KEY,
  last_pulled_at TEXT,
  last_pushed_at TEXT,
  cursor         TEXT
);

-- ────────────────────────────────────────────────────────────────────
-- Triggers — keep updated_at fresh and enqueue mutations for sync.
-- (Light versions; full conflict-aware sync logic lives in app code.)
-- ────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_user_characters_updated
AFTER UPDATE ON user_characters
BEGIN
  UPDATE user_characters SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), dirty = 1
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_updated
AFTER UPDATE ON inventory
BEGIN
  UPDATE inventory SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), dirty = 1
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_save_states_updated
AFTER UPDATE ON save_states
BEGIN
  UPDATE save_states SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), dirty = 1
   WHERE slot = NEW.slot;
END;
