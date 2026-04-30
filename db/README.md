# Aetheria — Database Layer

> **Status (Step 3)**: schemas + init scripts written. ORM = Prisma. Engines = **MySQL 8** (shared) + **SQLite 3** (per-user local).

## 1. Why two engines?

The original spec (`docs/02_DATABASE_DESIGN.md`) targeted PostgreSQL 16 as a single source of truth. Per project decision (recorded in `memory/MEMORY.md` on 30 Apr 2026), we are pivoting to a **hybrid local-first architecture**:

- **SQLite (local, per-user, on-device)** — every player gets their own `.db` file. Holds:
  - Personal play state: `inventory`, `runs`, `save_states`, `user_characters`, `user_skills`, `user_quests`, `battle_pass_progress`, `profile_local`.
  - Read-only catalog cache so the game runs offline: `characters`, `skills`, `character_skills`, `realms`, `levels`, `items`, `quests`, `shop_items`, `battle_pass_seasons`.
  - Sync infrastructure: `sync_queue`, `sync_meta`.
- **MySQL (shared, server-side)** — single instance. Holds:
  - Master catalogs (canonical version of all read-only content).
  - Authentication & profile (`users`, `profiles`).
  - Everything that is *intrinsically shared*: `guilds`, `guild_members`, `friendships`, `chat_messages`, `pvp_matches`, `pvp_match_players`, `mmr`, `leaderboards`, `transactions`, `audit_log`, `feature_flags`.
  - Server-side mirror of per-user state (synced from SQLite) for cloud backup, anti-cheat, and cross-device continuity.

Sync direction:

```
catalog updates           per-user state mutations
MySQL  ───────────────►   SQLite          SQLite ───────────────► MySQL
(pull on login / patch)                   (push from sync_queue)
```

## 2. Deviations from `docs/02_DATABASE_DESIGN.md`

| Spec (Postgres)             | Implementation (MySQL / SQLite)                              |
|-----------------------------|--------------------------------------------------------------|
| `bigserial`                 | MySQL: `BIGINT AUTO_INCREMENT`. SQLite: `INTEGER PK AUTOINCREMENT`. |
| `citext`                    | MySQL: `VARCHAR(...) COLLATE utf8mb4_0900_ai_ci`. SQLite: `TEXT COLLATE NOCASE`. |
| `timestamptz`               | MySQL: `DATETIME(3)` (UTC by convention). SQLite: `TEXT` ISO-8601 UTC. |
| `jsonb`                     | MySQL: `JSON`. SQLite: `TEXT` (validated by app + Prisma).   |
| `inet`                      | `VARCHAR(45)` (covers IPv6).                                 |
| `bytea`                     | MySQL: `VARBINARY(64)`. SQLite: `BLOB`.                      |
| BRIN index on `created_at`  | B-tree index (BRIN unsupported).                             |
| Range partitions (chat/audit/runs) | Documented as a future migration; MVP keeps single-table. |
| `aetheria_app/readonly/migrator` Postgres roles | MySQL users created in `init.sql`. |

## 3. Files

```
db/
├── README.md                          (this file)
├── mysql/
│   ├── 00_create_database.sql         create db + users
│   ├── 01_init.sql                    DDL + indexes
│   └── 02_seed.sql                    minimal catalog seed
└── sqlite/
    ├── 01_init.sql                    DDL + indexes
    └── 02_seed.sql                    catalog cache placeholder
prisma/
├── mysql/
│   ├── schema.prisma
│   └── migrations/0001_init/migration.sql
└── sqlite/
    ├── schema.prisma
    └── migrations/0001_init/migration.sql
```

## 4. Quick start

### MySQL (server)
```bash
mysql -u root -p < db/mysql/00_create_database.sql
mysql -u aetheria_migrator -p aetheria < db/mysql/01_init.sql
mysql -u aetheria_migrator -p aetheria < db/mysql/02_seed.sql
# OR via Prisma:
DATABASE_URL="mysql://aetheria_migrator:***@localhost:3306/aetheria" \
  npx prisma migrate deploy --schema=prisma/mysql/schema.prisma
```

### SQLite (per-user, generated at first launch)
```bash
sqlite3 ./player_<userId>.db < db/sqlite/01_init.sql
sqlite3 ./player_<userId>.db < db/sqlite/02_seed.sql
# OR via Prisma:
DATABASE_URL="file:./player_<userId>.db" \
  npx prisma migrate deploy --schema=prisma/sqlite/schema.prisma
```

## 5. Sync contract (high level — full code in Step 4)

- Mutations against per-user tables write to SQLite **and** push a row into `sync_queue`.
- A background worker drains `sync_queue` to the server's MySQL mirror via tRPC `sync.push`.
- `sync_meta.last_pulled_at` tracks the last catalog patch fetched per table.
- Conflicts resolved server-side (server wins on currency/inventory; client wins on cosmetic prefs).

## 6. Index strategy (carried from spec)

- Hot read keys (`inventory.user_id`, `user_quests.user_id+status`, `runs.user_id+status`) are indexed.
- Leaderboards: live reads via Redis ZSET (`lb:{mode}:{season_id}`); MySQL `leaderboards` is the nightly snapshot only.
- `chat_messages` and `audit_log`: B-tree on `created_at` for MVP; partitioning planned post-MVP.
