# Aetheria — Step 5 Code Review

*Generated: 5 May 2026 (self-review; full multi-agent `/ultrareview` is a separate Step 5 pass).*

The numbers below feed the **Bug counters → Review** row in `schedule/SCHEDULE.md`.

| Severity | Count |
| -------- | ----- |
| critical | 3     |
| high     | 4     |
| medium   | 6     |
| low      | 4     |
| **total**| **17**|

Numbering is sequential within this report.

---

## 1. Atomicity

### R1 [high] Shop refund quantity is hard-coded to 1
- **Location**: `packages/domain-shop/src/service.ts:245`
- **Issue**: `refundQty = Math.max(1, Math.floor(tx.amount / Math.max(1, tx.amount)))` always evaluates to `1`.
- **Why**: A bulk purchase (qty > 1) can never be fully refunded. Either persist the original quantity on `Transaction` (schema follow-up) or refund the entire stack by setting inventory.quantity to 0 / using the price-derived count.

### R2 [medium] Quest `progress()` not wrapped in `$transaction`
- **Location**: `packages/domain-quests/src/service.ts:218–230`
- **Issue**: Multiple `userQuest.upsert` calls happen in a loop without a single transactional boundary.
- **Why**: A duplicate event delivery (bus retry, double-emit) can interleave updates and produce an inconsistent counter. Wrap the loop body in `$transaction` to make a single event atomic.

### R3 [critical] PvP MMR update runs **after** the match-completion transaction commits
- **Location**: `packages/domain-pvp/src/match.ts:199–206`
- **Issue**: `complete()` updates `pvpMatch.status` + per-player `result` inside a transaction, then calls `mmrService.applyMatchResult(...)` outside it.
- **Why**: A crash between commit and MMR write leaves `pvpMatchPlayer.mmrAfter == mmrBefore` with a `completed`/`won`/`lost` row. The match contract states `mmrAfter` reflects Glicko-2; this gap breaks it.

### R4 [medium] Guild promote: only the leader-transfer path is transactional
- **Location**: `packages/domain-social/src/guild/service.ts:346–365`
- **Issue**: Officer/member promote uses a single `update` outside a transaction; only leader-transfer wraps three writes in `$transaction`.
- **Why**: Concurrent kick + promote can reorder, leaving a stale role row. Cheap fix: wrap every mutation in `$transaction` to keep the contract uniform.

### R5 [low] Guild invite has TOCTOU window
- **Location**: `packages/domain-social/src/guild/service.ts:219–249`
- **Issue**: `findFirst` for existing pending invite, then `create` — not atomic.
- **Why**: Two concurrent invites both pass the check; the unique index will reject one but the loser's audit row already wrote a misleading payload. Use a unique constraint + `try/catch P2002`.

---

## 2. Auth boundary

### R6 [medium] `admin.replay` accepts arbitrary `actorUserId` from input
- **Location**: `packages/domain-admin/src/router.ts:101–120`
- **Issue**: The query forwards `input.actorUserId` to the service unchanged.
- **Why**: This is admin-only and gated by `adminProcedure`, but the field is still client-supplied. If the auth boundary regresses (e.g., a future role escalation), the audit log becomes a leak vector. Tighten by allowing only the calling admin's id, or restrict to specific role tags.

---

## 3. Audit trail

No mutations were found that skip `audit.write`. Counter stays 0 here.

---

## 4. Concurrency

### R7 [critical] PvP queue double-queue race
- **Location**: `packages/domain-pvp/src/service.ts:92–108`
- **Issue**: `findUserQueue` then `redis.zadd` — no atomic check-then-add.
- **Why**: Two concurrent `queue` calls can both pass the check and both ZADD into different scopes. Remediation: use a Lua script that does `EXISTS` across all scope keys then `ZADD` in one round-trip, or a per-user Redis lock.

### R8 [medium] Realtime deadline timer races with `pvp:action`
- **Location**: `apps/realtime/src/pvpMatches.ts:45–77`
- **Issue**: Deadline `setTimeout` reads the latest state map entry without a per-match mutex; an in-flight `pvp:action` can update state mid-fire.
- **Why**: The timer can mark the match `ended` while a legitimate move is being applied, dropping the action. Cheap fix: when the timer fires, re-check `state.turnDeadline > Date.now()` and bail if the deadline was extended.

### R9 [medium] Match-state map never garbage-collected
- **Location**: `apps/realtime/src/pvpMatches.ts:42–77`
- **Issue**: After `pvp:end`, `states.set(matchId, { ...ended })` writes the map entry but nothing ever removes it.
- **Why**: Long-lived realtime instance accumulates `MatchState` objects indefinitely. Add a `states.delete(matchId)` after the end handler, paired with `deadlineTimers.delete(matchId)`.

### R10 [low] Matcher tick read-then-remove gap
- **Location**: `packages/domain-pvp/src/service.ts:174–194`
- **Issue**: `tick()` reads via `ZRANGE`, proposes pairs, then `ZREM`s them — non-atomic. A concurrent `cancelQueue` between the two will succeed with count 0.
- **Why**: Not functionally broken (audit shows the cancel; the second `ZREM` is a no-op) but the audit timeline can confuse operators. Future improvement: use a Lua script that `ZRANGE`+`ZREM` in one round-trip.

---

## 5. Test coverage

The following packages ship without a `__tests__/` directory. (Service code that's only DB-bound is excluded from this list.)

### R11 [high] `domain-shop` — no tests
- Refund logic (R1), discount math, stock management would all be caught.

### R12 [high] `domain-admin` — no tests
- No coverage of role-gated permission matrix (ban / unban / grant / featureFlag).

### R13 [medium] `domain-combat-runtime` — no tests
- Per `CHANGELOG.md`, combat-domain validation in realtime PvP is deferred; runtime helpers should still have unit coverage for action evaluation.

### R14 [medium] `domain-auth` — no tests
- Token issuance, refresh, OAuth verification — all critical, all untested at the package level.

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
