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
6. ~~Step 4.4: `packages/schema-db`~~ ✅ done 30 Apr 2026.
   - Moved `prisma/{mysql,sqlite}` → `packages/schema-db/prisma/{mysql,sqlite}` (`git mv`, history preserved).
   - Generator outputs now land at `packages/schema-db/src/generated/{mysql,sqlite}` (gitignored via `**/generated`).
   - `src/mysql.ts`: HMR-safe singleton (`globalThis` cache) + `disconnectMysql()`.
   - `src/sqlite.ts`: `sqliteFor(userId)` / `openSqliteAt(path)` / `closeSqliteFor(userId)` / `closeAllSqlite()`. Per-user files default to `.dev/sqlite/player_<userId>.db` (override via `AETHERIA_SQLITE_DIR`).
   - Root scripts now delegate: `pnpm db:generate / db:migrate:mysql / db:migrate:sqlite / db:studio:*`.
   - Smoke: `pnpm install` + `pnpm db:generate` + `pnpm typecheck` + `pnpm lint` + `pnpm build` all green.
7. ~~Step 4.5: `packages/schema-api`~~ ✅ done 30 Apr 2026.
   - `src/errors.ts`: runtime `AppError` class with factories (`notFound`, `unauthenticated`, `forbidden`, `validation`, `conflict`, `staleVersion`, `insufficientCurrency`, `insufficientLevel`, `itemOutOfStock`, `questNotReady`, `alreadyClaimed`, `invalidAction`, `internal`, `notImplemented`, …) + `toTRPCError()` adapter mapping HTTP status → tRPC code (with 402/503 folded onto BAD_REQUEST/INTERNAL_SERVER_ERROR since tRPC's enum is narrower).
   - `src/trpc.ts`: tRPC v10 instance with `superjson` transformer + custom `errorFormatter` that surfaces `AppError.toJSON()` payloads under `data.app` so the web client can pattern-match on `code`. Exports `router`, `mergeRouters`, `middleware`, `publicProcedure`, `protectedProcedure`, `adminProcedure`, `throwAsTrpc`.
   - `src/context.ts`: `BaseContext` / `AuthedContext` / `RequestInfo` types — concrete factory lives in `apps/api` (4.7).
   - `src/zod-helpers.ts`: branded-id schemas for every entity (accept `bigint|number|string`, emit branded `bigint`), email/displayName/guildTag/password validators, paginationInput, dateRangeInput, jsonValue, all 19 domain enum schemas.
   - `src/routers/health.ts`: `ping`, `echo`, `whoami` smoke procedures.
   - `src/router.ts`: root `appRouter` (only `health` mounted; sub-routers added in 4-B onward).
   - **Schema fix carried over**: `shared-types/brands.ts` was switched from `unique symbol` brand to a string-tagged brand so branded types can be re-exported through Zod schemas without TS4023 declaration errors.
   - Smoke: `pnpm typecheck`, `pnpm lint`, `pnpm build` all green.
8. ~~Step 4.6: cross-cutting utilities~~ ✅ done 30 Apr 2026 — new package `@aetheria/core`.
   - `src/audit.ts`: `audit.write({ actor, action, targetType, targetId, payload, ip, userAgent })` → INSERT into MySQL `audit_log`. Errors swallowed (logged to stderr) so a missed audit never fails the originating request.
   - `src/feature-flag.ts`: `featureFlag.isOn(key, userId?)` → MySQL `feature_flags` with TTL cache (default 60 s, override `AETHERIA_FF_CACHE_MS`). Supports percentage rollout via `{ enabled: true, rollout: 25 }` using stable FNV-1a bucket of `${key}:${userId}`. Plus `featureFlag.invalidate(key?)` for admin / tests.
   - `src/i18n.ts`: in-memory bundles for `en` + `vi`, dot-namespaced keys, `{var}` interpolation, fallback chain locale → default → key. `setLocale/getLocale/addBundle/locales/t`. Real i18n library deferred to Phase 4-J.
   - Smoke: typecheck 7/7, lint 5/5, build 4/4. Phase 4-A is now 100% complete.
9. ~~Step 4.7: `apps/api` boot~~ ✅ done 30 Apr 2026 — first runnable workspace.
   - `src/env.ts`: Zod-validated env loader (`API_HOST/PORT`, `CORS_ORIGIN`, `RATE_LIMIT_*`, `JWT_SECRET/REFRESH_SECRET/ISSUER/AUDIENCE`, `DATABASE_URL_MYSQL`). Throws with itemised path/message on miss.
   - `src/auth/jwt.ts`: `verifyAccessToken(token, cfg)` using `jose` (HS256, iss/aud check). Maps jose errors → `AppError.unauthenticated(...)`. Sign helpers deferred to 4.9.
   - `src/context.ts`: `buildContextFactory(env)` returns a `(req) => BaseContext` — populates `auth` if a valid Bearer token present, else `null` (public procedures still work).
   - `src/plugins.ts`: `@fastify/helmet` (CSP off in dev), `@fastify/cors` (configurable origin list, credentials on), `@fastify/rate-limit` (per-token-or-IP key, allowlist `/health`, app-shaped error response).
   - `src/server.ts`: `buildServer(env)` factory — pino logger (pretty in dev), x-request-id with crypto.randomUUID, trustProxy, 1 MiB body limit, mounts `appRouter` from `@aetheria/schema-api` at `/trpc`, `/health` REST probe.
   - `src/index.ts`: boot + SIGINT/SIGTERM graceful shutdown.
   - `.env.example` extended with API_* / CORS / RATE_LIMIT / JWT_ISSUER / JWT_AUDIENCE.
   - **Smoke**: typecheck 10/10, lint 6/6, build 5/5; live boot via `tsx` confirmed `GET /health`, `GET /trpc/health.ping`, `GET /trpc/health.whoami` all return 200 with superjson payloads.
   - **Note for Step 4.8**: workspace packages still resolve to `src/*.ts` (no built dist). Running `node dist/index.js` directly fails because dependent packages are TS-source only. Dev path is `pnpm dev` (tsx). Production bundling is a 4-K concern.
10. ~~Step 4.8: `apps/web` boot~~ ✅ done 30 Apr 2026 — second runnable workspace.
    - `apps/web/package.json`: Next 15.0.3, React 18.3, Tailwind 3.4, tRPC v10 (client + react-query + next), `@tanstack/react-query@^4.36.1` (peer-pinned for tRPC v10), Zustand 5, Zod 3.23, superjson 2.2.
    - `next.config.mjs`: `reactStrictMode`, `poweredByHeader: false`, `typedRoutes: true` (top-level — moved out of `experimental` in Next 15), `transpilePackages: ["@aetheria/schema-api","@aetheria/shared-types"]` so workspace TS source is bundled by Next.
    - `tsconfig.json`: extends `@aetheria/config/tsconfig/nextjs`, adds `@/*` → `src/*` path alias.
    - `tailwind.config.cjs`: pulls `@aetheria/config/tailwind/preset` (realm + tier color tokens, font slots, breakpoints).
    - `eslint.config.mjs`: layers `@aetheria/config/eslint/react`; ignores `.next/**` + `next-env.d.ts`.
    - `src/lib/env.ts`: Zod-validated client env (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`).
    - `src/lib/trpc/{shared,client,server}.ts`: shared URL/transformer/header builder; `trpc = createTRPCReact<AppRouter>()` for client components; `serverTrpc` proxy client (`createTRPCProxyClient` + `httpBatchLink`) for Server Components — calls API over HTTP so middleware runs uniformly.
    - `src/store/session.ts`: Zustand store with `persist` middleware (localStorage key `aetheria.session.v1`). Holds `user` + `tokens` (access/refresh + expiry) and exposes `setSession/clearSession/isAuthenticated`. Hydrate-from-refresh-token flow lands in 4.13.
    - `src/app/`: `layout.tsx` (root), `providers.tsx` (`'use client'` — QueryClient + tRPC Provider, batch link reads access token from session store), `page.tsx` (Server Component, `dynamic = "force-dynamic"`, calls `serverTrpc.health.ping.query()` and renders status box; falls back to error box if API unreachable), `globals.css` (Tailwind + dark base).
    - **Important**: web's intra-app imports do NOT use `.js` extensions (Next/webpack doesn't rewrite them); workspace package imports work via `transpilePackages`.
    - `.env.example` extended with `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL`.
    - **Smoke** (30 Apr 2026): typecheck 11/11, lint 7/7, build 6/6 (web bundle: route `/` is dynamic ƒ, ~123 B + 102 kB shared JS). Live SSR confirmed: API on `:3000` + web `next start` on `:3001` → `GET /` returns 200 with rendered `/trpc/health.ping ok · 2026-04-30T07:04:40.464Z`.
11. ~~Step 4.9: auth domain (server)~~ ✅ done 30 Apr 2026 — first vertical slice begins.
    - **New package** `@aetheria/domain-auth`:
      - `src/password.ts`: argon2id via `@node-rs/argon2` (prebuilt native — no compile step). Params: m=19 MiB, t=2, p=1 (OWASP 2024 low-memory). `algorithm: 2 as const` to avoid the lib's const-enum collision with `isolatedModules`.
      - `src/tokens.ts`: `signAccessToken` / `signRefreshToken` / `issueTokenPair` / `verifyRefreshToken` via `jose` HS256. Two distinct secrets (`JWT_SECRET` vs `JWT_REFRESH_SECRET`) — leaking either doesn't compromise the other. Refresh tokens carry a `jti` so the server can revoke them. Defaults: 15 min access / 30 d refresh.
      - `src/refresh-store.ts`: `RefreshTokenStore` interface (`put/get/revoke/revokeAllForUser`). Two impls: `inMemoryRefreshStore()` for tests / dev (Map-backed; restarts wipe state) and `redisRefreshStore(redis)` (keys `refresh:{jti}` with TTL + `refresh:user:{uid}` SET for bulk revocation).
      - `src/service.ts`: `AuthService` with the four flows. `signupWithEmail` runs in a Prisma transaction (email + displayName uniqueness checked, user + profile created together). `loginWithEmail` enforces generic "Invalid email or password" so attackers can't enumerate. `refreshToken` rotates: revokes old jti, issues fresh pair. `logout` is best-effort (tolerates already-invalid tokens). All flows write to `audit_log` via `@aetheria/core/audit`.
      - `src/router.ts`: `createAuthRouter(service)` factory returning a tRPC sub-router (4 mutations: `signupWithEmail`, `loginWithEmail`, `refreshToken`, `logout`). Inputs validated with `emailSchema`/`passwordSchema`/`displayNameSchema` from `@aetheria/schema-api/zod`.
    - **Composition shift**: dropped `appRouter`/`AppRouter` from `@aetheria/schema-api` (now exports `healthRouter` building block + `zod` helpers + tRPC primitives + AppError). Composed `appRouter` lives in `apps/api/src/router.ts` via `createAppRouter({ authService })`. `AppRouter` type is exported from `@aetheria/api/router` (new exports map entry on apps/api package.json). `apps/web` updated to `import type { AppRouter } from "@aetheria/api/router"` — type-only, so the runtime/native-binding code (jose, ioredis, @node-rs/argon2, prisma) never crosses into the browser bundle.
    - `apps/api/src/auth/build.ts`: at boot, picks Redis store if `REDIS_URL` is set (lazy connect, retries=3), else in-memory. Returns `{ service, redis }`; server registers an `onClose` hook to `redis.quit()` on shutdown.
    - `apps/api/src/env.ts` extended with optional `REDIS_URL`.
    - **Smoke** (30 Apr 2026):
      - `pnpm typecheck` 14/14, `pnpm lint` 8/8, `pnpm build` 7/7.
      - Live boot via `tsx`. With no DB / no Redis: `GET /health` 200, `GET /trpc/health.ping` 200, `POST /trpc/auth.logout` (junk token) → `{ok:true}` (best-effort), `POST /trpc/auth.refreshToken` (bad sig) → 401 `data.app.code=UNAUTHENTICATED`, `POST /trpc/auth.signupWithEmail` (bad inputs) → 400 `data.app.code=VALIDATION_FAILED` with field-level Zod issues.
12. ~~Step 4.10: OAuth (Google + Discord)~~ ✅ done 30 Apr 2026.
    - `domain-auth/src/oauth.ts`: `verifyGoogleIdToken(idToken, clientId)` via `jose` + Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`); `verifyDiscordAccessToken(accessToken)` via `https://discord.com/api/v10/users/@me` (5 s `AbortSignal.timeout`). Both return a normalized `OAuthIdentity { provider, providerSubject, email, emailVerified, displayName }`.
    - `AuthService` extended with `loginWithGoogleIdToken` / `loginWithDiscordAccessToken` (each verifies then delegates to the private `loginWithOAuthIdentity` flow).
    - Find/link/create flow:
      - Match by `(oauth_provider, oauth_subject)` → existing link → audit `auth.oauth.login`.
      - Else, if `email_verified`, match by email → set `oauth_provider`/`oauth_subject` and `email_verified_at` → audit `auth.oauth.link`. Conflict if the row already has a different provider linked.
      - Else, fresh signup in a transaction. `pickUniqueDisplayName` derives a base from the OAuth display hint (or the email local-part), sanitizes against `displayNameSchema`'s charset, and tries `base`, `base_2`, … up to 100, then a 6-digit random tail. Audit `auth.oauth.signup`.
    - `AuthSessionResult.user` now also carries `oauthProvider: "google" | "discord" | null`.
    - tRPC: `auth.loginWithGoogle({idToken})` / `auth.loginWithDiscord({accessToken})` mutations added under the `auth` router.
    - `apps/api/src/env.ts`: `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET` (all optional). `auth/build.ts` only enables a provider's tRPC mutation if its `CLIENT_ID` is set — otherwise the procedure surfaces `NOT_IMPLEMENTED`.
    - **schema-api**: `throwAsTrpc` (which threw internally) replaced by `asTrpcError` that *returns* a `TRPCError` so callers do `throw asTrpcError(e)`. This unblocks return-type inference for resolvers.
    - `apps/web` NextAuth wiring:
      - `next-auth@^4.24` added; `src/app/api/auth/[...nextauth]/route.ts` mounts the catch-all handler.
      - `src/lib/auth/options.ts`: NextAuth `jwt` callback calls `auth.loginWithGoogle` / `auth.loginWithDiscord` on the API and stashes our access/refresh tokens on the JWT. `session` callback exposes `aetheriaUser` + `aetheriaTokens` to the browser. UI to actually trigger sign-in is owned by Step 4.13.
      - `src/lib/env.ts` split into public vs server-only env. NextAuth secrets validated lazily; Next's build-time route-metadata pass tolerates missing values (`secret` falls back to a clearly-marked DEV placeholder until a real value is set at runtime).
      - `transpilePackages` unchanged — NextAuth callbacks live entirely server-side.
    - `.env.example`: OAuth fields un-commented; `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_OAUTH_GOOGLE`, `NEXT_PUBLIC_OAUTH_DISCORD` added.
    - **Smoke** (30 Apr 2026):
      - `pnpm typecheck` 14/14, `pnpm lint` 8/8, `pnpm build` 7/7 — `apps/web` route table now lists `ƒ /api/auth/[...nextauth]` next to `ƒ /`.
      - Live boot. `auth.loginWithGoogle` (junk JWT) → 401 `UNAUTHORIZED` "Google identity verification failed". `auth.loginWithDiscord` (junk token) → 401 `UNAUTHORIZED` "Discord identity verification failed" (after Discord's API replies 401).
13. ~~Step 4.11: password reset + email verification~~ ✅ done 30 Apr 2026.
    - `domain-auth/token-store.ts`: `OneShotTokenStore` — `put` + atomic `take(purpose, token)` (uses Redis `GETDEL`). Two impls: `inMemoryOneShotStore()` for tests / dev, `redisOneShotStore(redis)` keyed `oneshot:{purpose}:{token}` with TTL. `generateOneShotToken()` returns 32-byte base64url (≈256 bits entropy).
    - `domain-auth/mailer.ts`: `Mailer.send({to, subject, text})` interface with `consoleMailer()` (logs to stderr — dev default) and `resendMailer({apiKey, from})` stub (POST `https://api.resend.com/emails`, 10 s timeout, errors logged + swallowed so the originating request isn't punished for a transient mailer outage).
    - `AuthService` extended with four flows:
      - `requestPasswordReset({email, ip?, ua?})` — generic `{ok:true}` regardless of email existence (no enumeration). On match (active, has password) mints token (default TTL 1 h), persists, mails reset link + audits `auth.password_reset.request`.
      - `confirmPasswordReset({token, newPassword, ip?, ua?})` — atomic `take`, hashes new password (argon2id), updates row, calls `refreshStore.revokeAllForUser(userId)` so all existing sessions die. Audits `auth.password_reset.confirm`.
      - `requestEmailVerification({userId, ip?, ua?})` — protectedProcedure boundary. Already-verified users get a generic `{ok:true}` (idempotent). Otherwise mints token (default TTL 24 h), persists with `meta.email`, mails the link + audits `auth.email_verification.request`.
      - `confirmEmailVerification({token})` — atomic `take`, sets `email_verified_at = now()`, audits `auth.email_verification.confirm`.
    - Internal `resolvePasswordResetDeps()` / `resolveEmailVerificationDeps()` helpers narrow optional deps into a typed bundle in one place — surfaces `NOT_IMPLEMENTED` when the service was instantiated without the relevant deps.
    - `appendTokenQuery(base, token)` appends `?token=…` (or `&token=…`) to the configured front-end redirect URL.
    - tRPC: `auth.requestPasswordReset` / `auth.confirmPasswordReset` / `auth.requestEmailVerification` (protected) / `auth.confirmEmailVerification` mutations.
    - `apps/api/src/auth/build.ts`: wires the new deps. Picks `redisOneShotStore` if `REDIS_URL`, else in-memory. Picks `resendMailer` if `RESEND_API_KEY`, else `consoleMailer` (dev). Reads `PASSWORD_RESET_URL` / `EMAIL_VERIFICATION_URL` (defaults to `localhost:3001/{reset-password,verify-email}`).
    - `apps/api/src/env.ts` extended: `RESEND_API_KEY?`, `MAIL_FROM` (default `noreply@aetheria.local`), `PASSWORD_RESET_URL`, `EMAIL_VERIFICATION_URL`.
    - `.env.example` extended with the new mailer fields.
    - **Smoke** (30 Apr 2026): typecheck 14/14, lint 8/8, build 7/7. Live: `auth.confirmPasswordReset` (junk token) → 401 `UNAUTHENTICATED` "Reset token invalid or expired"; `auth.confirmEmailVerification` (junk token) → 401 "Verification token invalid or expired"; `auth.requestEmailVerification` (no Bearer) → 401 "Authentication required" (protectedProcedure middleware kicks).
14. ~~Step 4.12: account domain~~ ✅ done 30 Apr 2026.
    - **New package** `@aetheria/domain-account`. Re-uses the `AuthMysqlClient` shape + `RefreshTokenStore` from `@aetheria/domain-auth`, so deleteAccount can revoke active sessions.
    - `AccountService` methods:
      - `getProfile(userId)` → `{ user: {id, email, emailVerifiedAt, oauthProvider, status, createdAt, lastLoginAt}, profile: {displayName, avatarUrl, country, language, accountLevel, accountXp, preferences, createdAt, updatedAt} }`. 404 on deleted users; preferences coerced to a plain object via `prefsAsObject`.
      - `updateProfile(input)` — partial PATCH semantics. Empty patch returns current state without writing. Display-name uniqueness re-checked when changed. Builds a `MysqlPrisma.Prisma.ProfileUpdateInput` from only the supplied fields. Audits `account.profile.update` with the field list.
      - `deleteAccount(input)` — GDPR-compliant soft delete:
        - Validates `confirmText` against `"DELETE"` or the user's email (case-insensitive).
        - For password-bearing accounts, requires `currentPassword` and verifies it.
        - In a transaction: sets `users.status="deleted"`, `deletedAt=now()`, scrubs PII (`email = "deleted-{id}@aetheria.invalid"`, `passwordHash=null`, `oauthProvider=null`, `oauthSubject=null`, `emailVerifiedAt=null`); resets profile (`displayName="deleted_{id}"`, all optional fields cleared).
        - Calls `refreshStore.revokeAllForUser(userId)` so every session dies.
        - Audits `account.delete` with `{method: "password" | "session"}`.
        - Hard-delete is intentionally NOT performed because too many tables FK to `user.id`; a separate offline job can purge `users.deletedAt < now() - 30d` rows.
    - tRPC router (`createAccountRouter(service)`): `getProfile` (query, protected), `updateProfile` (mutation, protected, refines "at least one field"), `deleteAccount` (mutation, protected). Mounted at `account.*` in apps/api root router.
    - `apps/api/src/auth/build.ts` now exposes `refreshStore` on `AuthBundle` so `apps/api/src/server.ts` can construct `AccountService` with the same store as `AuthService`.
    - `tsconfig.base.json` paths extended for `@aetheria/domain-account`.
    - **Smoke** (30 Apr 2026): typecheck 16/16, lint 9/9, build 8/8. Live (no DB): all three procedures gate on `protectedProcedure` → 401 "Authentication required" without a Bearer. With a self-signed access token: `account.updateProfile` empty body → 400 VALIDATION_FAILED "At least one field must be provided"; `account.deleteAccount` missing `confirmText` → 400 VALIDATION_FAILED "Required".
15. **NEXT — Step 4.13**: web auth UI (signup / login / forgot-password screens, token storage memory + httpOnly cookie). Closes Phase 4-B end-to-end.

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
