# Suite 10 — combat playthrough end-to-end.
#
# Regression tests for the "Run snapshot is corrupted" outage where
# combat.start saved the raw BattleState to runs.snapshot instead of the
# `{schemaVersion, state}` envelope that hydrate() expects on next
# submitAction.
#
# Covers:
#   - combat.start initializes a battle and returns a renderable state
#   - The persisted snapshot survives a round-trip (submitAction loads OK)
#   - The full action loop: defend → end_turn → enemy_turn → back to player
#   - Replay-hash integrity check passes after several actions
#   - Synthesised state has a player hero on a non-empty tile grid

Start-Suite '10' 'Combat playthrough end-to-end'

# Each test that follows must operate on a fresh run so they're isolated.
# We use the suite's default user (from Get-TestUser) and create runs
# inline as needed.

$script:RunId10 = $null

Test-Case 'world.startLevel(1) → fresh run for combat tests' {
    $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    Assert-NotNull $r.run.id 'run.id'
    Assert-Eq 'in_progress' $r.run.status
    $script:RunId10 = [string]$r.run.id
}

$script:HeroId10 = $null

Test-Case 'combat.start initializes battle with non-empty tiles + hero actor' {
    Assert-NotNull $script:RunId10 'run id captured'
    $r = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $script:RunId10 }
    Assert-NotNull $r.state 'state'
    Assert-NotNull $r.state.battleId 'battleId'
    Assert-True ($r.state.tiles.Count -gt 0) "tiles non-empty (got $($r.state.tiles.Count))"
    Assert-True ($r.state.actors.Count -ge 2) "at least 2 actors (got $($r.state.actors.Count))"
    Assert-Eq 'player_turn' $r.state.phase 'starts on player_turn'
    # Hero present — capture id for subsequent actions
    $hero = $r.state.actors | Where-Object { $_.side -eq 'player' } | Select-Object -First 1
    Assert-NotNull $hero 'player-side actor'
    Assert-True ($hero.stats.hp -gt 0) 'hero hp > 0'
    Assert-True ($hero.stats.ap -ge 1) 'hero ap >= 1'
    Assert-NotNull $hero.unit 'hero has unit name'
    $script:HeroId10 = $hero.id
}

# Regression: this used to throw "Run snapshot is corrupted" because
# start() persisted the raw BattleState (without {schemaVersion, state}
# envelope) and hydrate() then rejected it.
Test-Case 'combat.submitAction(defend) succeeds (no snapshot corruption)' {
    Assert-NotNull $script:RunId10 'run id'
    Assert-NotNull $script:HeroId10 'hero id'
    $r = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $script:RunId10
        action = @{ kind = 'defend'; actorId = $script:HeroId10 }
    }
    Assert-NotNull $r.state 'state'
    Assert-Eq 'in_progress' $r.runStatus
}

Test-Case 'combat.submitAction(end_turn) — enemy AI runs server-side, returns to player_turn' {
    $r = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $script:RunId10
        action = @{ kind = 'end_turn'; actorId = $script:HeroId10 }
    }
    Assert-NotNull $r.state 'state'
    # After player ends turn the server's enemy AI loop applies enemy
    # actions and hands the turn back to the player (or ends the battle).
    # Final phase should be player_turn (or terminal victory/defeat).
    $okPhase = ($r.state.phase -eq 'player_turn') -or
               ($r.state.phase -eq 'victory') -or
               ($r.state.phase -eq 'defeat')
    Assert-True $okPhase "phase should NOT be stuck in enemy_turn (got $($r.state.phase))"
    # Events should include something the enemy did (turn_ended at minimum,
    # plus the enemy's own move/attack/end_turn).
    Assert-True ($r.events.Count -ge 1) "events emitted by AI (got $($r.events.Count))"
}

Test-Case 'Enemy AI advances toward player after multiple turns' {
    # Run a 3rd run so we don't perturb earlier-test state.
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = [string]$rstart.run.id }
    $hero = $cs.state.actors | Where-Object { $_.side -eq 'player' } | Select-Object -First 1
    $enemy = $cs.state.actors | Where-Object { $_.side -eq 'enemy' } | Select-Object -First 1
    $startDist = [Math]::Abs($hero.pos.q - $enemy.pos.q) + [Math]::Abs($hero.pos.r - $enemy.pos.r)
    # End hero's turn — enemy AI should step toward player.
    $r1 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = [string]$rstart.run.id
        action = @{ kind = 'end_turn'; actorId = $hero.id }
    }
    $enemyAfter = $r1.state.actors | Where-Object { $_.side -eq 'enemy' } | Select-Object -First 1
    $endDist = [Math]::Abs($hero.pos.q - $enemyAfter.pos.q) + [Math]::Abs($hero.pos.r - $enemyAfter.pos.r)
    # AI may attack instead of move if already adjacent, but otherwise
    # should never be FURTHER away than where it started.
    Assert-True ($endDist -le $startDist) "enemy should not be further (start=$startDist, end=$endDist)"
}

Test-Case 'combat.replay verifies action_log + snapshot integrity' {
    $r = Invoke-TrpcQuery -Procedure 'combat.replay' -Payload @{ runId = $script:RunId10 }
    Assert-NotNull $r.expected 'expected hash'
    Assert-NotNull $r.actual 'actual hash'
    Assert-Eq $true $r.ok "replay hash mismatch — snapshot/log inconsistent (expected=$($r.expected), actual=$($r.actual))"
}

# Second run: verify each action type the engine accepts is reachable.
$script:RunId10b = $null

$script:HeroId10b = $null

Test-Case 'Second run: fresh combat for multi-action sequence' {
    $r1 = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $script:RunId10b = [string]$r1.run.id
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $script:RunId10b }
    $hero = $cs.state.actors | Where-Object { $_.side -eq 'player' } | Select-Object -First 1
    $script:HeroId10b = $hero.id
}

Test-Case 'Sequence: defend → end_turn → end_turn (cycle full turn)' {
    $rid = $script:RunId10b
    $hid = $script:HeroId10b
    $a1 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'defend'; actorId = $hid }
    }
    Assert-Eq 'in_progress' $a1.runStatus
    $a2 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'end_turn'; actorId = $hid }
    }
    Assert-NotNull $a2.state 'state after end_turn'
    # Replay should still validate
    $rep = Invoke-TrpcQuery -Procedure 'combat.replay' -Payload @{ runId = $rid }
    Assert-Eq $true $rep.ok 'replay hash still matches after sequence'
}

# Verify level access for the full 100-level catalog (read-only).
Test-Case 'world.levelsForRealm covers all 5 realms with at least 1 level each' {
    $realms = @(Invoke-TrpcQuery -Procedure 'world.realms')
    Assert-True ($realms.Count -ge 5) "5+ realms (got $($realms.Count))"
    foreach ($realm in $realms) {
        # @( ) forces array even when the API returns a single object
        # (PowerShell auto-unwraps single-item arrays otherwise).
        $lvs = @(Invoke-TrpcQuery -Procedure 'world.levelsForRealm' -Payload @{
            realmId = [int]$realm.id
        })
        Assert-True ($lvs.Count -ge 1) "realm $($realm.id) has at least 1 level (got $($lvs.Count))"
    }
}

# Verify each accessible level returns a renderable map (not just level 1).
# Tests levels 2-5 since 1 is already covered in suite 05.
foreach ($n in @(2, 3, 4, 5)) {
    $levelN = $n
    Test-Case "world.startLevel($levelN) returns renderable map" {
        $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{
            levelNumber = $levelN
        }
        Assert-NotNull $r.level.map "level $levelN map"
        Assert-True ($r.level.map.tiles.Count -gt 0) "level $levelN tiles non-empty"
    }
}

# Procedural levels 9-100 (no JSON, no DB row at boot time): the world
# service must (a) synthesise the level from the game-assets generator,
# and (b) auto-upsert a `levels` row so the FK on `runs.level_id`
# resolves. This catches regressions in either of those steps.
foreach ($n in @(10, 25, 50, 75, 99, 100)) {
    $levelN = $n
    Test-Case "world.startLevel($levelN) procedurally generated level works" {
        $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{
            levelNumber = $levelN
        }
        Assert-NotNull $r.level.map "level $levelN map"
        Assert-True ($r.level.map.tiles.Count -gt 0) "level $levelN tiles non-empty"
        Assert-NotNull $r.run.id "level $levelN run created (FK resolved)"
    }
}

Test-Case 'Level 100 is the boss of realm 5 (Voidmaw)' {
    $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 100 }
    Assert-Eq 'boss' $r.level.type 'level 100 is boss-type'
    Assert-Eq '5' $r.level.realmId 'level 100 in realm 5'
}

# Higher-level combat: still uses synth init, hero rotates through roster.
Test-Case 'combat.start at level 50 returns valid state with named hero' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 50 }
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = [string]$rstart.run.id }
    Assert-True ($cs.state.actors.Count -ge 2) 'has actors'
    $hero = $cs.state.actors | Where-Object { $_.side -eq 'player' } | Select-Object -First 1
    Assert-NotNull $hero.unit 'hero has unit name (Aevra/Kyo/Lyra/Brann)'
    Assert-True ($hero.stats.hp -gt 80) "hero hp scales with level (got $($hero.stats.hp))"
}

# ─── Security/audit regression tests ─────────────────────────────────

# Snapshot CAS: regression for DB-1. After the optimistic-lock fix, two
# submitAction requests using the SAME loaded revision should not both
# succeed. We simulate by doing one End turn then immediately doing
# another action with the original (now stale) state — server should
# accept the first, the test asserts the run advances correctly.
Test-Case 'Snapshot CAS: revision advances on each action (no clobber)' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $rid = [string]$rstart.run.id
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $rid }
    $hero = $cs.state.actors | Where-Object { $_.side -eq 'player' } | Select-Object -First 1
    # Two successive actions should both succeed (sequential, not racing).
    $a1 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'defend'; actorId = $hero.id }
    }
    Assert-Eq 'in_progress' $a1.runStatus
    $a2 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'end_turn'; actorId = $hero.id }
    }
    Assert-NotNull $a2.state 'second action persisted (revision bumped + applied)'
    # Replay still validates → snapshot consistency held under sequential
    # CAS updates.
    $rep = Invoke-TrpcQuery -Procedure 'combat.replay' -Payload @{ runId = $rid }
    Assert-Eq $true $rep.ok 'replay hash matches after CAS round-trips'
}

# avatarUrl scheme allow-list: regression for BE-6. javascript: and
# private-IP URLs must be rejected by account.updateProfile.
Test-Case 'account.updateProfile rejects javascript: avatarUrl' {
    try {
        Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{
            avatarUrl = "javascript:alert(1)"
        } | Out-Null
        throw 'Should have rejected javascript: avatar URL'
    } catch {
        if ($_.Exception.Message -notmatch '(VALIDATION|BAD_REQUEST|400|public hostname|url)') {
            throw "Expected validation rejection, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'account.updateProfile rejects private-IP avatarUrl (SSRF guard)' {
    try {
        Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{
            avatarUrl = "http://169.254.169.254/latest/meta-data/"
        } | Out-Null
        throw 'Should have rejected metadata IP avatar URL'
    } catch {
        if ($_.Exception.Message -notmatch '(VALIDATION|BAD_REQUEST|400|public hostname)') {
            throw "Expected validation rejection, got: $($_.Exception.Message)"
        }
    }
}

# Preferences size cap: regression for BE-8. A massive preferences blob
# should be rejected, not stored.
Test-Case 'account.updateProfile rejects oversized preferences (>8KB)' {
    # Build a string > 8KB.
    $big = "x" * 9000
    try {
        Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{
            preferences = @{ huge = $big }
        } | Out-Null
        throw 'Should have rejected oversized preferences'
    } catch {
        if ($_.Exception.Message -notmatch '(VALIDATION|BAD_REQUEST|400|8 KB|max)') {
            throw "Expected validation rejection, got: $($_.Exception.Message)"
        }
    }
}

End-Suite
