# Aetheria — Production Test Suite

End-to-end smoke + functional tests, written in PowerShell. One command runs
everything; each test reports PASS/FAIL with an error excerpt; exit code is
non-zero on any failure (CI-friendly).

## Quick start

```powershell
.\scripts\test\run-all.ps1
```

Output looks like:

```
============================================================
  Aetheria production test suite
  Target:   https://aetheria.games-core.com
  API:      https://aetheria-api.games-core.com
  Realtime: https://aetheria-ws.games-core.com
  Started:  2026-05-16 16:01:23
============================================================

───── [01] Infrastructure & edge ──────────────────────────
  [PASS] DNS resolves aetheria.games-core.com
  [PASS] DNS resolves aetheria-api.games-core.com
  [PASS] DNS resolves aetheria-ws.games-core.com
  [PASS] Reach web /
  [PASS] Reach api /health
  [PASS] Reach realtime /healthz
  [PASS] Cloudflare proxy active (cf-ray header)
  [PASS] Host Caddy via header present
  [PASS] API /health body shape
  [PASS] Realtime /healthz body shape
  [PASS] HTTP is upgraded to HTTPS by Cloudflare
   suite: 11 pass / 0 fail   (1.8s)
...

============================================================
  RESULT: 47 passed / 0 failed   (47 total)
  Duration: 28.4s
============================================================
```

## Filtering / partial runs

```powershell
.\scripts\test\run-all.ps1 -Suite auth         # only run suites whose filename contains "auth"
.\scripts\test\run-all.ps1 -Suite auth,save    # match several
.\scripts\test\run-all.ps1 -FailFast           # stop on first failure
.\scripts\test\run-all.ps1 -ListOnly           # list suites without running
```

## Environment overrides

Useful when you run against a staging stack on a different domain:

```powershell
$env:AETHERIA_BASE_URL = 'https://staging.aetheria.example.com'
$env:AETHERIA_API_URL  = 'https://staging-api.aetheria.example.com'
$env:AETHERIA_WS_URL   = 'https://staging-ws.aetheria.example.com'
.\scripts\test\run-all.ps1
```

## Layout

```
scripts/test/
  run-all.ps1                  # orchestrator (this is what you call)
  README.md                    # this file
  lib/
    _helpers.ps1               # Test-Case, Assert-*, Invoke-TrpcQuery, Get-TestUser, …
  suites/
    01-infra.ps1               # DNS / HTTPS / cf-ray / Caddy hops
    02-security-headers.ps1    # CSP / HSTS / COOP / X-Frame / CORS preflight
    03-auth.ps1                # signup / login / refresh / logout / no-enumeration
    04-account.ps1             # profile read+update, duplicate-name conflict
    05-world-runs.ps1          # realms list, start/resume/abandon run, ownership scope
    06-save-state.ps1          # save slot CRUD + optimistic-concurrency reconcile
    07-realtime.ps1            # Socket.IO handshake + JWT auth
    08-misc-trpc.ps1           # inventory / roster / quests / pvp / shop / health.ping
```

## Adding a new test

1. Append it to an existing suite, or create a new file `suites/NN-name.ps1`.
   The runner picks files up automatically (lexical order).
2. Wrap each assertion in `Test-Case`:

   ```powershell
   Test-Case 'world.realms returns 5 realms' {
       $r = Invoke-TrpcQuery -Procedure 'world.realms'
       Assert-Eq 5 $r.Count 'realm count'
   }
   ```
3. Helpers available inside `Test-Case`:
   - `Get-TestUser` — signs up a unique throw-away user, caches token for the run.
   - `Invoke-TrpcQuery -Procedure x [-Input y] [-NoAuth]` — GET batch call.
   - `Invoke-TrpcMutation -Procedure x -Input y [-NoAuth]` — POST batch call.
   - `Invoke-HttpRaw -Method M -Url U -Body B -Headers H -Session S` — low-level
     wrapper that preserves the error body for assertions.
   - `Assert-Eq`, `Assert-True`, `Assert-Match`, `Assert-NotNull`.
4. Surround related cases with `Start-Suite '08' 'Name'` / `End-Suite` so the
   per-suite pass-count line is correct.

## CI integration

`run-all.ps1` exits 0 on full pass, 1 otherwise. Drop it into any CI step:

```yaml
- name: Smoke
  shell: pwsh
  run: .\scripts\test\run-all.ps1
```

## Notes / quirks

- Each run creates ~5 throw-away accounts under `ts-…@aetheria-test.invalid`.
  They accumulate in the DB. Cleanup is intentionally not automated — if you
  want it, write a small script that calls `account.deleteAccount` per user.
- Suite 02 locks in the `x-aetheria-client` CORS allow-headers entry. If you
  ever change the web client to send a NEW custom header, add it to the API's
  `allowedHeaders` (in `apps/api/src/plugins.ts`) AND extend the test in
  `02-security-headers.ps1`.
- Suite 07 only exercises the Socket.IO handshake (the polling probe). A full
  WebSocket session is out of scope for PowerShell-based smoke tests.
- Rate-limit handling: each suite uses a fresh user (token bucket is keyed by
  hashed bearer). If you run the suite repeatedly back-to-back you may still
  bump the per-IP signup limit — wait 60s if you see HTTP 429.
