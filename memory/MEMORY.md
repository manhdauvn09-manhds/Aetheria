# AETHERIA - PROJECT MEMORY

> **Purpose**: Persistent memory file. If a session pauses/resumes, READ THIS FIRST.
> **Always update** this file at the end of every step or sub-task.

---

## Project Identity
- **Game name**: `Aetheria` (8 chars)
- **Genre**: Online Strategy + Exploration + Combat (Fantasy)
- **Target platform**: Web (browser) — desktop & mobile responsive
- **Output root (Linux)**: `/home/user/genz-web-games-factory/games/Aetheria/`
- **Output root (Windows mirror)**: `E:\SourceCode\GAMES\Aetheria\`
- **Git branch**: `claude/optimistic-fermat-Widt8`

## Folder Layout
```
games/Aetheria/
├── docs/        # design docs (md + pdf)
├── schedule/    # work breakdown, status, %
├── buglist/     # BugList.md (all bugs found)
├── memory/      # MEMORY.md (this file) + per-step notes
├── db/          # schema, migrations, seed scripts
├── src/         # source code (frontend + backend)
└── tests/       # unit + integration tests
```

## Step Status
| Step | Title                                          | Status      | %   |
|------|------------------------------------------------|-------------|-----|
| 1    | Game scenario + guideline (md+pdf)             | DONE        | 100 |
| 2    | Architecture, tech stack, DB design, flows     | DONE        | 100 |
| 3    | DB schema + scripts                            | DONE        | 100 |
| 4    | Coding (sub-schedule + phased)                 | NEXT        | 0   |
| 5    | Code review (maintainability/security/logic)   | PENDING     | 0   |
| 6    | Unit + Integration tests (C0=100%, C1>90%)     | PENDING     | 0   |
| 7    | Quality gate report (security + SEO)           | PENDING     | 0   |

## Tomorrow's First Actions (must read on resume)
1. ~~Pivot repo to `manhdauvn09-manhds/Aetheria`~~ ✅ done 30 Apr 2026.
   Baseline import committed at `f5aeb93` on branch `claude/create-project-structure-3uMmU`.
2. ~~Execute Step 3 (DB scripts)~~ ✅ done 30 Apr 2026 — see "Step 3 Outcome" below.
3. ~~Step 4.1: write the coding sub-schedule~~ ✅ done 30 Apr 2026 — see `schedule/STEP4_SUB_SCHEDULE.md` (65 sub-tasks 4.2–4.66 across 11 phases).
4. ~~Step 4.2: monorepo bootstrap~~ ✅ done 30 Apr 2026.
   - Root files: `package.json` (pnpm@9.12 + Node 22 + scripts), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (strict + `paths` for every workspace), `eslint.config.mjs` (flat config, ESLint 9 + typescript-eslint 8), `.prettierrc.json`/`.prettierignore`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.npmrc`, `.env.example`.
   - Empty `apps/` + `packages/` (with `.gitkeep`) ready for sub-task 4.3 onward.
   - **Not yet run**: `pnpm install` — deferred to first dev's local env (no lockfile committed yet; will be committed when 4.3 lands first real workspace package).
5. ~~Step 4.3: scaffold `packages/config` + `packages/shared-types`~~ ✅ done 30 Apr 2026.
   - `packages/config`: tsconfig presets (`base/library/node/nextjs/test`), eslint presets (`node/react/test`), Tailwind preset with realm + tier color tokens.
   - `packages/shared-types`: branded id types (`UserId`, `LevelId`, …), domain enum literals mirroring the DB discriminators, `Result<T,E>` helper, typed `ErrorCode` + HTTP-status map (runtime `AppError` class deferred to 4.6).
   - `pnpm install` ran successfully (Node 22.22, pnpm 9.12.3); `pnpm-lock.yaml` committed.
   - Smoke checks: `pnpm typecheck`, `pnpm lint`, `pnpm build` all green via Turborepo.
6. **NEXT — Step 4.4**: `packages/schema-db` — relocate `prisma/{mysql,sqlite}` under it, export typed Prisma clients + a `dbFactory(userId)` that opens the per-user SQLite file.

## Step 3 Outcome (30 Apr 2026)
**Architecture deviation from `docs/02_DATABASE_DESIGN.md`**: spec targets PostgreSQL 16 (single source of truth). Per user decision, we ship a **hybrid local-first** stack instead:

- **SQLite** — one file per player on the device. Holds personal play state (inventory, runs, save_states, user_characters/skills/quests, battle_pass_progress, local_profile) **plus** a read-only catalog cache so the game runs offline.
- **MySQL 8** — single shared instance. Master copy of every catalog, plus auth (`users`/`profiles`), social (`guilds`, `friendships`, `chat_messages`), competitive (`pvp_*`, `mmr`, `leaderboards`), and a server-side mirror of per-user state synced up from clients.
- **Sync direction**: catalog updates push MySQL → SQLite; per-user mutations queue in `sync_queue` and push SQLite → MySQL when online.

**Files added** (commit on `claude/create-project-structure-3uMmU`):
```
db/README.md                              architecture explainer
db/mysql/00_create_database.sql           MySQL DB + roles bootstrap
db/mysql/01_init.sql                      MySQL DDL (29 tables)
db/mysql/02_seed.sql                      minimal seed (5 realms, 8 chars, feature flags)
db/sqlite/01_init.sql                     SQLite DDL (catalog cache + per-user + sync infra)
db/sqlite/02_seed.sql                     primes sync_meta
prisma/mysql/schema.prisma                Prisma model for MySQL
prisma/mysql/migrations/migration_lock.toml
prisma/mysql/migrations/0001_init/migration.sql
prisma/sqlite/schema.prisma               Prisma model for SQLite
prisma/sqlite/migrations/migration_lock.toml
prisma/sqlite/migrations/0001_init/migration.sql
```

**Type translations** (Postgres → MySQL/SQLite): `bigserial` → `BIGINT AUTO_INCREMENT` / `INTEGER PK AUTOINCREMENT`; `citext` → `VARCHAR + utf8mb4_0900_ai_ci` / `TEXT COLLATE NOCASE`; `timestamptz` → `DATETIME(3)` / ISO-8601 `TEXT`; `jsonb` → `JSON` / `TEXT`; `bytea` → `VARBINARY(64)` / `BLOB`. Range partitioning for `chat_messages` and `audit_log` deferred to post-MVP migration.

**Open follow-ups** for Step 4 onward:
- Implement the `sync_queue` worker (push) and catalog `sync.pull` endpoint.
- Redis ZSET mirror for `leaderboards` (`lb:{mode}:{season_id}`).
- Partitioning migration (`chat_messages`, `audit_log`, `runs`) once MVP traffic data exists.
- Replace seed credentials in `db/mysql/00_create_database.sql` before deploy.

## Key Decisions
- Use TypeScript end-to-end (Next.js 15 + Node + tRPC) — to be confirmed in Step 2.
- 100 levels = data-driven (level definitions in DB / JSON), not 100 hand-coded files.
- 5–10 sample levels fully implemented; framework supports adding the rest.
- PDF generation: ReportLab (Python) on this Linux env. MD is canonical source.
- **DB stack (30 Apr 2026, supersedes spec)**: hybrid SQLite-per-user + shared MySQL 8, replacing the spec's single-Postgres design. Rationale: local-first play, offline tolerance, smaller server footprint. ORM = Prisma with two schemas (`prisma/mysql/`, `prisma/sqlite/`).

## Resume Checklist (next session)
1. Read this file.
2. Read `schedule/SCHEDULE.md` for current sub-task progress.
3. Read latest `docs/*.md` and `buglist/BugList.md`.
4. Continue from the next PENDING step.
