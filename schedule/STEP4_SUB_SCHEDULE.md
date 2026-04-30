# AETHERIA — Step 4 Coding Sub-Schedule
*Output of Step 4.1 · 30 Apr 2026*

> This document expands Step 4 from `SCHEDULE.md` into bite-sized tasks (`4.x`).
> Each task is sized to fit a **single session** (≈ ½–1 working day).
> Deliverables list is the contract: PR is "done" only when every box is ticked.
> Dependencies are explicit so tasks can be parallelised when the dep graph allows.

## Legend
- ⬜ pending · 🟨 in progress · ✅ done · ⚠️ blocked
- **Dep**: tasks that must complete before this one can start.
- **Size**: S (≤2 h), M (½ day), L (1 day), XL (>1 day → split further).
- **Slice**: vertical (touches client+server+db) or horizontal (one layer).

## Guiding Principles
1. **Vertical slices first.** Get *signup → tutorial level → autosave* working end-to-end before going wide.
2. **Domain packages are pure.** `domain-combat`, `domain-progression`, etc. import only `shared-types` — no Prisma, no Fastify, no Pixi.
3. **Server is authoritative.** Client predicts; server replays via the same `domain-combat` package and writes the canonical result.
4. **Hybrid DB contract** (from Step 3): per-user mutations write SQLite first + enqueue to `sync_queue`; catalog reads come from SQLite (cached) and are refreshed by `sync.pull`. The server's MySQL is the master.
5. **Test as you go.** Every domain package ships with unit tests in the same PR (Step 6 just adds integration coverage).

---

## Phase 4-A · Foundation (monorepo, packages, contracts)
*Goal: a builder runs `pnpm i && pnpm dev` and gets api+web booting against a local MySQL + a per-user SQLite. No game logic yet.*

| #   | Task                                                     | Slice | Size | Dep | Status |
|-----|----------------------------------------------------------|-------|------|-----|--------|
| 4.2 | Monorepo bootstrap: pnpm workspaces + Turborepo, root `package.json`, `tsconfig.base.json`, eslint/prettier config | horizontal | M | — | ✅ |
| 4.3 | `packages/config` — shared eslint/tsconfig/tailwind preset + `packages/shared-types` skeleton | horizontal | S | 4.2 | ✅ |
| 4.4 | `packages/schema-db` — wrap `prisma/mysql` + `prisma/sqlite`; export typed clients + a `dbFactory` that opens SQLite per user | horizontal | M | 4.2 | ✅ |
| 4.5 | `packages/schema-api` — tRPC root router skeleton + Zod helpers + error codes (`AppError`) | horizontal | M | 4.3 | ✅ |
| 4.6 | Cross-cutting utilities: `audit.write`, `featureFlag.isOn`, `i18n.t` stub, `errors` codes | horizontal | S | 4.5, 4.4 | ✅ |
| 4.7 | `apps/api` boot: Fastify + tRPC adapter + helmet + CORS + rate-limit + JWT verify hook | horizontal | M | 4.5 | ✅ |
| 4.8 | `apps/web` boot: Next.js 15 App Router + Tailwind + tRPC client + Zustand store skeleton | horizontal | M | 4.5 | ✅ |

## Phase 4-B · Auth & Account (vertical slice 1)
*Goal: a user can sign up, log in, log out, reset password. SQLite `local_profile` is created on first login.*

| #    | Task                                                                                              | Slice | Size | Dep         | Status |
|------|---------------------------------------------------------------------------------------------------|-------|------|-------------|--------|
| 4.9  | Auth domain (server): `signupWithEmail`, `loginWithEmail`, `refreshToken`, `logout` (argon2id, JWT 15 m / refresh 30 d in Redis) | vertical | L | 4.7 | ✅ |
| 4.10 | Auth: OAuth (Google, Discord) via NextAuth on web + server-side handler                           | vertical | M | 4.9, 4.8 | ✅ |
| 4.11 | Password reset + email verification (token in Redis, send via Resend stub)                        | vertical | M | 4.9 | ✅ |
| 4.12 | `account.getProfile/updateProfile/deleteAccount` (GDPR-compliant)                                  | vertical | M | 4.9 | ✅ |
| 4.13 | Web: signup / login / forgot-password screens, token storage (memory + httpOnly cookie)           | vertical | M | 4.10 | ✅ |
| 4.14 | Client SQLite bootstrap: open `player_<userId>.db`, run migrations, seed `local_profile` from server profile | vertical | M | 4.4, 4.12 | ✅ |

## Phase 4-C · World, Save, Sync (vertical slice 2 — single-player playable shell)
*Goal: a user can pick a level from realm 1, get a hex map rendered, autosave, close the tab, reopen and resume.*

| #    | Task                                                                                              | Slice | Size | Dep   | Status |
|------|---------------------------------------------------------------------------------------------------|-------|------|-------|--------|
| 4.15 | `packages/game-assets` — 8 sample levels (1 per realm + 3 extras) defined as JSON matching `levels.map/encounter/rewards` schemas | horizontal | L | 4.3 | ✅ |
| 4.16 | World service: `realms()`, `levelsForRealm`, `startLevel`, `resumeRun`, `abandonRun`              | vertical | M | 4.7, 4.4 | ✅ |
| 4.17 | Save service (server): `snapshot/list/load/delete/autosaveTick/reconcile` with slot 0–3 + version check | vertical | L | 4.7, 4.4 | ✅ |
| 4.18 | Sync engine (client): drain `sync_queue` → tRPC `sync.push`; pull catalog patches via `sync.pull`; record in `sync_meta` | horizontal | L | 4.4, 4.17 | ✅ |
| 4.19 | Web: hex map renderer (PixiJS 8) reading `levels.map` JSON; camera + tile click events             | vertical | L | 4.8, 4.15 | ✅ |
| 4.20 | Web: MainMenu → Realm picker → Level picker → InGame state machine (matches `02_FLOWS.md` §10)    | vertical | M | 4.19, 4.16 | ⬜ |

## Phase 4-D · Combat Engine (pure domain)
*Goal: a deterministic, pure-TS combat engine reusable by client (prediction) and server (authority).*

| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.21 | `packages/domain-combat` — types: `BattleState`, `Action`, `Event`, `Actor`, `Tile`, deterministic seeded RNG | horizontal | M | 4.3 | ⬜ |
| 4.22 | Combat helpers: `apCost`, `lineOfSight`, `rangeReachable`, `elementAdvantage`, `resonanceCheck` (+ unit tests) | horizontal | M | 4.21 | ⬜ |
| 4.23 | `combat.createBattle` + `combat.applyAction(state, action)` with event emission             | horizontal | L | 4.22 | ⬜ |
| 4.24 | `combat.endTurn`, `combat.checkVictory`, status-effect ticking                              | horizontal | M | 4.23 | ⬜ |
| 4.25 | `combat.serializeState` / `combat.hydrate` (stable JSON, schema_version)                    | horizontal | S | 4.23 | ⬜ |
| 4.26 | Combat replay: `replayActions(action_log) → finalState` (used by anti-cheat worker)         | horizontal | S | 4.23 | ⬜ |
| 4.27 | Wire combat into Run flow (server): server validates each `combat.submitAction` → updates `runs.action_log` + `snapshot` | vertical | L | 4.23, 4.16 | ⬜ |
| 4.28 | Web: combat scene (PixiJS) — render actors/tiles, animate events, optimistic apply + reconcile on checksum mismatch | vertical | L | 4.27, 4.19 | ⬜ |

## Phase 4-E · Progression / Inventory / Quests / Battle Pass
*Goal: defeating enemies grants XP, levels up characters, fills daily quests, advances battle pass.*

| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.29 | `packages/domain-progression` — `xp(n) = floor(50 * n^1.85)`, `checkLevelUp`, milestone unlocks (5/10/15/25/40/60/80/100) | horizontal | M | 4.3 | ⬜ |
| 4.30 | Roster & Skills service: `roster.list/unlockCharacter/ascend/equipSkin`, `skills.tree/invest/respec` | vertical | L | 4.7, 4.29 | ⬜ |
| 4.31 | Inventory service: `list/grant/consume/equip/craft` (server-authoritative; client mirrors)  | vertical | M | 4.7, 4.4 | ⬜ |
| 4.32 | Domain event bus (in-process): `LeveledUp`, `EnemyDefeated`, `LevelCompleted`, `ItemCrafted`, `RunFinished` | horizontal | S | 4.6 | ⬜ |
| 4.33 | Quests service: `dailyForUser/weeklyForUser/progress(event)/claim` with the event bus       | vertical | L | 4.32, 4.31 | ⬜ |
| 4.34 | Battle pass service: `currentSeason/progress/claim`                                        | vertical | M | 4.32 | ⬜ |
| 4.35 | Web: Roster screen, Skill tree screen, Quest tracker HUD, Battle Pass screen                | vertical | L | 4.30, 4.33 | ⬜ |

## Phase 4-F · Social (guild / friends / chat)
*Goal: guilds with roster + chat channel; friends list with requests; global / guild chat.*

| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.36 | `packages/domain-social` — moderation rules (profanity list, rate limits, mute window)      | horizontal | S | 4.3 | ⬜ |
| 4.37 | Guild service: create / invite / respond / kick / promote / startRaid                      | vertical | L | 4.7, 4.36 | ⬜ |
| 4.38 | Friends service: list / request / respond                                                  | vertical | M | 4.7 | ⬜ |
| 4.39 | Chat service: `send/history/report`; flagged-message audit                                 | vertical | M | 4.7, 4.36 | ⬜ |
| 4.40 | `apps/realtime` boot: Socket.IO + Redis adapter + sticky session helper                    | horizontal | M | 4.7 | ⬜ |
| 4.41 | Realtime chat channels (global / guild / party / whisper) via Socket.IO rooms              | vertical | M | 4.40, 4.39 | ⬜ |
| 4.42 | Web: Guild screen, Friends screen, Chat panel                                              | vertical | L | 4.37, 4.38, 4.41 | ⬜ |

## Phase 4-G · PvP & Leaderboards
*Goal: 1v1 ranked match end-to-end, MMR updates, leaderboard reflects winner.*

| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.43 | Matchmaking: `pvp.queue/cancelQueue` writing to Redis ZSET; matcher loop with widening bracket | vertical | L | 4.40 | ⬜ |
| 4.44 | Match lifecycle: `pvp_matches` row on found, room creation, `pvp.match` query              | vertical | M | 4.43, 4.27 | ⬜ |
| 4.45 | Realtime PvP turns: action validation via `domain-combat`, event broadcast, forfeit on heartbeat miss | vertical | L | 4.44 | ⬜ |
| 4.46 | MMR (Glicko-2): `mmr.get/update`; post-match write to `mmr` table + `pvp_match_players`    | vertical | M | 4.45 | ⬜ |
| 4.47 | Leaderboards: `lb.recordResult` → Redis ZSET `lb:{mode}:{season_id}`; `lb.top/aroundUser`   | vertical | M | 4.46 | ⬜ |
| 4.48 | Web: PvP queue UI, in-match HUD, post-match summary, leaderboard screen                    | vertical | L | 4.45, 4.47 | ⬜ |

## Phase 4-H · Marketplace, Notifications, Admin
| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.49 | Shop service: `catalog/purchase/history` (transactional, currency check, audit write)      | vertical | M | 4.31 | ⬜ |
| 4.50 | `packages/domain-economy` — currency rules, price computation, refund window               | horizontal | S | 4.3 | ⬜ |
| 4.51 | Notifications service: `notify.list/markRead/push`; in-app dropdown                        | vertical | M | 4.32 | ⬜ |
| 4.52 | Admin tools: `admin.banUser/grantItem/featureFlag.set/replay` + minimal admin UI            | vertical | L | 4.49, 4.51 | ⬜ |

## Phase 4-I · Workers / Cron
| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.53 | `apps/worker` boot: BullMQ + Redis connection                                              | horizontal | S | 4.7 | ⬜ |
| 4.54 | `cron.dailyReset`, `cron.weeklyReset`, `cron.seasonReset`                                   | horizontal | M | 4.53, 4.33 | ⬜ |
| 4.55 | `worker.antiCheatScan` — replay `runs.action_log` via `combat.replayActions`, flag mismatches | horizontal | M | 4.53, 4.26 | ⬜ |
| 4.56 | `worker.leaderboardSnapshot` hourly — copy Redis ZSET top-N to `leaderboards` table          | horizontal | S | 4.53, 4.47 | ⬜ |
| 4.57 | `worker.guildRaidScheduler` — weekly                                                        | horizontal | S | 4.53, 4.37 | ⬜ |

## Phase 4-J · Frontend polish, PWA, i18n, telemetry
| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.58 | Game state machine (`02_FLOWS.md` §10) wired across menus / hub / combat / pause            | vertical | M | 4.20, 4.28 | ⬜ |
| 4.59 | PWA: service worker, asset manifest precache, IndexedDB asset cache                        | horizontal | M | 4.8 | ⬜ |
| 4.60 | i18n: `i18n.t` with namespace files; bootstrap en + vi                                     | horizontal | S | 4.6 | ⬜ |
| 4.61 | Telemetry: `telemetry.event` (client batches → server sink); core funnels: signup → tutorial → lvl5 → lvl25 | horizontal | M | 4.7 | ⬜ |
| 4.62 | OpenTelemetry tracing wiring on api + realtime + worker                                    | horizontal | M | 4.7, 4.40, 4.53 | ⬜ |
| 4.63 | Sentry integration (web + node)                                                            | horizontal | S | 4.8, 4.7 | ⬜ |

## Phase 4-K · Cut MVP & ship
| #    | Task                                                                                       | Slice | Size | Dep | Status |
|------|--------------------------------------------------------------------------------------------|-------|------|-----|--------|
| 4.64 | E2E smoke: signup → tutorial → first level cleared → autosave → resume → claim daily quest | vertical | M | most of 4-B..4-E | ⬜ |
| 4.65 | Deployment dry-run: docker-compose for local; Fly.io / Vercel manifests                     | horizontal | M | 4.7, 4.40, 4.53, 4.8 | ⬜ |
| 4.66 | Hand-off to Step 5 (code review): generate PR list / changelog                              | horizontal | S | all above | ⬜ |

---

## Critical Path (shortest route to a "playable demo")
```
4.2 → 4.3 → 4.4 → 4.5 → 4.7 → 4.8
        └→ 4.9 → 4.13 → 4.14
                          └→ 4.15 → 4.16 → 4.17 → 4.19 → 4.20
                                                    └→ 4.21..4.28
```
Roughly **22 tasks → first playable demo**. The remaining 40+ tasks layer on social, PvP, polish.

## Parallelisation Hints
- After 4.5/4.6 land, **4.7 and 4.8 run in parallel** (different repos).
- Combat package (4.21–4.26) is pure domain → can be developed in parallel with 4-B/C as long as `shared-types` is stable.
- Phase 4-F (social) and 4-G (PvP) share the realtime infra (4.40); ship 4.40 once and fork.

## Bug counter (carry-forward to BugList)
- Discovered during 4.x: 0
- Fixed: 0

## Resume checklist (next session)
1. Read this file (Step 4 sub-schedule).
2. Read `memory/MEMORY.md` for cross-cutting decisions.
3. Pick the lowest-numbered ⬜ task whose deps are ✅; flip to 🟨; commit at the end.
