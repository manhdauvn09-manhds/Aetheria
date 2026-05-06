# Aetheria — Audit Report (Step 7+)

*Generated: 6 May 2026 · 3 audits run via Explore subagents · Findings tracked here for follow-up.*

## Summary

| Audit | Critical | High | Medium | Low | Total |
| ----- | -------- | ---- | ------ | --- | ----- |
| SEO | 9 | 0 | 4 | 2 | 15 |
| Frontend Security | 2 | 0 | 2 | 1 | 5 |
| Backend Security | 2 | 3 | 7 | 3 | 15 |
| **TOTAL** | **13** | **3** | **13** | **6** | **35** |

### Hardening pass 1 (post-audit)
Fixed 8 of 35 findings in commit batch:
- **F1, F2** — CSP + 5 security headers added to `apps/web/next.config.mjs`.
- **B1, B4** — Per-IP auth-route rate limiter (10 req / 60s) over 6 sensitive procedures (`auth.login/signup/refreshToken/requestPasswordReset/confirmPasswordReset/requestEmailVerification`) in `apps/api/src/plugins.ts`.
- **B7** — `redactEmail()` helper in `packages/domain-auth/src/redact.ts`; replaced 4 raw-email audit payloads with `emailRedacted: "a***@domain"` form. +4 tests.
- **S2, S3** — `apps/web/src/app/sitemap.ts` + `apps/web/src/app/robots.ts` (auth-gated routes disallowed).
- **S5** — Manifest icons now reference `/icon.svg` (vector, scales to any size); SVG asset shipped at `apps/web/public/icon.svg`.
- **S8, S10** — Root layout extended: `metadataBase`, `openGraph`, `twitter`, `alternates.canonical`, `alternates.languages` + `viewport` export (themeColor / viewport-fit).
- **B3 — false positive**: inventory router already passes `ctx.auth.userId` (not client input); finding closed without code change.

### Remaining (27 open)

These findings are **separate from the Step 5 review** (`buglist/REVIEW.md`). They are operational hardening + production readiness items, not Step 4 correctness bugs.

---

## 1. SEO Audit (Next.js 15 web app)

**Scope**: `apps/web` — 14 routes including `/`, `/menu`, `/play`, `/pvp`, `/guild`, `/leaderboard`, etc.

### S-CRIT (9 critical)
- **S1** Missing page-level `metadata` export on 13 pages: `/menu`, `/login`, `/signup`, `/play`, `/pvp`, `/guild`, `/chat`, `/leaderboard`, `/admin`, `/battlepass`, `/friends`, `/roster`, `/realms`.
- **S2** No `apps/web/src/app/sitemap.ts` (or `sitemap.xml`).
- **S3** No `apps/web/src/app/robots.ts` (or `robots.txt`).
- **S4** No JSON-LD structured data (Schema.org `Game` / `VideoGame`).
- **S5** PWA manifest references `/icon-192.png` + `/icon-512.png` but files don't exist in `public/`.
- **S6** No `generateMetadata()` for `/play/[levelNumber]`, `/realms/[realmId]`, `/roster/[userCharacterId]`.
- **S7** No `alternates.languages` (hreflang) for `en` + `vi` locales.

### S-MED (4 medium)
- **S8** Root layout has no `openGraph` / `twitter` card metadata.
- **S9** No `alternates.canonical` strategy for multi-locale.
- **S10** Viewport meta not explicitly set (relies on Next.js auto-injection).

### S-LOW (2 low)
- **S11** No `next/image` usage (acceptable while game UI has no static images).
- **S12** Service worker is SEO-safe ✓ (informational).

---

## 2. Frontend Security Audit

**Scope**: `apps/web` — XSS, CSP, secret leakage, cookies, CSRF.

### F-CRIT (2 critical)
- **F1** No Content-Security-Policy header configured. `apps/web/next.config.mjs` has no `headers()` export.
- **F2** No HTTP security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security).

### F-MED (2 medium)
- **F3** Refresh cookie uses `SameSite=Lax` (not `Strict`) at `apps/web/src/lib/auth/proxy.ts:80`. CSRF protection relies on `httpOnly` + `Lax` only.
- **F4** Email + display name + roles persisted to `localStorage` at `apps/web/src/store/session.ts:64`. Increases attack surface if XSS vector emerges.

### F-LOW (1 low)
- **F5** `console.warn` in `apps/web/src/components/pwa/SwRegister.tsx:18` (dev-only, gated).

### F-PASS (verified safe)
- ✓ No `dangerouslySetInnerHTML` / `innerHTML` / `eval` usage.
- ✓ No secrets in client bundle; `NEXT_PUBLIC_*` only holds public URLs.
- ✓ Refresh token in `httpOnly` cookie; access token in-memory only.
- ✓ Service worker excludes `/trpc` and `/api/`.
- ✓ Zod schemas on all auth endpoints.
- ✓ No `target="_blank"` without `rel="noopener"`.
- ✓ No open redirects from query params.
- ✓ Dependencies current (Next 15, React 18.3, Socket.IO 4.8).

---

## 3. Backend Security Audit

**Scope**: `apps/api`, `apps/realtime`, `apps/worker`, `packages/domain-*`.

### B-CRIT (2 critical)
- **B1** No endpoint-specific rate limiting. Global limit (100 req / 60s in `apps/api/src/plugins.ts:25-42`) applies uniformly. Login / signup / password-reset endpoints not separately throttled — insufficient brute-force protection. Allows ~1.67 attempts/sec → 10k-password dictionary attack in ~100 min.
- **B2** Refresh-token store cleanup: in-memory implementation in `packages/domain-auth/src/refresh-store.ts` only checks expiry on read (line 53). No background GC; revoked tokens linger in memory until accessed. Redis store OK (line 87, EX TTL).

### B-HIGH (3 high)
- **B3** Inventory list does not verify resource ownership: `packages/domain-inventory/src/service.ts:115` uses `input.userId` directly without confirming it matches `ctx.auth.userId`. Potential cross-user inventory peek.
- **B4** Refresh-token endpoint shares the global rate limit. Should have its own (stricter) bucket.
- **B5** WebSocket JWT has no `jti` for replay protection. `apps/realtime/src/auth.ts` accepts the same access token used for `apps/api`. Captured token usable for both services within 15-min TTL.

### B-MED (7 medium)
- **B6** JWT secret max-length not bounded (only `min(32)` enforced in `apps/api/src/env.ts:20-21` + `apps/realtime/src/env.ts:20`).
- **B7** Email PII in audit log payload at `packages/domain-auth/src/service.ts:232,292,631`: `payload: { method: "email", email }`. Junior staff querying audit table sees plaintext email.
- **B8** Discord OAuth flow does not verify `state` parameter at server (`packages/domain-auth/src/oauth.ts:85-115`); relies on NextAuth client-side. PKCE not enforced.
- **B9** Worker job lock TTL not configurable per job (`apps/worker/src/scheduler.ts`). Long-running jobs may have lock expire mid-execution → duplicate runs.
- **B10** tRPC error formatter not verified to mask internal stack traces in prod (`apps/api/src/server.ts:187` only logs).
- **B11** Realtime `chat:join` only validates `channelId` is numeric (`apps/realtime/src/server.ts:124-133`); no membership check at realtime layer. Relies on API gate.
- **B12** Shop refund logic not yet covered for duplication abuse (R1 fixed amount/qty derivation but no idempotency on transaction id).

### B-LOW (3 low)
- **B13** SQLite per-user file integrity not enforced (`packages/domain-combat-runtime/src/service.ts:101`). User-side file tampering bypasses replay-hash check (snapshot is also corrupted).
- **B14** No audit gate before sensitive cleanups (e.g., user delete) — verify all destructive cron paths log first.
- **B15** No state CSRF check at API layer (delegated to NextAuth at apps/web; design-appropriate).

### B-PASS (verified safe)
- ✓ Argon2id parameters meet OWASP 2024 (19 MiB / t=2 / p=1).
- ✓ Refresh-token rotation invalidates old `jti` before issuing new pair.
- ✓ CORS origin allowlist + credentials.
- ✓ Admin procedures use `adminProcedure` (all 6 in `domain-admin/router.ts`).
- ✓ Env validation via zod at boot for all 3 apps.
- ✓ No hardcoded secrets in `apps/**/*.ts` or `packages/**/*.ts`.
- ✓ Combat runtime is server-authoritative with hash verification (R3 fixed).
- ✓ Worker distributed lock (Redis SET NX + Lua CAS release).
- ✓ All `$queryRawUnsafe` / `$executeRawUnsafe` use positional `?` bindings (no SQL injection).

---

## Recommended fix order

1. **F1, F2** — Add CSP + security headers in `next.config.mjs` (1 file, low risk).
2. **B1, B4** — Per-route rate limit on `/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/forgot-password` (Fastify rate-limit plugin allows per-route override).
3. **B3** — Force `userId = ctx.auth.userId` server-side in inventory + similar list endpoints.
4. **B7** — Hash/redact email in audit payloads (or move to separate PII-tagged column).
5. **S2, S3, S5** — Add `sitemap.ts` + `robots.ts` + ship icon files.
6. **S1, S6** — Per-page metadata + `generateMetadata()` for dynamic routes.
7. **B5** — Add `jti` claim + per-service revocation list (or use shorter realtime tokens).
8. **B2** — Background cleanup loop in in-memory refresh-token store.
9. Remaining medium/low items as time permits.

These items are tracked here for a future hardening pass; quality gate (Step 7) does not block on them.
