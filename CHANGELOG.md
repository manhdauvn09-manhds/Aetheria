# Aetheria — changelog

## Step 4 — Coding (closed 5 May 2026)

Step 4 covered all 65 sub-tasks (4.2–4.66) across 11 phases. The MVP is
playable single-player end-to-end and has the realtime + ranked
multiplayer loop wired. Production deploy is a dry-run (manifests +
Dockerfiles in `deploy/`); no environment is live yet.

### Final stats

- **Workspace packages**: 30 (24 domain + 1 web + 3 server apps + 1 worker + 1 config).
- **Tests**: 388 passing (vitest, repo-wide `pnpm -r test`).
- **Type / lint**: clean across the entire workspace.
- **Schema migrations**: 5 (`0001_init`, `0002_guild_invite`, `0003_mmr_glicko`, `0004_currency_balance`, `0005_notifications`).

### Phase rollup

| Phase | Theme                                       | Tasks    | Status |
| ----- | ------------------------------------------- | -------- | ------ |
| 4-A   | Foundation (monorepo, packages, contracts)  | 4.2–4.8  | ✅     |
| 4-B   | Auth & Account                              | 4.9–4.14 | ✅     |
| 4-C   | World, Save, Sync                           | 4.15–4.20| ✅     |
| 4-D   | Combat engine (pure domain)                 | 4.21–4.28| ✅     |
| 4-E   | Progression / Inventory / Quests / BP       | 4.29–4.35| ✅     |
| 4-F   | Social (guild / friends / chat + realtime)  | 4.36–4.42| ✅     |
| 4-G   | PvP (matchmaking, MMR, leaderboard, web)    | 4.43–4.48| ✅     |
| 4-H   | Marketplace, Notifications, Admin           | 4.49–4.52| ✅     |
| 4-I   | Workers / Cron                              | 4.53–4.57| ✅     |
| 4-J   | Frontend polish / PWA / i18n / telemetry    | 4.58–4.63| ✅     |
| 4-K   | Cut MVP & ship                              | 4.64–4.66| ✅     |

### Hand-off to Step 5 (code review)

Reviewers should focus on:

1. **Atomicity** — every privileged write path (`shop.purchase`,
   `pvp.match.complete`, `quest.claim`, `bp.claim`,
   `guild.create`/`promote`) sits inside a single Prisma `$transaction`.
   Verify rollbacks are clean under contention.
2. **Authentication boundary** — `protectedProcedure` enforces
   authenticated users; `adminProcedure` enforces the `admin` role; the
   realtime gateway re-verifies JWTs on every WS handshake.
3. **Audit trail** — every state-changing op writes to `audit_log`; the
   admin replay surface lets operators trace any action by `actor`,
   `action`, or `targetType`.
4. **Concurrency** — Redis SET-NX locks gate worker job execution;
   Glicko-2 MMR updates are inside the match-complete transaction; the
   PvP matchmaker uses ZADD/ZREM so a tick-overlap can't double-pair.
5. **Testing coverage** — pure-domain helpers (combat engine,
   progression curve, Glicko-2, leaderboard window, scene transitions,
   moderation rules, telemetry rules) have unit tests; integration tests
   are scaffolded via `pnpm e2e:smoke` (Fastify in-process inject) and
   need data fixtures + browser tests in Step 6.

### Known follow-ups (carry over to Step 5+)

- IndexedDB asset cache (4.59 deferred).
- Real OpenTelemetry SDK + Sentry SDK install (currently env-gated stubs).
- 3v3 PvP MMR application (currently 1v1 only).
- combat-domain validation inside the realtime PvP loop (currently
  turn alternation + match-id checks only).
- Replay-based anti-cheat verifier (currently score-outlier sweep).

### Repository entry points

- `apps/api`            — Fastify + tRPC, all domain routers mounted.
- `apps/realtime`       — Socket.IO gateway, chat + PvP fan-out.
- `apps/worker`         — pino + interval scheduler + Redis-locked jobs.
- `apps/web`            — Next.js 15 App Router, Tailwind, Zustand, tRPC.
- `packages/domain-*`   — pure-rules + service + tRPC router triplets.
- `packages/schema-db`  — Prisma + migrations (MySQL + SQLite).
- `packages/schema-api` — shared tRPC bindings + AppError types.
- `packages/core`       — audit, feature flags, i18n primitives, telemetry stubs.
