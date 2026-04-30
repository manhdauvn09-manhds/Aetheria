# AETHERIA — Database Design
*Step 2 · logical model · target: PostgreSQL 16 · DB name: `aetheria`*

> **Conventions**
> - Primary keys = `bigserial` unless noted.
> - All timestamps = `timestamptz`, default `now()`.
> - Soft delete = `deleted_at timestamptz NULL`.
> - JSONB for flexible / data-driven payloads.
> - Indexes documented inline; FKs `ON DELETE` chosen per relation semantics.

## 1. Entity Map (textual ERD)
```
users ──┬─< profiles
        ├─< user_characters >── characters
        │                         └─< character_skills >── skills
        ├─< user_skills >── skills
        ├─< inventory >── items
        ├─< runs >── levels >── realms
        ├─< save_states
        ├─< user_quests >── quests
        ├─< guild_members >── guilds
        ├─< pvp_match_players >── pvp_matches
        ├─< friendships
        ├─< chat_messages
        ├─< battle_pass_progress >── battle_pass_seasons
        └─< audit_log
leaderboards (materialized + Redis ZSET mirror)
```

## 2. Tables

### 2.1 Identity & Profile
**`users`**
| col | type | constraints | note |
|-----|------|-------------|------|
| id  | bigserial | PK | |
| email | citext | UNIQUE NOT NULL | |
| password_hash | text | NULL | argon2id; NULL if OAuth-only |
| oauth_provider | text | NULL | google/discord |
| oauth_subject | text | NULL | |
| email_verified_at | timestamptz | NULL | |
| status | text | NOT NULL DEFAULT 'active' | active/banned/suspended |
| created_at, updated_at, last_login_at | timestamptz | | |
| deleted_at | timestamptz | NULL | |

Indexes: `(oauth_provider, oauth_subject)`, `lower(email)`.

**`profiles`** — 1:1 with users
- user_id PK FK → users.id
- display_name (citext UNIQUE)
- avatar_url, country (iso2), language (bcp47)
- account_level int default 1, account_xp int default 0
- preferences jsonb default '{}'

### 2.2 Characters & Skills (master + ownership)
**`characters`** (catalog of 8 starters, expandable)
- id, codename UNIQUE, name, class, role, base_stats jsonb, art_url, lore text, unlock_requirement jsonb, version int

**`skills`**
- id, character_id FK → characters.id, name, type (active/passive), ap_cost int, cooldown int, effect jsonb, icon_url

**`character_skills`** — pivot of skill order per character
- character_id, skill_id, slot int (1..6) — PK(character_id, slot)

**`user_characters`** — user owns/levels chars
- id, user_id FK, character_id FK, ascension int default 0, xp int, equipped_skin_id FK NULL, unlocked_at
- UNIQUE(user_id, character_id)

**`user_skills`** — per-user skill investment
- user_id, skill_id, level int (1..10), unlocked_at — PK composite

### 2.3 World Content
**`realms`** — id, name, theme, color_hex, order_index
**`levels`**
- id, realm_id FK, level_number int (1..100 globally), name, type (story/combat/puzzle/treasure/boss/hidden/rift)
- map jsonb (hex grid)
- encounter jsonb (waves, enemies, AI)
- rewards jsonb
- difficulty int
- min_account_level int
- discovery_secrets jsonb
- version int
- UNIQUE(level_number)

### 2.4 Items & Inventory
**`items`** — id, name, tier (common/rare/epic/mythic/aetherforged), type (weapon/armor/relic/consumable/material), effect jsonb, icon_url, max_stack int
**`inventory`**
- id, user_id, item_id, quantity int, equipped_to_user_character_id NULL
- UNIQUE(user_id, item_id) (when stackable)

### 2.5 Runs / Save States
**`runs`** — a playthrough attempt of a level
- id, user_id, level_id, status (in_progress/completed/failed/abandoned)
- started_at, ended_at, score int, stars int (0..3)
- action_log jsonb (compact log for replay/anti-cheat)
- snapshot jsonb (final mid-state for resume)

**`save_states`**
- id, user_id, slot int (0..3), payload jsonb, schema_version int, updated_at
- UNIQUE(user_id, slot)

### 2.6 Quests / Battle Pass
**`quests`** — id, type (daily/weekly/seasonal/story), requirements jsonb, rewards jsonb, active_from, active_to
**`user_quests`** — user_id, quest_id, progress jsonb, status (active/completed/claimed), claimed_at — PK composite
**`battle_pass_seasons`** — id, name, starts_at, ends_at, tracks jsonb (free/premium per tier)
**`battle_pass_progress`** — user_id, season_id, tier int, premium boolean, xp int — PK composite

### 2.7 Social
**`guilds`** — id, name UNIQUE, tag (4 chars) UNIQUE, description, leader_user_id FK, level int, xp int, created_at
**`guild_members`** — guild_id, user_id, role (leader/officer/member), joined_at, contribution int — PK composite
**`friendships`** — user_id, friend_id, status (pending/accepted/blocked), created_at — PK(user_id, friend_id), friend_id < user_id rule via trigger or always store both
**`chat_messages`**
- id, channel_type (global/guild/party/whisper), channel_id (nullable for global), sender_id, content text, created_at, flagged boolean default false
- BRIN index on created_at; partition by month

### 2.8 PvP & Ranking
**`pvp_matches`**
- id, mode (1v1/3v3/raid), status, started_at, ended_at, winner_user_id NULL, region, server_seed bytea
**`pvp_match_players`**
- id, match_id FK, user_id FK, lineup jsonb (3 user_character_ids + items), score int, mmr_before int, mmr_after int, result (win/loss/draw)
**`mmr`** — user_id PK, mode PK, mmr int, peak_mmr int, season_games int, season_wins int
**`leaderboards`** — materialized table; primary mirror is Redis ZSET key `lb:{mode}:{season_id}` for live updates; nightly snapshot to this table.

### 2.9 Marketplace (cosmetic / soft-currency only)
**`shop_items`** — id, item_id FK, currency_type (gold/aether), price int, available_from, available_to, stock int NULL
**`transactions`** — id, user_id, shop_item_id, currency_type, amount int, status, created_at

### 2.10 System
**`audit_log`** — id, actor_user_id NULL, action text, target_type, target_id, payload jsonb, ip inet, user_agent text, created_at; partitioned monthly
**`feature_flags`** — key text PK, value jsonb, updated_by, updated_at
**`migrations`** — handled by Prisma

## 3. Indexing Strategy
- Hot read keys: `inventory(user_id)`, `user_quests(user_id, status)`, `runs(user_id, status)`.
- Leaderboard reads happen via Redis (ZRANGE), so no heavy SQL index on `mmr`.
- `chat_messages` partitioned monthly + BRIN on `created_at`.
- `audit_log` partitioned monthly.

## 4. Cardinality / Sizing Sketch (10 k DAU baseline)
- users / profiles: 100 k rows over year 1
- runs: 30 / DAU / day → ~9 M rows / month → partition `runs` monthly after MVP.
- chat_messages: 200 / DAU / day → ~60 M / month → partition mandatory.
- audit_log: ~5 M / month → partition.
- inventory: ~30 rows / user.

## 5. Data Retention
- chat_messages: 90 days then archive to R2 (parquet).
- audit_log: 1 year hot, then cold archive.
- runs: keep snapshots forever for top-100 replays; trim others to 30 days.
- pvp_matches: 1 season hot, archive after.

## 6. JSONB Schemas (high level — full schemas live in `packages/schema-db/json`)
- `levels.map` → `{ width, height, tiles:[{q,r,terrain,elev,fx}], spawns, exits }`
- `levels.encounter` → `{ waves:[{enemies:[...]}], boss?, scripts? }`
- `levels.rewards` → `{ xp, gold, items:[{itemId, qty}], firstClearBonus }`
- `runs.action_log` → array of `{ t, actor, type, data }` events
- `save_states.payload` → entire scene state + party + inventory delta

## 7. Naming
- Tables snake_case plural; PK `id`; FK `<entity>_id`.
- DB name: `aetheria`. Roles: `aetheria_app`, `aetheria_readonly`, `aetheria_migrator`.
