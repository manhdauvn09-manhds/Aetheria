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
15. ~~Step 4.13: web auth UI~~ ✅ done 30 Apr 2026.
    - **Token storage**: access in memory (Zustand `access` field, never persisted); refresh in httpOnly cookie `aetheria_refresh` set by Next API routes (Path=/, HttpOnly, SameSite=Lax, Secure in production, Max-Age = TTL). User hint persists to localStorage so a reload shows "appears logged in" while the refresh round-trip resolves.
    - **`apps/web/src/store/session.ts`** rewritten: `SessionUser = {id, email, displayName, roles, oauthProvider}`, `AccessToken = {value, expiresAt}`. Methods `setSession / setAccess / setUser / clearSession / isAuthenticated`. `partialize` only persists `user`. Storage key bumped to `aetheria.session.v2`.
    - **`apps/web/src/lib/auth/proxy.ts`**: server-side tRPC client (`apiClient()`), `proxyErrorFor(e)` translating `TRPCClientError` → `{status, body:{code, message, details?}}`, `buildRefreshCookie(token, {expiresAt})` / `buildClearRefreshCookie()` (Secure flag toggled by `NODE_ENV`), `sessionResponseFromTrpc(trpcRes)` normalizing the API result for the browser.
    - **`apps/web/src/lib/auth/client.ts`**: `postJSON<T>(url, body)` + `AuthApiError` (status + parsed body). Sends `credentials: "same-origin"` so the httpOnly cookie travels.
    - **Next API routes** under `apps/web/src/app/api/auth/`:
      - `signup/route.ts`, `login/route.ts` — call `auth.signupWithEmail` / `auth.loginWithEmail`, set the refresh cookie, return `{user, access}`.
      - `refresh/route.ts` — reads `aetheria_refresh` cookie via `next/headers`, calls `auth.refreshToken`, rotates the cookie, returns `{user, access}` (or 401 `UNAUTHENTICATED` "No refresh cookie").
      - `logout/route.ts` — best-effort `auth.logout` then clears the cookie regardless.
      - `forgot-password/route.ts`, `reset-password/route.ts`, `verify-email/route.ts` — proxies that surface API errors as 4xx JSON.
    - **Pages** (App Router, all client components except providers):
      - `/signup` — email + displayName + password + confirm. POSTs `/api/auth/signup`, calls `setSession`, redirects to `/`.
      - `/login` — email + password. POSTs `/api/auth/login`, sets session, redirects.
      - `/forgot-password` — email; on success shows "if that email is registered, link is on the way" (no enumeration).
      - `/reset-password` — reads `?token=` via `useSearchParams` (wrapped in `<Suspense>`), POSTs `/api/auth/reset-password`.
      - `/verify-email` — auto-POSTs `/api/auth/verify-email` on mount with the URL token; renders pending/ok/error.
    - **`AuthShell` + `Field` + `Submit` + `FormError` + `FormSuccess` primitives** in `apps/web/src/components/auth/AuthShell.tsx`. Tailwind classes only — no design system yet.
    - **`SessionBar`** (client component on the landing page). On mount calls `/api/auth/refresh`; if it succeeds, drops the user into `setSession`, otherwise `clearSession`. Renders display-name + sign-out button when logged in, sign-in / create-account links otherwise.
    - **Smoke** (30 Apr 2026): typecheck 16/16, lint 9/9, build 8/8. Web build adds 7 `ƒ /api/auth/*` routes + 5 `○ /(login|signup|forgot-password|reset-password|verify-email)` pages. Live: `/login` HTML contains "Welcome back" + "Sign in" button; `POST /api/auth/login {foo:"bar"}` → 400 VALIDATION_FAILED with field-level Zod issues; `POST /api/auth/refresh` (no cookie) → 401 `UNAUTHENTICATED` "No refresh cookie"; `POST /api/auth/login` with valid input but no DB → 500 INTERNAL (expected). All five pages render their headings.
    - **Phase 4-B is now closed end-to-end.** Auth-domain server (4.9–4.12) + OAuth (4.10) + UI (4.13) all online.
16. ~~Step 4.14: client SQLite bootstrap~~ ✅ done 30 Apr 2026 — closes Phase 4-B.
    - Architecture clarification: "client" = the API server, opening one SQLite file per user (`/.dev/sqlite/player_<id>.db` by default, override via `AETHERIA_SQLITE_DIR`). Browser-side WASM SQLite is out of scope — Prisma can't run there. The bootstrap endpoint primes the per-user file the API uses to back personal play state.
    - **`packages/schema-db/src/sqlite-bootstrap.ts`** (new):
      - `splitSqliteStatements(src)` — BEGIN/END-aware splitter so the trigger blocks in `db/sqlite/01_init.sql` survive intact. Strips `--` line comments while respecting `'…'` literals (with `''` escapes); tracks `BEGIN…END` depth via whole-word keyword match; only splits on `;` at depth 0.
      - `loadSqlOnce()` reads + caches `db/sqlite/01_init.sql` and `db/sqlite/02_seed.sql` from the monorepo root. Walks up from `import.meta.url` until it finds a `db/` directory.
      - `applyInitSchema(db)` — sets `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL` (uses `$queryRawUnsafe` because `journal_mode` returns a row, which `$executeRawUnsafe` rejects); then executes every non-PRAGMA statement from init + seed. All DDL is `CREATE … IF NOT EXISTS`, so re-running is a no-op.
      - Re-exported from `@aetheria/schema-db` index + new `./sqlite-bootstrap` subpath.
    - **`packages/domain-account/src/service.ts`**: `AccountService.bootstrapLocal(userId)` opens the per-user SQLite via `sqliteFor(userId)`, runs `applyInitSchema(db)`, then `INSERT … ON CONFLICT(id) DO UPDATE` upserts the singleton `local_profile` row from the canonical MySQL profile (mirrors `email`, `display_name`, `avatar_url`, `country`, `language`, `account_level`, `account_xp`, `preferences`, `last_login_at`). Audits `account.local.bootstrap`. Returns `{ok, sqlitePath, localProfile}`.
    - **tRPC**: `account.bootstrapLocal` (protected mutation, no input — uses `ctx.auth.userId`).
    - **Web**: `apps/web/src/lib/auth/bootstrap.ts` exposes `bootstrapLocalQuiet(accessToken)` — a fire-and-forget POST to `/trpc/account.bootstrapLocal` with the access token in the Authorization header. Wired into the post-login paths: `/signup` page, `/login` page, and `SessionBar` (after the cookie-driven refresh on landing-page mount). Failure logs to console — never blocks the user.
    - **Smoke** (30 Apr 2026):
      - Standalone: `applyInitSchema(db)` against a fresh file → 19 tables (local_profile + catalog cache + per-user state + sync_queue + sync_meta + sqlite_sequence) + 3 triggers (`trg_user_characters_updated`, `trg_inventory_updated`, `trg_save_states_updated`). Re-apply is a no-op. `local_profile` upsert verified via $queryRawUnsafe.
      - Splitter: `db/sqlite/01_init.sql` produces 32 statements; all 3 triggers come out well-formed (`END` is the last token of each trigger statement).
      - Repo: typecheck 16/16, lint 9/9, build 8/8.
    - **Phase 4-B is now fully complete** (4.9–4.14 + OAuth in 4.10 + UI in 4.13). Auth, account, and offline-first user storage are all online.
17. ~~Step 4.15: sample levels JSON~~ ✅ done 30 Apr 2026 — Phase 4-C kicked off.
    - **New package** `@aetheria/game-assets`. Holds the canonical JSON levels and the Zod-driven schema that gates them.
    - `src/level-schema.ts` — single source of truth for `levels.map / encounter / rewards / discoverySecrets` shapes:
      - `tileSchema` (axial `q,r` + `terrain` enum {grass, forest, stone, sand, ash, water, ice, lava, void, ruins, shrine, wall} + optional `elev/fx/cost/tag`).
      - `spawnSchema` ("player" | "enemy" | "npc" + `ref`/`slot`/`facing`).
      - `exitSchema` (next | realm_hub | `{levelNumber}` + optional `requires` flag).
      - `mapSchema = {width, height, tiles[], spawns[], exits[]}`.
      - `encounterSchema = {waves[], boss?, scripts?}` with wave triggers `{kind:"turn", value}` or `{kind:"clear", wave}`.
      - `rewardsSchema = {xp, gold, items[], firstClearBonus?}`.
      - `discoverySecretsSchema.hidden[] = {id, q, r, reveal:"walk"|"search"|"key", reward?}`.
      - Top-level `levelSchema = {slug, realmId, levelNumber, name, type∈{story,combat,puzzle,treasure,boss,hidden,rift}, difficulty, minAccountLevel, version, map, encounter, rewards, discoverySecrets?}`.
      - Exposes `parseLevel` / `safeParseLevel` for callers.
    - **8 sample levels** in `packages/game-assets/levels/` (one per realm + 3 extras, levelNumbers 1–8):
      - L01 verdant-forest-trail (story, tutorial, 16 tiles, 1 wave)
      - L02 ashen-cinder-pass (combat, 15 tiles, 2 waves with `clear`-triggered second wave)
      - L03 aetheric-cloudbridge (combat + boss "stormcaller", 16 tiles)
      - L04 sunken-tideglass-reef (puzzle, 15 tiles, 1 wave + 2 switches + 1 hidden secret)
      - L05 hollow-voidstep-atrium (boss "voidwalker", 21 tiles, 2 waves with `turn`-triggered second wave)
      - L06 verdant-hidden-glade (treasure, 16 tiles, 3 hidden secrets)
      - L07 aetheric-spire-trial (puzzle, 20 tiles, 2 waves, 3-switch sequence)
      - L08 hollow-mirror-rift (rift, 24 tiles, 2 waves + boss "the_mirror", `mirror_party_at_75_50_25`)
    - `src/levels.ts` — `loadAllLevels()` reads + parses every `*.json` (sorted), validates against `levelSchema`, asserts uniqueness of `levelNumber` + `slug`, freezes the result. Plus `findLevelByNumber`, `findLevelBySlug`, `levelsForRealm` lookups.
    - **Smoke** (30 Apr 2026): typecheck 17/17, lint 10/10, build 9/9. `loadAllLevels()` against the 8 files: 16–24 tiles each, 1–2 waves each, 3 of 8 levels carry a boss, 3 carry hidden discoverySecrets, total xp 50→600 across difficulty 1→7. All round-trip through the validator without errors.
18. ~~Step 4.16: World service~~ ✅ done 30 Apr 2026.
    - **New package** `@aetheria/domain-world`. `WorldService.{realms, levelsForRealm, startLevel, resumeRun, abandonRun}` + `createWorldRouter(service)` factory. Mounted at `world.*` in the apps/api root.
    - **Catalog source with dev fallback**: `realms()` and `levelsForRealm(id)` first try MySQL via Prisma. If the call throws (host unreachable) OR returns 0 rows, `tolerateDbMiss(...)` returns null and the service falls back to `@aetheria/game-assets` (the 5 hardcoded realms + the 8 sample level JSONs from Step 4.15). This keeps the single-player shell playable on a fresh dev machine without spinning up MySQL.
    - **Run state** lives in the user's per-player SQLite (`sqliteFor(userId)`). Idempotent self-bootstrap: `openUserDb` calls `applyInitSchema(db)` once per (process, userId) so `world.startLevel` works on the very first request — no manual `account.bootstrapLocal` is required first.
    - **`startLevel`**: `loadLevelDetail` (MySQL → assets fallback) → `ensureLevelCacheRow` (raw `INSERT OR IGNORE` against `realms`+`levels` because Prisma's SQLite `DateTime` mapping clashes with our ISO-text `cached_at` default) → raw `INSERT INTO runs … RETURNING id`. Audits `world.run.start`. Returns `{run, level}` where `run` is the freshly-created `runs` row + `level` is the full level detail (map/encounter/rewards) ready for the renderer.
    - **`resumeRun`**: raw `SELECT runs JOIN levels` (raw to dodge the same DateTime mapping issue). Throws `INVALID_ACTION` if the run isn't `in_progress`. Returns the same `{run, level}` shape so the client can re-mount the scene from `run.snapshot`.
    - **`abandonRun`**: raw `UPDATE runs SET status='abandoned', ended_at=…, dirty=1`. Audits `world.run.abandon`.
    - Helper `parseSqliteDate` accepts both ISO text and (legacy) epoch strings so older rows survive a schema retrofit.
    - tRPC validators accept `bigint | number | string` for `realmId` / `runId` and transform to `bigint`.
    - **Smoke** (30 Apr 2026): typecheck 20/20, lint 11/11, build 10/10.
      - `world.realms` (no MySQL) → 5 fallback realms.
      - `world.levelsForRealm` realmId=1 → 2 verdant levels (Forest Trail, Hidden Glade); realmId=5 → 2 hollow levels (Voidstep Atrium, Mirror Rift).
      - `world.startLevel` levelNumber=1 → `run.id=1 status=in_progress level=verdant-forest-trail tiles=16` on a fresh per-user SQLite (schema auto-applied).
      - `world.resumeRun` runId=1 → returns same run with `status=in_progress`.
      - `world.abandonRun` runId=1 → `{ok:true}`.
      - `world.resumeRun` runId=1 (post-abandon) → 422 `INVALID_ACTION` "Run is not resumable".
      - `world.startLevel` levelNumber=999 → 404 `NOT_FOUND` "level '999' not found".
19. ~~Step 4.17: Save service (server)~~ ✅ done 30 Apr 2026.
    - **New package** `@aetheria/domain-save`. `SaveService` operates against the per-user SQLite `save_states` table (PK `slot ∈ 0..3` with check constraint). Slot 0 reserved for autosave; 1..3 for manual saves.
    - All hot-path SQL is raw (`$executeRawUnsafe` / `$queryRawUnsafe` with `INSERT … ON CONFLICT(slot) DO UPDATE`) — same reason as 4.16: Prisma's SQLite `DateTime` mapping clashes with the hand-rolled DDL's ISO-text timestamps. Idempotent `applyInitSchema` runs once per (process, userId) so save calls work on a fresh per-user file.
    - **Methods**:
      - `snapshot({slot, payload, schemaVersion?})` — upsert, increments `schema_version` (next = prev+1 if not given), `dirty=1`. Audits `save.snapshot`.
      - `autosaveTick({payload, schemaVersion?})` — same as snapshot to slot 0, but rate-limited (default 5 s, override via `autosaveThrottleMs` dep). Returns either the new summary or `{skipped:true, nextEligibleAt}`.
      - `list(userId)` — summaries (`{slot, schemaVersion, updatedAt, payloadBytes}`) ordered by slot ASC. No payloads — keeps the response small for save selectors.
      - `load({slot})` — full row, payload parsed to an object. `INTERNAL` if the stored JSON is corrupted.
      - `delete({slot})` — `DELETE FROM save_states WHERE slot=?`; throws `NOT_FOUND` if no row was deleted. Audits `save.delete`.
      - `reconcile({slot, expectedVersion, payload})` — optimistic concurrency. Compare server `schema_version` to client's `expectedVersion`; if it has moved on, returns `{status:"stale", server: {full}}` so the client refetches/merges. Otherwise upserts + bumps version, returns `{status:"ok", schemaVersion}`. Audits `save.reconcile`.
    - **Constants**: `MAX_SLOT=3`, `AUTOSAVE_SLOT=0`, `DEFAULT_AUTOSAVE_THROTTLE_MS=5000`, `MAX_PAYLOAD_BYTES=256 KiB` (enforced in `upsertSlot`).
    - **tRPC**: `save.snapshot / autosaveTick / list / load / delete / reconcile` (all protectedProcedure). Slot validated 0..3 at the input boundary; payload typed via `z.record(jsonValue)`; version bounded `1..9_999_999`.
    - Mounted at `save.*` in apps/api root router.
    - **Smoke** (30 Apr 2026): typecheck 22/22, lint 12/12, build 11/11. Live full lifecycle confirmed:
      - `list` (empty) → `[]`; `snapshot` slot=1 → v1, slot=2 → v1; `list` → 2 summaries; `load` slot=1 → full payload `{hp:100, pos:{q:2,r:3}}`.
      - Re-`snapshot` slot=1 → v2; `reconcile` slot=1 expectedVersion=1 → `{status:"stale", server:{...,v2}}`; `reconcile` expectedVersion=2 → `{status:"ok", v3}`.
      - `delete` slot=2 → ok; second `delete` slot=2 → 404 `NOT_FOUND` "save_state '2' not found".
      - `snapshot` slot=99 → 400 `VALIDATION_FAILED` "Number must be less than or equal to 3".
      - `autosaveTick` 1st → writes slot 0 v1; 2nd within 5 s → `{skipped:true, nextEligibleAt}`.
20. ~~Step 4.18: Sync engine~~ ✅ done 30 Apr 2026.
    - **New package** `@aetheria/domain-sync`. `SyncService` bridges per-user SQLite (primary copy of personal play state) and shared MySQL (durable backup + catalog source). Two directions:
      - **PUSH**: `applyOne` per `tableName` upserts into MySQL. v1 supports `runs` (full upsert by `rowKey`=run id, with action_log/snapshot/started_at/ended_at field extraction) and `save_states` (upsert by `userId+slot`). Other tables surface `NOT_IMPLEMENTED`.
      - **PULL**: `fetchOne` per `tableName` returns rows + a new cursor. v1 supports `realms` (full snapshot, immutable in v1) and `levels` (filter `updated_at > cursor`, batch 500, cursor advances to last row's `updated_at`). Other tables → `NOT_IMPLEMENTED`.
    - **`tick(userId)` orchestrator** drains the per-user SQLite `sync_queue` into `applyOne`, deletes successfully-pushed rows, increments `attempts`+sets `last_error` for rejects, then calls `pull` per configured table and writes the rows back into the SQLite catalog cache (`realms` / `levels`) before advancing `sync_meta.cursor` + `last_pulled_at`. `last_pushed_at` is bumped per accepted table in the same tick.
    - **`status(userId)`** returns `{queueDepth, meta: [{tableName, lastPulledAt, lastPushedAt, cursor}]}` — useful for the future sync indicator UI + the cron-tick worker (Step 4.53+).
    - **Field-extraction helpers** (`stringField`, `numberField`, `bigintField`, `dateField`) accept both snake_case (DB column) and camelCase (JS object) keys so the queue payload format stays loose.
    - **tRPC**: `sync.push / sync.pull / sync.tick / sync.status` (all protected). Mutations array capped at 500/request; pull tables capped at 20.
    - Mounted at `sync.*` in apps/api root router.
    - **Smoke** (30 Apr 2026): typecheck 24/24, lint 13/13, build 12/12. Live (no MySQL):
      - `sync.status` (fresh user) → `queueDepth=0` + 9 seeded `sync_meta` rows (one per catalog table primed by `db/sqlite/02_seed.sql`).
      - `sync.push` `tableName="unknown_thing"` → returns per-row reject with `reason: "sync table 'unknown_thing' is not implemented yet"` (NOT_IMPLEMENTED bubbles into the per-row reason rather than failing the whole batch).
      - `sync.pull` `tableName="zzz"` → 501 `NOT_IMPLEMENTED`.
      - `sync.push` `tableName="runs"` (no MySQL) → cleanly rejected with the upstream Prisma error captured in `reason`.
      - `sync.tick` (no MySQL) → 500 INTERNAL on the pull leg (expected; real deployment has MySQL up).
21. ~~Step 4.19: PixiJS hex map renderer~~ ✅ done 30 Apr 2026.
    - **`apps/web/src/lib/hex/`**: `math.ts` (axial↔pixel conversion for pointy-top hexes, cube-rounding for click→tile, 6-corner geometry, axial bounds for camera centring) + `terrain.ts` (terrain → fill+outline color palette, fx tints, spawn/exit colors).
    - **`apps/web/src/components/game/HexMapRenderer.tsx`** (client component, dynamic-import Pixi so SSR stays clean):
      - Mounts `Pixi.Application` with `width × height` canvas (default 800 × 480), background `#0a0a0f`, antialias on, devicePixelRatio honoured.
      - Draws each tile as a pointy-top hex polygon (`Graphics.poly`) with terrain fill + outline, optional fx overlay (alpha 0.18), white top-edge stripe for `elev > 0`.
      - Spawn dots (player/enemy/npc colours) + exit stars rendered above tiles.
      - **Camera**: drag-to-pan tracks `pointerdown→pointermove→pointerup` on the stage; **zoom**: wheel events on the canvas, scale clamped to `[0.4, 3]`, zoom centres around the cursor.
      - **Click**: a `pointertap` whose start/end stay within 4 px is treated as a tap. Pixel→axial via `pixelToAxial` (cube-rounded); only fires if the resulting `(q, r)` is a real tile in the map. Forwards to `onTileClick(axial)` and shows the last clicked coord in the footer.
      - Hover footer mirrors the cursor's current tile (`q=…, r=…` or "—").
    - **`apps/web/src/app/play/page.tsx`** + **`apps/web/src/app/play/[levelNumber]/page.tsx`**: index lists all 8 bundled levels by realm + name; detail page server-loads via `findLevelByNumber()` and mounts `<HexMapRenderer map={level.map} />` plus map/encounter/rewards summary cards.
    - **`@aetheria/game-assets`** retrofit: `levels.ts` switched from `readFileSync` to **static JSON imports** (`import lv01 from "../levels/01-….json" with { type: "json" }`) so the package works inside Next/webpack with no runtime FS access. Validation against `levelSchema` runs once on first call to `loadAllLevels()`.
    - **`apps/web/next.config.mjs`**: added `webpack` override that registers `extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] }` so transpiled workspace packages whose source uses `.js` extensions resolve to their `.ts` files. Without this, `import "./levels.js"` from a transpiled package's `.ts` file failed Next's webpack resolver. `@aetheria/game-assets` added to `transpilePackages`.
    - **Smoke** (30 Apr 2026): typecheck 24/24, lint 13/13, build 12/12. Web build now lists `○ /play` (static index) + `ƒ /play/[levelNumber]` (dynamic detail). Live: `/play` HTML enumerates all 8 levels (Forest Trail, Cinder Pass, Cloudbridge, Tideglass Reef, Voidstep Atrium, Hidden Glade, Spire Trial, Mirror Rift); `/play/1` shows "Forest Trail" + "drag = pan" + "wheel = zoom"; `/play/3` shows "Cloudbridge" + boss `"stormcaller"`; `/play/999` → 404.
22. ~~Step 4.20: state-machine flow~~ ✅ done 30 Apr 2026 — closes Phase 4-C.
    - Mapped `docs/02_FLOWS.md` §10 onto Next routes:
      - `/menu`            ↔ MainMenu (Continue / New Journey / Codex / Shop / Multiplayer / Settings — only the first two are wired; the rest are visible-but-disabled placeholders).
      - `/realms`          ↔ RealmPicker (5 cards, calls `world.realms` via tRPC; left-border colour comes from each realm's `colorHex`).
      - `/realms/[realmId]` ↔ LevelPicker (calls `world.levelsForRealm(realmId)` + cross-references `world.realms` for the header label).
      - `/play/[levelNumber]` ↔ InGame (rewritten as a client component on top of the renderer from 4.19).
    - **`apps/web/src/store/gameFlow.ts`** — Zustand store: `scene ∈ {splash, main_menu, realm_picker, level_picker, in_game, pause}`, `selectedRealmId`, `activeRun`. Pages call `setScene` on mount; the store survives in-page transitions (e.g. pause overlay) without URL churn.
    - **`apps/web/src/lib/auth/useHydratedSession.ts`** — hook returning `"loading" | "authenticated" | "unauthenticated"`. On mount calls `/api/auth/refresh` if the in-memory access token is missing/expired; updates the session store with the result. Used by both `SessionBar` and the new auth gate.
    - **`apps/web/src/components/auth/RequireAuth.tsx`** — wraps protected pages; renders "Checking your session…" while loading, redirects to `/login` on `unauthenticated`. Works as a leaf wrapper because Next 15 RSC requires page files to remain default exports.
    - **`/play/[levelNumber]` retrofit** (now `"use client"`):
      - Fires `world.startLevel.mutate({levelNumber})` on first mount; on success records the active run in `gameFlow` and renders `<HexMapRenderer />` against `data.level.map`.
      - Skips the start mutation if `gameFlow.activeRun.levelNumber` already matches (fast-path Continue).
      - Pause toggle overlays a "Paused" card on top of the canvas + sets `scene = "pause"`. Resume → `scene = "in_game"`.
      - Abandon button calls `world.abandonRun.mutate({runId})`, clears `activeRun`, and routes back to `/realms`.
      - Footer shows runId / tile count / wave count / last clicked tile.
    - **Login + Signup pages** post-redirect changed from `/` → `/menu`. **`SessionBar`** adds an "Open menu" link when authenticated, alongside the existing "Sign out" button.
    - **Smoke** (30 Apr 2026): typecheck 24/24, lint 13/13, build 12/12. Web build now lists `○ /menu`, `○ /realms`, `ƒ /realms/[realmId]` alongside the existing routes. Live (no session): `/menu`, `/realms`, `/realms/3`, `/play/1` all render "Checking your session…" via the gate — exactly the pre-redirect state. Login → `/menu` redirect verified by code path.
    - **Phase 4-C is now closed.** Single-player playable shell: login → menu → realm → level → in-game (hex map, pause, abandon). 4.21+ kicks off Phase 4-D (Combat engine).
23. ~~Step 4.21: domain-combat types + seeded RNG~~ ✅ done 30 Apr 2026 — Phase 4-D kickoff.
    - **New package** `@aetheria/domain-combat`. Pure-domain: only depends on `@aetheria/shared-types`, no DB, no I/O — reusable by both client (prediction) and server (authority).
    - **`src/rng.ts`** — deterministic seeded RNG (mulberry32, 32-bit). API is purely functional: every call threads `RngState` through, so two runs from the same seed produce identical event streams (foundation for replay + anti-cheat).
      - `makeRng(seed)`, `seedFromString(s)` (FNV-1a → 32-bit, same hash as `core/feature-flag` so callers can derive RNGs from `${runId}:${turn}`).
      - `next(state)` → `{state, value ∈ [0,1)}` (52-bit fraction).
      - `nextInt(state, lo, hi)` (inclusive both sides).
      - `pick(state, items)` → uniform choice over a non-empty array.
      - `rollDice(state, n, sides)` — sum of n d-sided rolls.
      - `chance(state, p)` — Bernoulli; short-circuits on `p ≤ 0` / `p ≥ 1` to avoid burning entropy.
    - **`src/types.ts`** — combat domain shapes:
      - **Enums**: `Elements` (verdant/ember/frost/tide/sky/void per spec wheel), `Statuses` (burn/freeze/poison/stagger/aether_surge), `Sides` (player/enemy/neutral), `BattleTerrains` (plain/forest/stone/water/ice/lava/void/shrine/wall), `BattlePhases` (setup/player_turn/enemy_turn/resolving/victory/defeat/draw).
      - **`Coord` (axial q,r)**, **`Tile`** (terrain + elev + optional element/tag).
      - **`StatusEffect`** (kind, turns, potency, source).
      - **`ActorStats`** (hp/maxHp/ap/apRegen/atk/def/spd/move) and **`Actor`** (id, side, unit, element, stats, pos, facing, statuses, skills, cooldowns, defeated).
      - **`BattleConfig`** (width, height, turnLimit, defaultApRegen) + **`BattleState`** (battleId, config, tiles, actors, turn, phase, activeActorId, rng, log).
      - **Actions** discriminated union: `move | attack | use_skill | defend | end_turn`.
      - **Events** discriminated union (10 variants): actor_moved / damage_dealt / healed / status_applied / status_expired / actor_defeated / resonance_triggered / turn_started / turn_ended / battle_ended. Every event carries a monotonic `t` index + optional `cause` for trace/dedup.
      - **Helpers**: `sameCoord`, `hexDistance` (axial L1/2 norm), `HEX_DIRS` (6 unit offsets), `ELEMENT_WHEEL` (canonical order; 4.22 will derive strong/weak relations).
    - **Smoke** (30 Apr 2026): typecheck 25/25, lint 14/14, build 13/13. Standalone runtime smoke confirmed:
      - Two RNGs from `seed=42` produce the same first value (deterministic ✅).
      - 10-call stream from `seedFromString("aetheria:test")` looks well-distributed.
      - `nextInt(_,1,6)` over 6000 rolls: face counts 914..1068 (≈ uniform).
      - `pick`, `rollDice(3d6)`, `chance(0.5)` all work; `hexDistance({q:0,r:0},{q:2,r:-1}) = 2`; `HEX_DIRS.length = 6`.
24. ~~Step 4.22: combat helpers + unit tests~~ ✅ done 30 Apr 2026.
    - `domain-combat/src/helpers.ts`:
      - `apCost(state, action)` — `end_turn`=0, `defend`/`attack`=1, `use_skill` looks up `SKILL_AP_COST` (default 2), `move` walks the path summing per-tile cost (water 2, ice 0.5, lava 2, void/wall ∞, plain/forest/stone/shrine 1) then divides by `actor.stats.move` and rounds up. Missing actor → `Infinity`.
      - `lineOfSight(state, from, to)` — cube-lerp samples between endpoints; rejects if any intermediate hex is `wall` or `void` (or off-map). Endpoints don't themselves need to be visible terrain.
      - `rangeReachable(state, actor, apBudget?)` — Dijkstra-lite over `HEX_DIRS` with the same per-tile costs as `apCost`. Excludes walls/void/blocked-by-other-actor. Returns sorted `{q, r, cost}[]` (cost = ceil(AP)).
      - `elementAdvantage(attacker, defender)` — wheel-based: same → 1.0, attacker-strong (next on wheel) → 1.25, attacker-weak (previous) → 0.75, opposite (3 steps) → 1.0. Unknown elements fall back to 1.0.
      - `resonanceCheck(state, {lookback?})` — scans the tail of `state.log` (default last 4 events) for `damage_dealt`s by player-side actors with the same element from ≥ 2 distinct attackers. Returns `{element, actors, bonusMultiplier: 1.5}` or `null`.
    - **Tests** — first vitest workspace.
      - `packages/domain-combat/vitest.config.ts` (globals, `src/**/*.test.ts`).
      - `eslint.config.mjs` now layers the `test` overlay so test-file rules relax `no-explicit-any` etc.
      - 10 RNG tests (determinism across instances, `[0,1)` bound, d6 fairness over 6000 rolls, range-validation throws, `pick` covers all items, `rollDice` sum bounds, `chance` short-circuits + balanced 0.5, `seedFromString` stability + collision-resistance).
      - 23 helpers tests (apCost: end_turn/defend/attack/skills/move + water/ice/missing actor; lineOfSight: clear/wall/void/same-coord/missing tile; rangeReachable: 0-AP, plain expansion, walls + actor blockers; elementAdvantage: same/strong/weak/opposite/unknown; resonanceCheck: empty log, two-attacker trigger, single-attacker no-trigger, enemy ignored, lookback window).
    - **Smoke** (30 Apr 2026): typecheck 25/25, lint 14/14, **test 33/33 passing in 174 ms**, build 13/13.
25. ~~Step 4.23: combat.createBattle + combat.applyAction~~ ✅ done 30 Apr 2026.
    - **`domain-combat/src/engine.ts`** — pure deterministic engine. Two exports: `createBattle(input)` and `applyAction(state, action) → {state, events}`.
    - `createBattle({battleId, seed?, config?, tiles, actors, firstTurn?})`: derives the RNG seed from `seedFromString(battleId)` when `seed` is omitted (so two callers with the same id replay identically), clones actor stats, picks the highest-`spd` actor on the first side as `activeActorId`, sets phase to `player_turn` / `enemy_turn` accordingly. Default config: 8×6 grid, no turn limit, AP regen 3.
    - `applyAction(state, action)`:
      - Front gate: `BATTLE_OVER` (terminal phase), `ACTOR_NOT_FOUND`, `ALREADY_DEFEATED`, `WRONG_TURN`.
      - Each handler validates action-specific shape **before** computing AP, so the more useful `INVALID_PATH` / `OUT_OF_RANGE` / `NO_LINE_OF_SIGHT` codes win over a generic `INSUFFICIENT_AP` (e.g. a wall step in a move path surfaces `INVALID_PATH`, not "Not enough AP" from `apCost`'s ∞).
      - **move**: validates path is non-empty, each step adjacent, on map, not a wall/void, not blocked by another live actor; charges AP (`apCost`), updates `pos`, emits `actor_moved {from, to, path, apSpent}`.
      - **attack**: melee range = 1 hex; LOS via `lineOfSight`; damage formula `max(1, atk-def) × variance(0.85..1.15 from 1d4) × elementAdvantage × crit(0.05/1.5) × resonanceMultiplier(1.5 when `resonanceCheck` matches the attacker's element)`. Emits `resonance_triggered` (when applicable), `damage_dealt`, and `actor_defeated` when HP hits 0.
      - **use_skill** (shell): cooldown gate, AP charge, sets 1-turn cooldown for the skill; full per-skill behaviour lands with the skill catalog later in 4-D/4-E.
      - **defend**: AP charge + 1-turn `aether_surge` buff (placeholder until full status system is in).
      - **end_turn**: emits `turn_ended {turn, side, actorId}` and clears `activeActorId` — full turn rotation owned by 4.24's `endTurn` orchestrator.
    - All handlers thread `state.rng` through randomised steps and return a fresh state, so replaying `(stateA, actions)` and `(stateB, actions)` from the same seed yields identical event logs.
    - `EngineError` carries a typed `code` field (`ACTOR_NOT_FOUND` / `TARGET_NOT_FOUND` / `WRONG_TURN` / `INSUFFICIENT_AP` / `INVALID_PATH` / `OUT_OF_RANGE` / `NO_LINE_OF_SIGHT` / `ALREADY_DEFEATED` / `BATTLE_OVER`) so the server can pattern-match on it (Step 4.27 wires combat over tRPC).
    - **Tests** — added `src/__tests__/engine.test.ts` (17 tests) on top of the existing 33: createBattle determinism + first-turn ordering + override seed; applyAction front gates (wrong turn, battle over); move (happy path, non-adjacent rejected, blocker rejected, wall rejected); attack (damage applied, out-of-range rejected, target killed → defeated event); end_turn / defend / use_skill happy paths; **replay determinism** — same battleId + seed + action sequence produces identical `state.log` and `state.actors`.
    - **Smoke** (30 Apr 2026): typecheck 25/25, lint 14/14, **test 50/50 passing in ~240 ms**, build 13/13.
26. ~~Step 4.24: combat.endTurn + checkVictory + status ticking~~ ✅ done 30 Apr 2026.
    - **`domain-combat/src/turn.ts`** — three exports:
      - `checkVictory(state)` returns `"victory"` (every enemy defeated), `"defeat"` (every player defeated), `"draw"` (`state.turn > config.turnLimit` when `> 0`), or `null`. Pure peek.
      - `endTurn(state, outgoingActorId)` runs the full rotation cycle and returns `{state, events}`.
      - `Outcome` + `EndTurnResult` types.
    - **Rotation cycle** in order:
      1. **Tick statuses** on the outgoing actor: `burn`/`poison` apply DOT damage = `potency` (max 1) and emit a synthetic `damage_dealt` (element ember/void); every status counter decrements; statuses with `turns=0` expire and emit `status_expired`. If the DOT brings HP to 0, mark `defeated` and emit `actor_defeated`.
      2. **Decrement cooldowns** by 1 (clamped to 0).
      3. **Pick the next actor** by initiative (`spd` desc, `id` asc among live actors). Already-acted set is rebuilt from `log.filter(turn_ended where turn === state.turn)` rather than walking-and-breaking, since same-round `turn_started` events sit between consecutive `turn_ended`s.
      4. **Wrap detection**: if every initiative entry has acted, bump `state.turn`, reset acted set; if `turn > turnLimit` → declare a draw (`battle_ended`).
      5. **AP refresh** on the new active actor: `ap = min(apRegen + 1, apRegen + clamp(prev.ap, 0, 1))` — banking caps at +1.
      6. **Set `activeActorId` + `phase`** based on the new actor's side (`player_turn` / `enemy_turn`).
      7. **Emit `turn_started`** with the new turn / side / actor.
      8. **Final victory check** (status DOTs may have wiped a side; turn-wrap may have crossed the limit) → `battle_ended` if so.
    - **Engine wiring**: `applyAction({kind:"end_turn"})` now emits `turn_ended` and **calls `endTurn` internally**, so consumers get a fully rotated state in one call (`{events: [turn_ended, …rotation events]}`). External callers that prefer to drive their own rotation can still `import { endTurn }` and pass the outgoing actor id directly.
    - **Tests** — 14 new in `__tests__/turn.test.ts`: checkVictory all 4 outcomes; rotation player→enemy in same round; round wrap with turn bump and AP refill; AP banking caps at +1; cooldown decrement on the outgoing actor; victory + battle_ended on enemy wipe; draw at turn limit; burn DOT + status decrement; turns=1 expiry → status_expired; DOT can kill (actor_defeated + phase=defeat); direct `endTurn(state, actorId)` invocation. Existing engine "end_turn" test updated to assert turn_started on rotation.
    - **Smoke** (30 Apr 2026): typecheck 25/25, lint 14/14, **test 64/64 passing in ~235 ms**, build 13/13.
27. ~~Step 4.25: combat.serializeState / combat.hydrate (stable JSON, schema_version)~~ ✅ done 30 Apr 2026.
    - **`domain-combat/src/persistence.ts`** with `SCHEMA_VERSION = 1`. The persisted shape is the contract used by `runs.snapshot`, `save_states.payload`, the anti-cheat replay worker (4.26), and the network. Bumping `SCHEMA_VERSION` lets us migrate forward.
    - **`serializeState(state) → SerializedState`** projects `BattleState` into a plain-data object. Every key is emitted in a fixed order and `cooldowns` records are sorted alphabetically so `JSON.stringify(serializeState(s))` is byte-stable across runs/machines (foundation for replay-hash comparisons).
    - **`hydrate(json) → BattleState`** validates via Zod (`serializedSchema`) and rebuilds the typed shape; rejects unknown `schemaVersion` with a typed `HydrateError` carrying issue paths. exactOptionalPropertyTypes-safe: optional fields (`Tile.element`, `Tile.tag`, `StatusEffect.source`, `Event.cause`) are omitted from the rebuilt objects when the zod-parsed input has them as `undefined`.
    - **`stringifyState(state)`** + **`parseState(json)`** convenience round-trippers. `parseState` wraps invalid JSON in `HydrateError` so callers can surface a single error type.
    - Added `zod ^3.23.8` to `domain-combat`.
    - **Tests** — 10 new in `__tests__/persistence.test.ts`:
      - serializeState carries `schemaVersion` + the state.
      - byte-stable JSON for the same input.
      - cooldown keys sorted (two authoring orders → identical JSON).
      - round-trip equality on a fresh state and on one with a populated log.
      - **replay determinism after hydrate**: `hydrate(serializeState(stateA))` followed by 3 attacks produces identical `state.log` and `state.actors` to driving the same actions on the original state.
      - rejects `schemaVersion: 999` with `path: "schemaVersion"`.
      - rejects malformed shape with detailed issues.
      - `parseState("{not json")` throws `HydrateError`.
      - `parseState(stringifyState(s))` round-trip.
    - **Smoke** (30 Apr 2026): typecheck 25/25, lint 14/14, **test 74/74 in ~227 ms**, build 13/13.
28. ~~Step 4.26: combat replay (anti-cheat)~~ ✅ done 30 Apr 2026.
    - **`domain-combat/src/replay.ts`** — three exports:
      - `replayActions({init, actions, stopOnError?})` re-creates the battle from `init` (`CreateBattleInput`), drives `actions[]` through `applyAction` one at a time, and returns `{state, events, errors, hash}`. Per-step `EngineError`s are captured into `errors[]` (with `index` + typed `code` + message) but don't roll back state — the engine simply skips the offending action so anti-cheat can see *all* divergences in one pass. `stopOnError: true` aborts at the first.
      - `hashState(state)` returns a stable 16-char hex fingerprint (FNV-1a 64-bit on `stringifyState(state)`). Two states whose serialized JSON match hash identically; a single HP delta or reordered event produces a different hash. Not collision-resistant for adversarial cryptographic inputs — fine for game-log fingerprinting.
      - `verifyReplay({init, actions, expectedHash})` runs replay, compares the final hash against the client-submitted one, returns `{ok, expected, actual, state, errors}`. The anti-cheat worker (Phase 4-I) consumes this directly: any `ok: false` flags the run for review.
    - `fnv1a64(s)` exposed as a building block — hand-rolled split-multiply 64-bit FNV-1a with no BigInt overhead, deterministic across Node + browsers.
    - **Tests** — 14 new in `__tests__/replay.test.ts`:
      - `fnv1a64` shape (16 hex chars), stability, sensitivity to tiny edits, empty-string determinism.
      - `hashState` matches across two fresh-but-identical `createBattle`s; diverges after any action.
      - `replayActions` reproduces the same state/hash as direct stepping; captures `INVALID_PATH` per-step without aborting; `stopOnError: true` skips the rest; deterministic across two replays.
      - `verifyReplay` returns `ok:true` for matching hash; `ok:false` for a wrong-hash claim and for tampered action logs that produce a different state; surfaces engine errors alongside the comparison.
    - **Smoke** (30 Apr 2026): typecheck 25/25, lint 14/14, **test 88/88 in ~310 ms**, build 13/13.
29. ~~Step 4.27: combat wired into the run flow~~ ✅ done 30 Apr 2026.
    - **New package** `@aetheria/domain-combat-runtime`. Bridges the pure engine (`@aetheria/domain-combat`) to the per-user SQLite `runs` row (snapshot + action_log) + audit log. Idempotent `applyInitSchema(db)` once per (process, userId) so combat works on a freshly opened SQLite file.
    - `CombatRunService.start({userId, runId})` — loads the run + level row, synthesises a deterministic 6×4 plain grid + 1 hero + 1 foe (real party/encounter mapping deferred to 4-E), builds a fresh `BattleState` via `createBattle({battleId: "run-{id}"})`, persists `stringifyState(state)` to `runs.snapshot` and resets `runs.action_log = "[]"`, audits `combat.start`.
    - `CombatRunService.submitAction({userId, runId}, action)` — server-authoritative validation:
      - Loads run + asserts `status === "in_progress"`.
      - Hydrates `BattleState` from `runs.snapshot`; corrupt JSON throws `INTERNAL`.
      - Calls `applyAction`. `EngineError` → `INVALID_ACTION` with `details: {code, message, …}` so client/audit see the typed reason.
      - Appends action to `action_log`, serialises new state, transitions `runs.status` per `phase` (`victory|draw → completed`, `defeat → failed`, else stays `in_progress`), sets `ended_at` when phase terminates.
      - Audits `combat.submit_action` with kind/actorId/event count/phase.
    - `CombatRunService.replay({userId, runId})` — re-runs `runs.action_log` from a fresh `init` and compares the resulting hash against `hashState(stored)`. `{ok, expected, actual}` — anti-cheat consumption shape.
    - **tRPC**: `combat.start` (mutation), `combat.submitAction` (mutation), `combat.replay` (query). All `protectedProcedure`. Action zod schema is a 5-variant discriminated union (`move | attack | use_skill | defend | end_turn`). The `use_skill` variant strips `target: undefined` before passing to the engine so `exactOptionalPropertyTypes` accepts it.
    - Mounted at `combat.*` in `apps/api` root router; `combatService = new CombatRunService()` in `server.ts`.
    - `tsconfig.base.json` paths extended for `@aetheria/domain-combat-runtime`.
    - **Smoke** (30 Apr 2026): typecheck 28/28, lint 15/15, test 88/88, build 14/14. Live (no MySQL):
      - `world.startLevel` levelNumber=1 → run id=1 (game-assets fallback).
      - `combat.start` runId=1 → fresh BattleState (`battleId=run-1`, `phase=player_turn`, `activeActorId=hero`, actors `[hero, foe]`).
      - `combat.submitAction` `attack ghost` → 422 `INVALID_ACTION` `code: "ACTOR_NOT_FOUND"`.
      - `combat.submitAction` `attack foe` (out of range) → 422 `INVALID_ACTION` `code: "OUT_OF_RANGE"`.
      - `combat.submitAction` `move [(1,0),(2,0)]` → `runStatus=in_progress`, events `[actor_moved]`, heroPos `{q:2, r:0}`.
      - `combat.replay` after the move → `ok=true expected=0723f37d… actual=0723f37d…` — server reconstruction matches the persisted snapshot.
30. ~~Step 4.28: web combat scene (PixiJS) — render actors/tiles + animate events + optimistic-apply with reconcile~~ ✅ done 5 May 2026.
    - **New web store** `apps/web/src/store/combat.ts` (zustand). Holds the live `BattleState`, an `eventQueue` the renderer drains, the most recent `serverHash`, and a `pending: PendingAction | null` slot.
      - `applyOptimistic(action)` runs the pure engine locally, captures the **pre-state** for rollback + a `predictedHash`, queues `events`, sets `pending`. Errors return `{ok:false, code, message}` — the page surfaces them, no rollback needed because the state hasn't been mutated yet.
      - `commitServer(state, events)` is called when the server's `combat.submitAction` resolves. If `predictedHash === hashState(serverState)` we accept silently (`lastReconcile.kind = "ok"`); otherwise we replace the state, append any unseen events keyed by `${t}:${type}`, and flag `lastReconcile.kind = "drift"` for the HUD.
      - `rejectPending(message)` rolls state back to `pending.preState`, clears the queue, sets `lastReconcile.kind = "rolled_back"`.
      - The engine is deterministic, so when client + server agree on the seed (which they do since the server sends the canonical state on `combat.start`), the predicted hash always matches in practice. The drift path is the safety valve for stale/desynced clients.
    - **`apps/web/src/components/game/CombatScene.tsx`** — Pixi 8, dynamic-import lazily so SSR stays clean. Setup runs once on mount. Layers: `tileLayer / highlightLayer / actorLayer / fxLayer`. Renderer:
      - `renderTiles` paints axial hexes using a small terrain palette (plain/forest/stone/water/ice/lava/void/shrine/wall).
      - `renderActors` diff-applies actor sprites — circle body coloured by side, HP bar under it, monospace id label. Defeated actors fade to alpha 0.4.
      - `renderHighlight` draws an amber outline on the prop-controlled tile (move target hint).
      - Subscribes imperatively to `useCombat` for `state` (full repaint on change) and `eventQueue` (animate next event). Animator advances one event at a time and calls `consumeEvent` after each tween — keeps animations strictly serial so `actor_moved → damage_dealt → actor_defeated` reads in order.
      - Animations: `actor_moved` 220 ms position tween from `event.from` to `event.to`; `damage_dealt` flash + floating `-N` (yellow on crit); `healed` floating `+N` in green; `actor_defeated` 280 ms alpha fade; `resonance_triggered` purple banner; `turn_started/ended/status_*/battle_ended` 80 ms beat (visual hooks land later).
      - Click handling: pointertap → axial → if an actor occupies it, `onActorClick(id)`; else if it's a tile in `state.tiles`, `onTileClick(coord)`.
    - **`apps/web/src/components/game/CombatHud.tsx`** — control panel. Shows phase + turn, active actor (HP/AP/element/pos), selected target, `Attack` (enabled only if a non-defeated enemy is `hexDistance === 1` away), `Defend`, `End turn`. Surfaces the latest `lastReconcile` (synced/drift/rolled-back) and a tail of the last 6 events with a typed `summariseEvent` formatter.
    - **`apps/web/src/app/play/[levelNumber]/page.tsx`** — wired the scene + HUD. Adds an `Engage combat` button that calls `combat.start` and pushes the resulting `BattleState` into the store. While in combat:
      - Tile click → builds a single-step `move` action (engine validates adjacency + AP). Highlight ring repaints from the prop without touching the canvas.
      - Actor click → sets `targetId` for the HUD's Attack button.
      - Submit flow: `applyOptimistic` → `combat.submitAction.mutate` → `commitServer` on success / `rejectPending` on tRPC error.
      - The page also exits combat cleanly (Exit button + page-unmount cleanup → `resetCombat()`), and abandoning the run drops the combat state too.
    - **`apps/web/src/app/play/[levelNumber]/page.tsx#toWireAction`** converts the engine's `readonly Coord[]` into the mutable shape tRPC's zod-derived input type expects (and strips `target: undefined` for `use_skill` again on the client side, mirroring the server router).
    - `apps/web/package.json` adds the `@aetheria/domain-combat: workspace:*` dep.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 14/14 ✓, `pnpm -r lint` 14/14 ✓, `pnpm -r test` (combat 88/88, others "no tests yet") ✓, `pnpm -r build` 14/14 ✓ (web bundle: `/play/[levelNumber]` 13.4 kB / 149 kB First Load JS, up from 12.0 kB / 148 kB on 4.27).
31. **Step 4.29 done** (5 May 2026, opens Phase 4-E Progression / Inventory / Quests / BP).
    - **`packages/domain-progression`** — pure-domain XP/level engine. No Prisma, no I/O, no Pixi. Imports only `@aetheria/shared-types`.
    - **`src/curve.ts`** — spec formula `xpForLevel(n) = floor(50 * n^1.85)` for n ∈ [1, MAX_LEVEL−1]; `xpForLevel(MAX_LEVEL)` returns `+Infinity` so any further XP is overflow. `MIN_LEVEL = 1`, `MAX_LEVEL = 100`. Sanity: `xpForLevel(1) = 50`, `xpForLevel(2) = 180`, `xpForLevel(10) = 3548`, `xpForLevel(99) ≈ 232 906`. Cumulative table `_CUMULATIVE_XP` precomputed once and frozen; `xpToReach(n)` is `O(1)` lookup, `levelFromTotalXp(totalXp)` is `O(log n)` binary search → `{ level, xpIntoLevel }`. Throws `RangeError` on out-of-range / non-integer input.
    - **`src/milestones.ts`** — `MILESTONES` table at levels 5/10/15/25/40/60/80/100 mapping to `MilestoneId` `second_character_slot | skill_tree | photo_mode | coop | guild_raids | ranked_pvp | endless_tower | weekly_rifts` (aligned with `docs/01_GAME_GUIDELINE.md` §10 — "lvl 15 unlocks Photo Mode, lvl 25 unlocks Co-op"). `i18nKey` = `progression.milestone.<id>` for the future i18n layer. Lookups: `milestoneAtLevel(level)`, `milestoneById(id)`, `milestonesCrossing(fromLevel, toLevel)` (excludes from, includes to — used for multi-level jumps).
    - **`src/levelup.ts`** — `Progression = { level, xpIntoLevel, totalXp }`. `initialProgression()` → `{ 1, 0, 0 }`. `assertValidProgression(p)` — defensive boundary check (rejects out-of-range level, banked XP at MAX_LEVEL, banked ≥ threshold). `checkLevelUp(p)` — pure inspector returning `{ delta, nextLevel, remainder } | null` for callers that mutate progression through other paths. **`addXp(p, amount)`** — main API. Drains XP one level at a time, emits one `LeveledUpEvent` per level crossed (each with the milestone for that level if any), folds residue past MAX_LEVEL into `overflowXp`. Zero is a no-op; negative / non-integer throws.
    - **`src/index.ts`** — barrel export of curve constants + functions, milestone helpers, levelup API, plus value/type exports (`Level`, `Xp`, `Progression`, `Milestone`, `MilestoneId`, `LeveledUpEvent`, `AddXpResult`).
    - **Tests** (`src/__tests__/`, vitest, 46 tests across 3 files):
      - `curve.test.ts` — formula match across all valid n, monotonicity, integer-only, MAX_LEVEL → Infinity, range-error inputs; `xpToReach` cumulative match; `levelFromTotalXp` round-trip + clamp at MAX_LEVEL.
      - `milestones.test.ts` — exact level set match, unique ids/levels, ascending order, i18n key prefix; `milestoneAtLevel` hit/miss; `milestonesCrossing` boundary semantics (lower exclusive, upper inclusive) and multi-level captures.
      - `levelup.test.ts` — initial state, no-op zero, accumulate-without-cross, exact-threshold cross, overshoot bank, multi-level grant emits one event per cross, level-5 event carries `second_character_slot`, full-stack grant from L1→L100 emits all 8 milestone ids in order, MAX_LEVEL behaviour (events empty + overflow), boundary cross into MAX_LEVEL with residual; `checkLevelUp` null-when-banked-low, delta-when-over, null-at-cap; `assertValidProgression` rejects every invalid shape.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 15/15 ✓, `pnpm -r lint` 15/15 ✓, `pnpm -r test` 134/134 ✓ (88 combat + 46 progression), `pnpm -r build` 15/15 ✓.
32. **Step 4.30 done** (5 May 2026, vertical L slice — first server feature in Phase 4-E).
    - **`packages/domain-roster`** — both roster ops and skill-tree ops in one service (they share the same Prisma reads and audit semantics). Imports `@aetheria/schema-db`, `@aetheria/schema-api`, `@aetheria/core` (audit), `@aetheria/domain-progression`. No PixiJS, no client code.
    - **`src/types.ts`** — `AscensionTier = 0|1|2|3`, discriminated `UnlockRequirement` (`default | account_level | quest | pvp_rank | secret`), DTO shapes `RosterCharacter`, `RosterEntry`, `RosterListResult`, `SkillNode`, `SkillTreeView`, plus per-procedure `*Input` types. BigInts are stringified at the service boundary so the wire layer never has to think about it.
    - **`src/rules.ts`** — pure rules. `MAX_ASCENSION = 3`, `MAX_SKILL_LEVEL = 5`, `ascensionLevelGate(tier)` → 1/5/15/25, `skillPointsForLevel(level) = max(0, level-1)` (cap = 99 SP at L100, plenty for 12 nodes × 5 levels = 60 SP), `skillInvestmentCost(currentLevel)` = 1 SP until cap then `+Infinity`, `totalSpSpent` clamps corrupt rows to MAX, `parseUnlockRequirement` defensively normalises bad JSON to `{ kind: "secret" }`, `canUnlock(req, ctx)` returns either `{ ok: true }` or a typed `reason` (`level | quest | pvp_rank | secret`) so the UI can localise. `pvpTierMeets` ranks bronze→mythic on a 7-tier ordinal; unknown tiers reject.
    - **`src/service.ts` — `RosterService`** — narrow `RosterMysqlClient = Pick<MysqlClient, "character" | "userCharacter" | "skill" | "userSkill" | "inventory" | "item" | "profile" | "$transaction">`.
      - `list(userId)` — parallel reads of profile + owned UserCharacters (with `character` join) + full catalog; classifies non-owned catalog rows into `unlockable` vs `locked` via `canUnlock`. NotFound profile → 404.
      - `unlockCharacter({userId, characterId})` — checks profile + character + existing UserCharacter; rejects with 404 / 409 / 403 (with typed `reason` detail when forbidden). Audit `roster.character.unlock`.
      - `ascend({userId, userCharacterId})` — owner check, `MAX_ASCENSION` ceiling, then level gate via `ascensionLevelGate(targetTier)`. 409 at cap, 403 below gate (returns `currentLevel`/`requiredLevel`/`targetTier` in details). Audit `roster.character.ascend`.
      - `equipSkin({userId, userCharacterId, skinItemId|null})` — owner check; if non-null, look up `inventory.userId_itemId` unique key, require `quantity > 0` and `item.type ∈ {"skin","cosmetic"}`. Updates `userCharacter.equippedSkinId`. Audit `roster.character.equipSkin`.
      - `getSkillTree({userId, userCharacterId})` — owner check, joins all `Skill` rows for the character with the user's `UserSkill.level` map; computes `skillPointsTotal/Spent/Available`.
      - `investSkill({userId, userCharacterId, skillId})` — `$transaction` (re-reads SP totals inside tx to avoid race), 403 when no SP, 409 at MAX_SKILL_LEVEL, 400 when skill doesn't belong to character. `userSkill.upsert` (`{ userId, skillId, level: 1 }` on create, `{ level: { increment: 1 } }` on update). Audit `skills.invest`. Returns the refreshed tree.
      - `respec({userId, userCharacterId})` — `userSkill.deleteMany` for that user × that character (filter via Prisma relation), then refreshed tree. SP refund is implicit because `skillPointsForLevel` is purely level-derived. Audit `skills.respec`.
    - **`src/router.ts`** — two factories sharing one service: `createRosterRouter(svc)` (`list`, `unlockCharacter`, `ascend`, `equipSkin`) + `createSkillsRouter(svc)` (`tree`, `invest`, `respec`). All `protectedProcedure`s; userId comes from `ctx.auth.userId` (no impersonation surface). BigInt inputs validated by `z.string().regex(/^\d+$/).transform(BigInt)`. Audit ip/userAgent forwarded from `ctx.request`.
    - **Tests** — 20 vitest specs in `src/__tests__/rules.test.ts` (ascension gates, SP arithmetic, investment cost cap, totalSpSpent clamping, parseUnlockRequirement defensiveness, canUnlock for every requirement kind including PvP tier ordering). Service is integration-tested in 4.30 follow-up (Phase 4-G QA pass) — pure unit isolation via Prisma mock not added in this slice.
    - **Schema-api edit**: `AppError.forbidden` extended to accept an optional `details` arg so the service can surface structured reasons (level/required, reason code, item type). Backwards-compatible (default arg). One-line change in `packages/schema-api/src/errors.ts`.
    - **Wiring**: `apps/api/package.json` adds `@aetheria/domain-roster: workspace:*`. `apps/api/src/server.ts` instantiates `new RosterService({ mysql })` and passes it into `createAppRouter`. `apps/api/src/router.ts` imports + composes `createRosterRouter` (mounted as `roster`) and `createSkillsRouter` (mounted as `skills`).
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 16/16 ✓, `pnpm -r lint` 16/16 ✓, `pnpm -r test` 154/154 ✓ (88 combat + 46 progression + 20 roster), `pnpm -r build` 16/16 ✓.
33. **Step 4.31 done** (5 May 2026, vertical M slice — second feature in Phase 4-E).
    - **`packages/domain-inventory`** — server-authoritative item lifecycle. Imports `@aetheria/schema-db`, `@aetheria/schema-api`, `@aetheria/core` (audit). No client code, no Pixi.
    - **`src/types.ts`** — `ItemType = "weapon"|"armor"|"relic"|"consumable"|"material"|"skin"|"cosmetic"`, `EquipSlot = "weapon"|"armor"|"relic"` (skins go through `roster.equipSkin`, not here). DTOs: `InventoryItemMeta`, `InventoryStack`, `InventoryListResult`, `Recipe` + `RecipeInput`, plus per-procedure `*Input` and `*Result` shapes. BigInts → string at the service boundary.
    - **`src/rules.ts`** — pure rules.
      - `coerceItemType(raw)` lowercases + falls back to `"material"` for unknown types so a bad row can't crash a list response.
      - `isEquippable(t)`, `equipSlotFor(t)` — only weapon/armor/relic.
      - `tryStack(current, addQty, maxStack)` — discriminated `{ ok: true, newQuantity } | { ok: false, reason: "stack_overflow"|"invalid_quantity", … }`. Validates integer ≥ 0 / > 0 inputs.
      - `tryConsume(current, takeQty)` — symmetric `{ ok: true, newQuantity } | { ok: false, reason: "insufficient_quantity"|"invalid_quantity", … }`.
      - `parseRecipe(raw, outputItemId)` — defensively parses `Item.effect.recipe = { inputs: [{ itemId, quantity }, …], outputQuantity? }`. Rejects malformed shapes (non-positive quantities, fractional, empty inputs, self-referential output-as-input). Returns `null` when no recipe.
      - `evaluateCraft(recipe, ownedQuantities)` — checks every input against a `ReadonlyMap<itemId, qty>`, returns `{ ok: false, reason: "insufficient_quantity", itemId, need, have }` on the first miss.
    - **`src/service.ts` — `InventoryService`** — narrow `InventoryMysqlClient = Pick<MysqlClient, "inventory" | "item" | "userCharacter" | "$transaction">`. Six methods:
      - `list({ userId })` — `inventory.findMany` with `{ item: select(name, tier, type, iconUrl, maxStack) }` join, ordered by `itemId`.
      - `grant({ userId, itemId, quantity, source })` — `$transaction`: existence check → `tryStack` → upsert (create or `update.quantity = newQty`). 404 missing item, 409 stack overflow, 400 invalid qty. Audit `inventory.grant` with `{ quantity, source }`.
      - `consume({ userId, itemId, quantity, source })` — `$transaction`: `tryConsume`; if newQty == 0 and stack is currently equipped → 409 "Cannot consume an equipped stack to zero" (forces explicit unequip first); else delete row. Otherwise update quantity. 404 missing inventory row, 409 insufficient. Audit `inventory.consume`.
      - `equip({ userId, itemId, userCharacterId })` — `$transaction`: parallel reads of inventory (with item join) + userCharacter; reject non-equippable items, non-owners. Auto-unequips any other stack of the same `Item.type` currently bound to that character via `inventory.updateMany({ itemId: { not }, item: { type: slot } })` then sets `equippedToUserCharacterId` on the target stack. Audit `inventory.equip`.
      - `unequip({ userId, itemId })` — idempotent (returns current state if already unequipped). Audit `inventory.unequip` with `{ from }`.
      - `craft({ userId, outputItemId })` — read output Item.effect → `parseRecipe`; `$transaction`: read all owned input rows in one `findMany({ itemId: { in: [...] } })`, `evaluateCraft`, decrement (delete row at zero) input rows, `tryStack` against existing output row + `maxStack`, upsert output. Audit `inventory.craft` with `{ outputQuantity, inputs }`.
    - **`src/router.ts`** — `createInventoryRouter(svc)`. All player surfaces are `protectedProcedure`; userId comes from `ctx.auth.userId`. BigInt input via `z.string().regex(/^\d+$/).transform(BigInt)`. Quantity bounded `int().positive().max(1_000_000)`. Procedures: `list` (query), `consume`, `equip`, `unequip`, `craft` (mutations). `grant` uses `adminProcedure` (admin-only console surface) with explicit `userId` + `source` tag — gameplay grants from quest/shop/level-up should call `InventoryService.grant` server-side, not via tRPC.
    - **Wiring**: `apps/api/package.json` adds `@aetheria/domain-inventory: workspace:*`. `apps/api/src/server.ts` instantiates `new InventoryService({ mysql })`. `apps/api/src/router.ts` mounts `createInventoryRouter(deps.inventoryService)` as `inventory`.
    - **Tests** — 25 vitest specs in `src/__tests__/rules.test.ts` (coerceItemType normalisation; equippable/consumable predicates; tryStack overflow + invalid; tryConsume insufficient + invalid; parseRecipe well-formed/explicit-outputQty/bigint id, null on missing/malformed/self-referential, clamped non-positive outputQty; evaluateCraft ok/insufficient/zero-when-absent). Service-level tests deferred to Phase 4-G QA pass (Prisma mock harness not yet in place).
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 17/17 ✓, `pnpm -r lint` 17/17 ✓, `pnpm -r test` 179/179 ✓ (88 combat + 46 progression + 20 roster + 25 inventory), `pnpm -r build` 17/17 ✓.
34. **Step 4.32 done** (5 May 2026, horizontal S slice — pub-sub plumbing for Phase 4-E).
    - **`packages/domain-events`** — pure in-process event bus. Zero runtime deps. `tsconfig` extends `@aetheria/config/tsconfig/node`; vitest configured.
    - **`src/types.ts`** — discriminated `DomainEvent` union with `BaseDomainEvent { id, userId, occurredAt }` mixed in. Five members from the schedule: `LeveledUp { from, to, milestoneIds }`, `EnemyDefeated { runId, enemyId, archetype? }`, `LevelCompleted { runId, levelId, score, stars }`, `ItemCrafted { outputItemId, outputQuantity, inputs[] }`, `RunFinished { runId, levelId, status: "completed"|"failed"|"abandoned", score, stars }`. Helper `DomainEventOf<T>` extracts a single member; `DomainEventHandler<T>` types the handler signature; `NewDomainEvent<T>` strips `id|occurredAt|type` so `emit(type, payload)` fills the rest.
    - **`src/bus.ts` — `EventBus`** — separate `Map<DomainEventType, Set<Handler>>` for typed subscribers and a flat `Set` for wildcard (`subscribeAll`). `subscribe(type, handler)` returns a typed `Unsubscribe` fn. `publish(event)` runs every typed + wildcard subscriber with `Promise.all`, isolates errors (one bad handler can't poison the rest), re-throws single errors verbatim, wraps multiples in `AggregateError`. `emit(type, payload)` builds the event (UUID id + `new Date()` occurredAt as defaults) then publishes. `removeAll()` clears all subscribers — used by tests; should never run in production paths. Module-level singleton `events` mirrors the `audit` pattern.
    - **Wired one publisher**: `InventoryService.craft` now emits `ItemCrafted` (with stringified `userId`/`outputItemId` and the parsed inputs array) right after the audit write. Quests (4.33) and Battle-Pass (4.35) will subscribe in their own packages. The remaining four event types are emitted as their producers come online (combat → EnemyDefeated/LevelCompleted/RunFinished, progression → LeveledUp).
    - **Tests** — 17 vitest specs in `src/__tests__/bus.test.ts`. Cover: typed delivery, type isolation (no cross-talk), multi-subscriber fan-out, listenerCount tracking, unsubscribe detach, async-handler awaiting, wildcard delivery + co-existence with typed, single-error verbatim re-throw, multi-error AggregateError, wildcard-vs-typed isolation, `emit` auto-fill (id + occurredAt), `emit` explicit overrides, `emit` type narrowing, `emit` no-op when no handlers, `removeAll` clears both registries.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 18/18 ✓, `pnpm -r lint` 18/18 ✓, `pnpm -r test` 196/196 ✓ (88 combat + 46 progression + 20 roster + 25 inventory + 17 events), `pnpm -r build` 18/18 ✓.
35. **Step 4.33 done** (5 May 2026, vertical L slice — first event-bus subscriber in Phase 4-E).
    - **`packages/domain-quests`** — read + progress + claim pipeline. Imports `@aetheria/schema-db`, `@aetheria/schema-api`, `@aetheria/core` (audit), `@aetheria/domain-events`, `@aetheria/domain-progression`. Service-layer-only; no client code.
    - **`src/types.ts`** — discriminated `QuestRequirement` (5 kinds: `craft_item`, `defeat_enemies`, `complete_levels`, `level_up`, `finish_runs`), `QuestReward` (`item | xp` for MVP — currency/cosmetic deferred), `QuestProgress = { count }` (single counter is enough for every kind: count-based for craft/defeat/levels/runs, "highest level reached" for level_up). `QuestKind = "daily" | "weekly" | "seasonal" | "story"`, `QuestStatus = "active" | "completed" | "claimed"`. DTO `QuestCatalog` + `QuestEntry` (entry decorates a catalog row with the user's progress + isComplete flag). Per-procedure `*Input` types and `QuestClaimResult` shape.
    - **`src/rules.ts`** — pure rules.
      - `parseRequirement(raw)` — defensive parser; per-kind validation (positive integer counts/targets, optional itemId/archetype/levelId/status all string-only). Returns `null` on malformed (service skips those catalog rows so a bad migration can't crash the request).
      - `parseRewards(raw)` — drops malformed entries; only valid `item { itemId, quantity>0 }` and `xp { amount>0 }` survive. Never throws.
      - `parseProgress(raw)` — defaults to `{ count: 0 }`; rejects negative/fractional counts.
      - `eventMatchesRequirement(req, event)` — type-narrow check; respects optional filters (itemId, archetype, levelId, status).
      - `applyEventToProgress(req, progress, event)` — pure update. ItemCrafted increments by `Math.max(1, outputQuantity)` (so a recipe that produces 3 counts as 3); LeveledUp uses `Math.max(progress.count, event.to)` so it records highest level reached (replays/out-of-order events can't regress); count-based kinds clamp at the requirement target so the counter never overshoots.
      - `isRequirementComplete(req, progress)` — per-kind threshold check.
      - `isQuestActive(from, to, now)` — inclusive lower bound, exclusive upper bound (matches the Quest catalog window semantics).
    - **`src/service.ts` — `QuestService`** — narrow `QuestsMysqlClient = Pick<MysqlClient, "quest" | "userQuest" | "inventory" | "item" | "profile" | "$transaction">`. Optional `bus` dep defaults to the `@aetheria/domain-events` singleton; tests inject a fresh `EventBus`.
      - `dailyForUser/weeklyForUser({ userId, now? })` — finds active quests by kind via `activeFrom <= now < activeTo`, joins `UserQuest` rows (left-join in app code via `Map`), classifies each into `{ quest, progress, status, claimedAt, isComplete }`. Catalog rows with malformed requirements are silently dropped.
      - `start()` — subscribes one shared async handler to all 5 event types and returns the matching `Unsubscribe[]`. apps/api accumulates them and runs them on Fastify `onClose`.
      - `progress(event)` — public so tests can drive without the bus. Reads candidate quests active at `event.occurredAt`, parses requirements, filters by `eventMatchesRequirement`. For each match, reads the `UserQuest` row (skip `claimed` — terminal), computes new progress; if unchanged, no-op; if `isRequirementComplete`, auto-promote status to `completed`. `userQuest.upsert` per match.
      - `claim({ userId, questId })` — `$transaction`:
        1. read UserQuest, reject 404 (no row), 409 (already `claimed`), `QUEST_NOT_READY` (still `active`).
        2. atomic conditional update via `updateMany({ where: { ..., status: "completed" }, data: { status: "claimed", claimedAt: now } })` — guarantees idempotency under concurrent claims (only one updateMany returns count=1).
        3. distribute rewards inline via direct Prisma writes:
           - `item` reward: lookup item → max-stack check against existing inventory row → upsert (`update.quantity = next` or `create`). 409 on overflow, 404 on missing item.
           - `xp` reward: read `Profile.accountXp`, recompute `{ level, xpIntoLevel } = levelFromTotalXp(profile.accountXp)`, run `addXp({ ... }, amount)`, write `accountLevel + accountXp` back. Collect any `events` for post-tx emit.
        4. return `{ granted, leveledUp }`.
      - Audit `quest.claim` with reward digest.
      - **Post-tx**: emit one `LeveledUp` per crossed level via the bus — listeners (battle pass, milestone notifications) react against a committed Profile.
    - **`src/router.ts`** — `createQuestsRouter(svc)`: `daily` + `weekly` (queries), `claim` (mutation). All `protectedProcedure`. No `progress` procedure — progression is event-driven, players never push it. BigInt input via `z.string().regex(/^\d+$/).transform(BigInt)`.
    - **Wiring**: `apps/api/package.json` adds `@aetheria/domain-quests: workspace:*`. `apps/api/src/server.ts` instantiates `new QuestService({ mysql })`, calls `start()` to wire bus subscriptions, accumulates the returned `Unsubscribe[]` and tears them down on Fastify `onClose` so hot-reload doesn't leak handlers.
    - **Tests** — 24 vitest specs in `src/__tests__/rules.test.ts` (parseRequirement: every kind + null/missing/zero/fractional/unknown rejections + invalid-optional drops; parseRewards: filters items+xp + drops invalid; parseProgress: default + integer + reject negative/fractional; eventMatchesRequirement: every kind incl. optional filters and cross-type rejection; applyEventToProgress: outputQuantity-aware increment, clamp at target, +1 per defeat/level/run, max() for level_up, ignore mismatched events; isRequirementComplete: count-based + level_up; isQuestActive: inclusive lower / exclusive upper / outside window).
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 19/19 ✓, `pnpm -r lint` 19/19 ✓, `pnpm -r test` 220/220 ✓ (88 combat + 46 progression + 20 roster + 25 inventory + 17 events + 24 quests), `pnpm -r build` 19/19 ✓.
36. **Step 4.34 — `packages/progression-runtime` (account-XP runtime)** (5 May 2026):
    - Shared bridge between the pure `domain-progression.addXp` engine and the persisted `Profile.accountXp` / `Profile.accountLevel` columns + the `LeveledUp` bus event. One canonical pipeline for combat, quest-claim, battle-pass, and admin grants.
    - **`src/service.ts`** — two surfaces:
      - `applyAccountXp(tx, userId, amount)` — runs **inside** a caller-owned `$transaction`. Reads Profile, calls `addXp(levelFromTotalXp(accountXp))`, writes back `accountLevel` + `accountXp`, returns `{ level, totalXp, xpIntoLevel, overflowXp, leveledUp[] }` where each `leveledUp` entry is `{ from, to, milestoneIds: string[] }`. Throws `AppError.badRequest` for non-positive/fractional amounts and `AppError.notFound("user", userId)` when no Profile exists.
      - `grantAccountXp({ mysql, bus? }, { userId, amount, source, ip?, userAgent? })` — top-level convenience: opens its own `$transaction` calling `applyAccountXp`, writes `account.xp_grant` audit row, then emits one `LeveledUp` per crossed level on the bus **after commit** so subscribers see committed Profile state.
    - **`ProgressionMysqlClient = Pick<MysqlClient, "profile" | "$transaction">`** — narrow contract for testability.
    - **Refactor**: `QuestService.claim` xp-reward branch now calls `applyAccountXp(tx, userId, r.amount)` instead of duplicating the read-recompute-write-collect block. The post-tx `LeveledUp` emit loop already in `QuestService` is unchanged. Net: 21 LOC removed from QuestService, no behaviour change.
    - **Tests** — 7 vitest specs in `src/__tests__/service.test.ts` using a hand-rolled fake `tx` (no Prisma at runtime): rejects non-positive amounts before reading profile, throws notFound for missing Profile, writes back without level-up for sub-level grants, emits N events for multi-level grants (each `to === from + 1`), `grantAccountXp` opens tx + emits per crossed level, no emit when no level crossed, propagates notFound without emitting.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 20/20 ✓, `pnpm -r lint` 20/20 ✓, `pnpm -r test` 227/227 ✓ (88 combat + 46 progression + 20 roster + 25 inventory + 17 events + 7 progression-runtime + 24 quests), `pnpm -r build` 20/20 ✓.
37. **Step 4.35 — `packages/domain-battlepass` (seasonal track service)** (5 May 2026):
    - Vertical M slice. One season at a time. Schema constraint: `BattlePassProgress` exposes a single `tier` int (highest claimed) + `xp` + `premium`, so the service models claims as **one step per tier** that atomically grants both the free reward and (when `premium=true`) the premium reward for that tier.
    - **`src/rules.ts`** — pure:
      - `XP_PER_TIER = 1000`, `MAX_TIER = 100`. `xpForTier(N) = N * XP_PER_TIER` (linear). `tierFromXp(xp) = floor(xp / 1000)` clamped.
      - `parseTracks(raw)` — defensive parse of `{ free:[{tier, reward}], premium:[…] }`. Drops malformed tiers, sorts ascending, dedupes by `tier` (later wins). `parseReward` only allows `{kind:"item",itemId,quantity}` or `{kind:"xp",amount}` with positive integer fields.
      - `eventXpDelta(event)`: `EnemyDefeated=10`, `ItemCrafted=20`, `LevelCompleted=100`, `LeveledUp=100`, `RunFinished="completed"=50` else `0` (failed/abandoned runs grant nothing — closes the abort-farming loop).
      - `evaluateClaim(tracks, tier, state)` — tiers must be sequential (`tier === claimedTier + 1`); `tierFromXp(xp) >= tier`; collects free reward (always) + premium reward (only when `state.premium`); returns `{ ok, rewards }` or `{ ok:false, reason }`.
      - `isSeasonActive(from, to, now)` — inclusive lower / exclusive upper.
    - **`src/service.ts` — `BattlePassService`** — narrow `BattlePassMysqlClient = Pick<MysqlClient, "battlePassSeason" | "battlePassProgress" | "inventory" | "item" | "profile" | "$transaction">`. Three responsibilities:
      1. **Read** — `currentSeason(now?)` finds the row where `startsAt <= now < endsAt` (latest by `startsAt` if multiple); `progress(userId, now?)` joins it to `BattlePassProgress` and computes `currentTier = tierFromXp(xp)`.
      2. **Accrue** — `start(): Unsubscribe[]` subscribes one shared async handler to all 5 bus event types. `accrue(event)` computes `eventXpDelta`, finds the active season at `event.occurredAt`, and `upsert`s `BattlePassProgress` with `xp: { increment: delta }` (or creates row at delta).
      3. **Claim** — `claim({ userId, seasonId, tier })`: atomic `$transaction`. Read user state, run `evaluateClaim`, error mapping → `AppError.badRequest`/`alreadyClaimed`/`invalidAction`/`notFound`. If row exists, `updateMany({ where: { userId, seasonId, tier: state.claimedTier }, data: { tier } })` requires `count === 1` for idempotency; otherwise `create` row at the new tier. For each reward: items → max-stack-checked Inventory upsert; xp → `applyAccountXp(tx, userId, amount)` from `progression-runtime`. Audit `battlepass.claim`. Post-tx emit one `LeveledUp` per crossed account-level.
    - **`src/router.ts`** — `createBattlePassRouter(svc)`: `currentSeason` (query, no input), `progress` (query, userId from ctx), `claim` (mutation: `{ seasonId: bigIntId, tier: int.positive().max(1000) }`). All `protectedProcedure`. **No `progress` push procedure** — accrual is bus-driven, players never push.
    - **Wiring**: `apps/api/package.json` adds `@aetheria/domain-battlepass: workspace:*`. `apps/api/src/server.ts` instantiates `new BattlePassService({ mysql })`, calls `start()`, and accumulates `bpUnsubscribes` torn down on Fastify `onClose` alongside the quest unsubscribes. Mounted at `battlepass` in the app router.
    - **Tests** — 20 vitest specs in `src/__tests__/rules.test.ts` (parseTracks: empty/malformed-drops/sort-dedupe/non-positive rejection; maxTier across both tracks; xpForTier + tierFromXp incl. clamp + non-positive; eventXpDelta per type incl. RunFinished status filter; evaluateClaim: out-of-range, already_claimed, must_claim_in_order, tier_locked, free-only when no premium, both rewards when premium=true at full-row tier, premium=true at free-only tier returns just free, no_reward at empty tier; isSeasonActive boundaries).
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 21/21 ✓, `pnpm -r lint` 21/21 ✓, `pnpm -r test` **247/247 ✓** (88 combat + 46 progression + 20 roster + 25 inventory + 17 events + 7 progression-runtime + 24 quests + 20 battlepass), `pnpm -r build` 21/21 ✓.
38. **Step 4.36 — Web frontend screens (Roster, Skill tree, Quest tracker HUD, Battle Pass)** (5 May 2026):
    - All 4 surfaces are `"use client"` pages under `apps/web/src/app/`, gated by `RequireAuth`. Read paths use `trpc.*.useQuery`; mutations invalidate the matching reads via `trpc.useUtils()`.
    - **`/roster` (`app/roster/page.tsx`)** — calls `roster.list`. Three sections: Owned (with Skill-tree drill-link to `/roster/[id]`, Ascend button gated `ascension < 3`, Unequip-skin button when a skin is equipped); Unlockable now (Unlock button → `roster.unlockCharacter`); Locked (read-only with `formatUnlock(unlock)` summarising the requirement).
    - **`/roster/[userCharacterId]` (`app/roster/[userCharacterId]/page.tsx`)** — Skill tree screen. Validates the param is `/^\d+$/` before enabling `skills.tree`. Header shows `available / total (spent)` SP + a Respec button (disabled when `spent === 0`). Each node card shows lvl/max + an "Invest +1" button disabled at max-level or zero SP.
    - **`components/game/QuestTracker.tsx`** — shared component with `variant: "hud" | "page"`. Reads `quests.daily` + `quests.weekly`, draws a per-quest progress bar (`min(count, goal) / goal`), shows the reward summary, and a Claim button enabled when `e.isComplete && status !== "claimed"`. Local `requirementLabel` / `rewardLabel` formatters cover all 5 requirement kinds + both reward kinds. **`/quests` (`app/quests/page.tsx`)** wraps it in `variant="page"`.
    - **`/battlepass` (`app/battlepass/page.tsx`)** — reads `battlepass.progress`. When `season === null` shows "No active season". Otherwise: header card with name, dates, `state.currentTier / season.maxTier`, XP, Free/Premium label, and a 0–100 % progress bar across the *current* tier (`(xp - currentTier*1000) / 1000`). Body lists every distinct tier across both tracks; rows are highlighted when `tier === claimedTier + 1 && currentTier >= tier`; Claim button calls `battlepass.claim` (server enforces strict in-order and rejects skips with `must_claim_in_order`). **Type-narrowing trick**: `inferRouterOutputs<AppRouter>["battlepass"]["progress"]` then `Exclude<…, { season: null }>` gives `SeasonCatalog` + `UserState` for the body component (TS otherwise narrows the union to `{}` in JSX).
    - **Menu wiring** (`apps/web/src/app/menu/page.tsx`): replaced disabled Codex / Shop / Settings tiles with active **Roster / Quests / Battle Pass** tiles. New Journey + Continue + Multiplayer (still disabled) remain.
    - **Smoke** (5 May 2026): `pnpm --filter @aetheria/web typecheck` ✓, `lint` ✓ (auto-fix dropped a couple of unnecessary type assertions), `build` ✓ (new static routes: `/roster`, `/roster/[userCharacterId]` (ƒ), `/quests`, `/battlepass`). Repo-wide `pnpm -r typecheck` 21/21, `lint` 21/21, `test` 247/247 — all green.
39. **Step 4.36b — `packages/domain-social` moderation rules** (5 May 2026):
    - Phase 4-F foundation; pure-rules-only package (no service / router / DB), peer with `domain-progression`.
    - **`src/profanity.ts`** — `DEFAULT_PROFANITY` seed list (5 placeholder words), `normalizeForMatch(s)` (NFKC + lower + leet-fold `0/1/3/4/5/7/@/$` → `o/i/e/a/s/t/a/s`, length-preserving), `containsProfanity(text, list?)` and `redactProfanity(text, list?)` use a shared `findMatches` walker with whole-word boundary check (`!isWordChar(before) && !isWordChar(after)` so substrings like "scunthorpe" don't false-match). Redact replaces hits with `*` of equal length, preserves casing/punctuation outside the span.
    - **`src/rules.ts`** — `validateContent(raw, limits?, list?)` returns discriminated `ValidationResult`: rejects on control-char regex `/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/` (allows \t \n \r), empty-after-trim, `>maxChars`, `>maxLines`; on accept emits `{ ok: true, content: trimmed, flagged }` with `flagged` from `containsProfanity` (callers decide redact-vs-audit, never auto-reject for profanity). `checkRateLimit(history, now, policy)` is a sliding-window check (`history` filtered to `(now - windowMs, now]`), returns `{ ok: true }` or `{ ok: false, retryAfterMs: max(1, oldest + windowMs - now) }`. `isMutedAt(muteUntil, now)` returns true while `muteUntil > now`. `shouldFlagMessage({ content, recentSameContentCount, repeatThreshold = 3, profanityList? })` flags on profanity OR same-content-spam ≥ threshold.
    - **Defaults**: `DEFAULT_CONTENT_LIMITS = { maxChars: 500, maxLines: 8 }`. `DEFAULT_RATE_LIMITS` per `ChannelType`: global 3/10s, guild 5/10s, party 8/10s, whisper 5/10s.
    - **`ChannelType`** re-exported from `@aetheria/shared-types` (mirrors `ChatMessage.channelType` enum in `schema-db`).
    - **Tests** — 22 vitest specs across `__tests__/profanity.test.ts` (8) + `__tests__/rules.test.ts` (14): leet normalisation, whole-word matching, custom-list override, redaction preserving outer text, all 4 `validateContent` reject paths + profanity-flag-but-accept, rate-limit allow/block/window-pruning, mute-window boundaries, spam-flag heuristic.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 22/22 ✓, `pnpm -r lint` 22/22 ✓, `pnpm -r test` **269/269 ✓** (was 247; +22 from `domain-social`). No service/router yet — those land in 4.37–4.39.
40. **Step 4.37 — Guild service (create / invite / respond / kick / promote / startRaid)** (5 May 2026):
    - **Schema migration `0002_guild_invite`**: added `guild_invites` MySQL table — `id`, `guild_id`, `target_user_id`, `inviter_user_id`, `status` (pending|accepted|declined|cancelled|expired), `created_at`, `responded_at`, `expires_at`. Indexes: `(guild_id, status)`, `(target_user_id, status)`, `(inviter_user_id)`. Cascade delete on Guild + User. Mirrored in raw `db/mysql/01_init.sql`. Prisma client regenerated via `pnpm --filter @aetheria/schema-db generate:mysql`.
    - **`packages/domain-social/src/guild/`** subpackage: `types.ts` (GuildRole / GuildInviteStatus / GuildSummary / GuildDetail / GuildInviteRow / per-op input types), `rules.ts` (pure perms: `isHigherRank`, `canInvite`, `canKick`, `canPromote` (leader-only + reject no-op), `canStartRaid` (leader-only); name/tag bounds 3–64 / 2–4; `inviteExpiresAt(now, ttlMs=7d)` + `isInviteFresh`), `service.ts` (`GuildService` with `Pick<MysqlClient, "guild" | "guildMember" | "guildInvite" | "$transaction">` deps + injectable `clock`), `router.ts` (`createGuildRouter(svc)` exposing `get`, `pendingInvites`, `create`, `invite`, `respond`, `kick`, `promote`, `startRaid` — all `protectedProcedure`, `userId` from ctx).
    - **Service guarantees**: `create` rejects if user already in any guild; atomically writes `Guild` + `GuildMember{role:"leader"}`. `invite` rejects existing membership + existing pending invite per (guild, target). `respond` rejects non-target actor + non-pending status + expired (auto-marks expired); accept inserts `GuildMember{role:"member"}` inside `$transaction` with a re-read guard against TOCTOU joins. `kick` enforces `canKick(actor.role, target.role)`. `promote` enforces leader-only; promoting to `leader` is a 3-write transaction (demote actor → officer, promote target → leader, update `Guild.leaderUserId`). `startRaid` is leader-only, writes audit log, returns `{ guildId, raidId, startedAt }` — full raid lifecycle deferred to weekly scheduler (4.57).
    - **Audit**: every mutation writes one `audit.write` (`guild.create`, `guild.invite`, `guild.invite.{accept,decline}`, `guild.kick`, `guild.promote`, `guild.raid.start`) with actor, targetType, targetId, payload (BigInts stringified), ip, userAgent.
    - **Errors via `AppError`**: `notFound`, `forbidden`, `badRequest`, `conflict`. Always thrown — router wraps in `asTrpcError`.
    - **Wiring**: `apps/api/package.json` adds `@aetheria/domain-social: workspace:*`. `apps/api/src/server.ts` instantiates `new GuildService({ mysql })`. `apps/api/src/router.ts` mounts `guild: createGuildRouter(deps.guildService)`.
    - **Tests** — 13 vitest specs in `__tests__/guild-rules.test.ts` covering rank ordering, invite/kick/promote/raid permission matrix (incl. officer-can-kick-member-only, leader-cannot-kick-leader, no-op promote rejected), TTL helpers (default 7d, custom ms, fresh-vs-expired boundary), bound sanity.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 22/22 ✓, `pnpm -r lint` 22/22 ✓, `pnpm -r test` **282/282 ✓** (was 269; +13 from guild-rules).
41. **Step 4.38 — Friends service (list / request / respond)** (5 May 2026):
    - Operates on existing `friendships` MySQL model (no schema migration). One canonical row per pair, keyed `(userId = requester, friendId = target)` with `status ∈ {pending, accepted, blocked}`.
    - **`packages/domain-social/src/friends/`** subpackage: `types.ts` (`FriendStatus`, `FriendEdge { otherUserId, status, direction: "outgoing"|"incoming"|"accepted", createdAt }`, `FriendList`, per-op inputs), `rules.ts` (pure `toFriendStatus`, `buildFriendList(viewerUserId, rows)` — classifies into accepted / outgoingPending / incomingPending / blocked, only surfaces blocks the viewer initiated so blocks-against-viewer remain hidden), `service.ts` (`FriendsService` with `Pick<MysqlClient, "friendship">`), `router.ts` (`createFriendsRouter(svc)` exposing `list`, `request`, `respond`).
    - **Service guarantees**: `request` rejects self-target, blocks in either direction (`forbidden`), and any existing relationship in either direction (`conflict`). `respond` requires a pending row keyed exactly `(requesterUserId → actor)`; accept → update status to `accepted`; decline → delete the row (no audit-row pollution). Audit logs written for `friend.request`, `friend.accept`, `friend.decline`.
    - **`list(userId)`** returns a single `findMany({ OR: [{ userId }, { friendId: userId }] })` and lets `buildFriendList` classify. Accepted edges always carry `direction: "accepted"` so UI can render a single "Friend" pill regardless of who initiated.
    - **Wiring**: `apps/api/src/server.ts` adds `new FriendsService({ mysql })`. `apps/api/src/router.ts` mounts `friends: createFriendsRouter(deps.friendsService)`.
    - **Tests** — 5 vitest specs in `__tests__/friends-rules.test.ts` (status defaulting, classification of mixed pending/accepted, accepted-merge regardless of initiator, viewer-only block visibility, empty input). Lint auto-fix collapsed a `!row || row.status !== "pending"` guard into `row?.status !== "pending"`.
    - **Smoke** (5 May 2026): repo-wide `pnpm -r typecheck` 22/22 ✓, `pnpm -r lint` 22/22 ✓, `pnpm -r test` **287/287 ✓** (was 282; +5 from friends-rules).
42. **NEXT — Step 4.39**: Chat service (`send` / `history` / `report`; flagged-message audit) — vertical M, deps 4.7 + 4.36. Will use the moderation rules from 4.36 (validateContent / containsProfanity / shouldFlagMessage / channel rate-limits), persist via existing `chat_messages` model, and fan out via the realtime infra coming in 4.40–4.41.

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
