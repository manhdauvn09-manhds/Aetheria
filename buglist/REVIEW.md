# Aetheria — Step 5 Code Review

*Generated: 5 May 2026 (self-review; full multi-agent `/ultrareview` is a separate Step 5 pass). Step 6 status appended after each finding.*

The numbers below feed the **Bug counters → Review** row in `schedule/SCHEDULE.md`.

| Severity | Found | Fixed (Step 6) | Open |
| -------- | ----- | -------------- | ---- |
| critical | 3     | 3              | 0    |
| high     | 4     | 3              | 1    |
| medium   | 6     | 3              | 3    |
| low      | 4     | 2              | 2    |
| **total**| **17**| **13**         | **4** |

Step 6 pass-1 closed the 3 critical findings + 1 high + 3 medium (R1–R4, R7–R9). Step 6 pass-2 closed R5 (guild invite TOCTOU), R6 (admin replay actorUserId), R11 (shop tests), R12 (admin tests), R13 (combat-runtime tests), R14 (auth tests). Remaining 4 open: R10 (matcher tick Lua future improvement, low) + R15–R17 (domain-sync/world/save test coverage, low).

Numbering is sequential within this report.

---

## 1. Atomicity

### R1 [high] Shop refund quantity is hard-coded to 1
- **Location**: `packages/domain-shop/src/service.ts:245`
- **Issue**: `refundQty = Math.max(1, Math.floor(tx.amount / Math.max(1, tx.amount)))` always evaluates to `1`.
- **Why**: A bulk purchase (qty > 1) can never be fully refunded. Either persist the original quantity on `Transaction` (schema follow-up) or refund the entire stack by setting inventory.quantity to 0 / using the price-derived count.
- **Fixed (Step 6)**: extracted pure helper `refundQuantity(amount, unitPrice)` in `domain-economy`; `ShopService.refund` now divides `tx.amount` by `tx.shopItem.price`. 3 unit tests added.

### R2 [medium] Quest `progress()` not wrapped in `$transaction`
- **Location**: `packages/domain-quests/src/service.ts:218–230`
- **Issue**: Multiple `userQuest.upsert` calls happen in a loop without a single transactional boundary.
- **Why**: A duplicate event delivery (bus retry, double-emit) can interleave updates and produce an inconsistent counter. Wrap the loop body in `$transaction` to make a single event atomic.
- **Fixed (Step 6)**: wrapped the per-event upsert loop in `this.deps.mysql.$transaction(...)`.

### R3 [critical] PvP MMR update runs **after** the match-completion transaction commits
- **Location**: `packages/domain-pvp/src/match.ts:199–206`
- **Issue**: `complete()` updates `pvpMatch.status` + per-player `result` inside a transaction, then calls `mmrService.applyMatchResult(...)` outside it.
- **Why**: A crash between commit and MMR write leaves `pvpMatchPlayer.mmrAfter == mmrBefore` with a `completed`/`won`/`lost` row. The match contract states `mmrAfter` reflects Glicko-2; this gap breaks it.
- **Fixed (Step 6)**: `MmrService.applyMatchResult(params, client?)` now accepts an optional Prisma transaction client; `match.complete` opens one transaction that runs the status flip + per-player result update + MMR write in one atomic step.

### R4 [medium] Guild promote: only the leader-transfer path is transactional
- **Location**: `packages/domain-social/src/guild/service.ts:346–365`
- **Issue**: Officer/member promote uses a single `update` outside a transaction; only leader-transfer wraps three writes in `$transaction`.
- **Why**: Concurrent kick + promote can reorder, leaving a stale role row. Cheap fix: wrap every mutation in `$transaction` to keep the contract uniform.
- **Fixed (Step 6)**: officer/member promote path now also opens a `$transaction` (single-write) for symmetry with the leader-transfer path.

### R5 [low] Guild invite has TOCTOU window
- **Location**: `packages/domain-social/src/guild/service.ts:219–249`
- **Issue**: `findFirst` for existing pending invite, then `create` — not atomic.
- **Why**: Two concurrent invites both pass the check; the unique index will reject one but the loser's audit row already wrote a misleading payload. Use a unique constraint + `try/catch P2002`.
- **Fixed (Step 6 pass-2)**: `guildInvite.create` now wrapped in `try/catch`; P2002 (unique constraint violation) is caught and re-thrown as `AppError.conflict`. The `findFirst` fast-path check is retained to avoid the DB error in the common case.

---

## 2. Auth boundary

### R6 [medium] `admin.replay` accepts arbitrary `actorUserId` from input
- **Location**: `packages/domain-admin/src/router.ts:101–120`
- **Issue**: The query forwards `input.actorUserId` to the service unchanged.
- **Why**: This is admin-only and gated by `adminProcedure`, but the field is still client-supplied. If the auth boundary regresses (e.g., a future role escalation), the audit log becomes a leak vector. Tighten by allowing only the calling admin's id, or restrict to specific role tags.
- **Fixed (Step 6 pass-2)**: removed `actorUserId` from the `replay` input schema. Clients can still filter by `action`, `targetType`, `limit`, and `before`; filtering by actor identity is no longer exposed.

---

## 3. Audit trail

No mutations were found that skip `audit.write`. Counter stays 0 here.

---

## 4. Concurrency

### R7 [critical] PvP queue double-queue race
- **Location**: `packages/domain-pvp/src/service.ts:92–108`
- **Issue**: `findUserQueue` then `redis.zadd` — no atomic check-then-add.
- **Why**: Two concurrent `queue` calls can both pass the check and both ZADD into different scopes. Remediation: use a Lua script that does `EXISTS` across all scope keys then `ZADD` in one round-trip, or a per-user Redis lock.
- **Fixed (Step 6)**: introduced per-user marker `aetheria:pvp:user:<userId>` written via `SET key val EX 1800 NX`. Atomic NX claim guarantees only one concurrent `queue()` wins; `cancelQueue` and the matcher tick both `DEL` the marker so a re-queue is allowed afterwards. `noopRedis` stub extended with `set`/`del` to keep dev-mode boots green.

### R8 [medium] Realtime deadline timer races with `pvp:action`
- **Location**: `apps/realtime/src/pvpMatches.ts:45–77`
- **Issue**: Deadline `setTimeout` reads the latest state map entry without a per-match mutex; an in-flight `pvp:action` can update state mid-fire.
- **Why**: The timer can mark the match `ended` while a legitimate move is being applied, dropping the action. Cheap fix: when the timer fires, re-check `state.turnDeadline > Date.now()` and bail if the deadline was extended.
- **Fixed (Step 6)**: timer now re-checks `cur.turnDeadline > Date.now()` and re-arms when an action extended the deadline before the fire instant.

### R9 [medium] Match-state map never garbage-collected
- **Location**: `apps/realtime/src/pvpMatches.ts:42–77`
- **Issue**: After `pvp:end`, `states.set(matchId, { ...ended })` writes the map entry but nothing ever removes it.
- **Why**: Long-lived realtime instance accumulates `MatchState` objects indefinitely. Add a `states.delete(matchId)` after the end handler, paired with `deadlineTimers.delete(matchId)`.
- **Fixed (Step 6)**: both end paths (timeout firing + action-driven end) now call `states.delete(matchId)` + `deadlineTimers.delete(matchId)`.

### R10 [low] Matcher tick read-then-remove gap
- **Location**: `packages/domain-pvp/src/service.ts:174–194`
- **Issue**: `tick()` reads via `ZRANGE`, proposes pairs, then `ZREM`s them — non-atomic. A concurrent `cancelQueue` between the two will succeed with count 0.
- **Why**: Not functionally broken (audit shows the cancel; the second `ZREM` is a no-op) but the audit timeline can confuse operators. Future improvement: use a Lua script that `ZRANGE`+`ZREM` in one round-trip.

---

## 5. Test coverage

The following packages ship without a `__tests__/` directory. (Service code that's only DB-bound is excluded from this list.)

### R11 [high] `domain-shop` — no tests
- Refund logic (R1), discount math, stock management would all be caught.
- **Fixed (Step 6 pass-2)**: 17 unit tests added in `src/__tests__/service.test.ts` covering catalog, history, purchase (8 cases), and refund (5 cases).

### R12 [high] `domain-admin` — no tests
- No coverage of role-gated permission matrix (ban / unban / grant / featureFlag).
- **Fixed (Step 6 pass-2)**: 17 unit tests added in `src/__tests__/service.test.ts` covering banUser, unbanUser, grantItem, setFeatureFlag, and replay.

### R13 [medium] `domain-combat-runtime` — no tests
- Per `CHANGELOG.md`, combat-domain validation in realtime PvP is deferred; runtime helpers should still have unit coverage for action evaluation.
- **Fixed (Step 6 pass-2)**: 9 unit tests added in `src/__tests__/service.test.ts` covering start, submitAction, and replay (including tamper detection).

### R14 [medium] `domain-auth` — no tests
- Token issuance, refresh, OAuth verification — all critical, all untested at the package level.
- **Fixed (Step 6 pass-2)**: 16 unit tests added in `src/__tests__/tokens.test.ts` covering signAccessToken, signRefreshToken, issueTokenPair, verifyRefreshToken (happy path + error cases), and defaultTokenTtl constants.

### R15 [low] `domain-sync` — no tests.
### R16 [low] `domain-world` — no tests.
### R17 [low] `domain-save` — no tests.

---

## Recommended fix order (Step 6 input)

1. **R3** — wrap MMR update inside the match-completion transaction (critical correctness).
2. **R7** — Lua-script the queue check-then-add (critical concurrency).
3. **R1** — fix the refund quantity (correctness; trivial).
4. **R2** — wrap quest progress loop in `$transaction`.
5. **R8 + R9** — deadline-timer mutex + state-map GC.
6. **R4** — uniform `$transaction` for all guild role mutations.
7. **R11–R14** — add unit tests covering the shop, admin, combat-runtime, and auth surfaces (Step 6 work, not Step 5 fixes).

Step 6 should re-run the gates after each fix; quality gate (Step 7) blocks until **Review = 0**.
