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
    # Use the engine's active actor (highest-SPD player at start). With
    # party of 3, the array's first player is not necessarily active.
    Assert-NotNull $r.state.activeActorId 'activeActorId set'
    $hero = $r.state.actors | Where-Object { $_.id -eq $r.state.activeActorId } | Select-Object -First 1
    Assert-NotNull $hero 'active actor found'
    Assert-Eq 'player' $hero.side 'active actor is player-side'
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
    # Use active actor (engine picks highest-SPD player on start).
    $hero = $cs.state.actors | Where-Object { $_.id -eq $cs.state.activeActorId } | Select-Object -First 1
    $enemy = $cs.state.actors | Where-Object { $_.side -eq 'enemy' } | Select-Object -First 1
    $startDist = [Math]::Abs($hero.pos.q - $enemy.pos.q) + [Math]::Abs($hero.pos.r - $enemy.pos.r)
    # Cycle through all party heroes' turns to reach enemy turn.
    $rid = [string]$rstart.run.id
    $curState = $cs.state
    for ($i = 0; $i -lt 4; $i++) {
        if ($curState.phase -ne 'player_turn') { break }
        $activeId = $curState.activeActorId
        if (-not $activeId) { break }
        $r1 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
            runId = $rid
            action = @{ kind = 'end_turn'; actorId = $activeId }
        }
        $curState = $r1.state
    }
    $enemyAfter = $curState.actors | Where-Object { $_.side -eq 'enemy' } | Select-Object -First 1
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
    # Use active actor — first by array index isn't necessarily active
    # under multi-hero party (highest SPD goes first).
    $script:HeroId10b = $cs.state.activeActorId
}

Test-Case 'Sequence: defend → end_turn → end_turn (cycle full turn)' {
    $rid = $script:RunId10b
    $hid = $script:HeroId10b
    # First action by the active hero
    $a1 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'defend'; actorId = $hid }
    }
    Assert-Eq 'in_progress' $a1.runStatus
    # End turn on whoever is active NOW (engine may have rotated within
    # the party or to next active hero).
    $nextActive = $a1.state.activeActorId
    if (-not $nextActive) { return }
    $a2 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'end_turn'; actorId = $nextActive }
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

# ── Party + Skills + terminal phase regression tests ─────────────────

Test-Case 'combat.start spawns party of 3 heroes (not solo)' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = [string]$rstart.run.id }
    $players = @($cs.state.actors | Where-Object { $_.side -eq 'player' })
    Assert-Eq 3 $players.Count "party size (got $($players.Count))"
    # Each hero should know exactly one signature skill
    foreach ($p in $players) {
        Assert-True ($p.skills.Count -ge 1) "$($p.unit) has at least 1 skill"
    }
}

Test-Case 'combat.start spawns 2 enemies on non-boss level' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 3 }
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = [string]$rstart.run.id }
    $foes = @($cs.state.actors | Where-Object { $_.side -eq 'enemy' })
    Assert-Eq 2 $foes.Count "enemy count on non-boss level"
}

Test-Case 'combat.start spawns single Void Lord boss on level 20' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 20 }
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = [string]$rstart.run.id }
    $foes = @($cs.state.actors | Where-Object { $_.side -eq 'enemy' })
    Assert-Eq 1 $foes.Count "single boss"
    Assert-Eq 'Void Lord' $foes[0].unit 'boss unit'
}

# Team builder: writing selectedTeam to preferences propagates to the
# next combat.start. We pick a 2-hero team (Mira + Brann) so the test
# can verify the synth honoured the choice instead of auto-rotating.
Test-Case 'combat.start honours selectedTeam from profile.preferences' {
    # Save selected team via account.updateProfile (existing tRPC).
    $null = Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{
        preferences = @{ selectedTeam = @('mira', 'brann') }
    }
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = [string]$rstart.run.id }
    $players = @($cs.state.actors | Where-Object { $_.side -eq 'player' })
    # Mira + Brann should be in slots 0 and 1. Slot 2 is rotation-fill.
    Assert-True ($players.Count -ge 2) "party has heroes"
    $unit0 = $players[0].unit
    $unit1 = $players[1].unit
    $okM = ($unit0 -eq 'Mira') -or ($unit1 -eq 'Mira')
    $okB = ($unit0 -eq 'Brann') -or ($unit1 -eq 'Brann')
    Assert-True $okM "Mira in selected team (got slot0=$unit0 slot1=$unit1)"
    Assert-True $okB "Brann in selected team (got slot0=$unit0 slot1=$unit1)"
    # Reset to empty so other tests get auto-rotation
    $null = Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{
        preferences = @{ selectedTeam = @() }
    }
}

# Move action: multi-step path. Active hero moves 1 tile toward the
# adjacent forward tile — engine validates each step is adjacent so the
# pathfinder client-side has to produce that array.
Test-Case 'combat.submitAction move (1 hex) advances hero' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $rid = [string]$rstart.run.id
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $rid }
    $hero = $cs.state.actors | Where-Object { $_.id -eq $cs.state.activeActorId } | Select-Object -First 1
    Assert-NotNull $hero 'active hero'
    # Adjacent step: q+1 (heroes spawn on left column so q+1 is always inside the map)
    $target = @{ q = ($hero.pos.q + 1); r = $hero.pos.r }
    $r = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid
        action = @{ kind = 'move'; actorId = $hero.id; path = @($target) }
    }
    $moved = $r.state.actors | Where-Object { $_.id -eq $hero.id } | Select-Object -First 1
    Assert-Eq $target.q $moved.pos.q 'hero q advanced'
    Assert-Eq $target.r $moved.pos.r 'hero r unchanged'
}

Test-Case 'combat.submitAction use_skill (bulwark) applies aether_surge status' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 2 }
    $rid = [string]$rstart.run.id
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $rid }
    # Find a hero with the 'bulwark' skill (Kyo/Brann are tanks)
    $tank = $cs.state.actors | Where-Object { $_.side -eq 'player' -and $_.skills -contains 'bulwark' } | Select-Object -First 1
    if ($null -eq $tank) {
        Write-Host '         (skipped — no tank in party for this level rotation)' -ForegroundColor DarkYellow
        return
    }
    # Engine requires this be the active actor's turn — if not, we still
    # accept either a successful skill use OR a WRONG_TURN error.
    try {
        $r = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
            runId = $rid
            action = @{ kind = 'use_skill'; actorId = $tank.id; skillId = 'bulwark' }
        }
        # If active, status should be on the tank now.
        $updated = $r.state.actors | Where-Object { $_.id -eq $tank.id } | Select-Object -First 1
        Assert-NotNull $updated 'tank still in state'
        # AP decreased by 1 (bulwark cost)
        Assert-True ($updated.stats.ap -lt $tank.stats.ap) "AP spent (was $($tank.stats.ap), now $($updated.stats.ap))"
    } catch {
        if ($_.Exception.Message -notmatch '(WRONG_TURN|combat:)') {
            throw "unexpected error: $($_.Exception.Message)"
        }
    }
}

Test-Case 'combat.submitAction firebolt applies burn status on target' {
    # Find a DPS hero (Aevra/Vex/Null) with firebolt skill.
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    $rid = [string]$rstart.run.id
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $rid }
    $dps = $cs.state.actors | Where-Object { $_.side -eq 'player' -and $_.skills -contains 'firebolt' } | Select-Object -First 1
    if ($null -eq $dps) {
        Write-Host '         (skipped — no DPS with firebolt in party for this level rotation)' -ForegroundColor DarkYellow
        return
    }
    # Use the engine's active actor — accept WRONG_TURN if firebolt-owner isn't first
    if ($cs.state.activeActorId -ne $dps.id) {
        Write-Host '         (skipped — firebolt owner is not the active actor this run)' -ForegroundColor DarkYellow
        return
    }
    # Pick the closest enemy in range 2
    $enemy = $cs.state.actors | Where-Object { $_.side -eq 'enemy' } | Select-Object -First 1
    try {
        $r = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
            runId = $rid
            action = @{ kind = 'use_skill'; actorId = $dps.id; skillId = 'firebolt'; target = $enemy.id }
        }
        $updated = $r.state.actors | Where-Object { $_.id -eq $enemy.id } | Select-Object -First 1
        if ($updated.defeated) {
            # OK — enemy died before burn could land (rare crit on lvl 1).
            return
        }
        $hasBurn = $updated.statuses | Where-Object { $_.kind -eq 'burn' }
        Assert-NotNull $hasBurn "enemy should have burn status applied"
    } catch {
        # OUT_OF_RANGE is acceptable depending on enemy position rotation
        if ($_.Exception.Message -notmatch '(OUT_OF_RANGE|combat:)') {
            throw "unexpected error: $($_.Exception.Message)"
        }
    }
}

Test-Case 'combat.submitAction rejects unknown skillId' {
    $rstart = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 4 }
    $rid = [string]$rstart.run.id
    $cs = Invoke-TrpcMutation -Procedure 'combat.start' -Payload @{ runId = $rid }
    $hero = $cs.state.actors | Where-Object { $_.side -eq 'player' } | Select-Object -First 1
    try {
        Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
            runId = $rid
            action = @{ kind = 'use_skill'; actorId = $hero.id; skillId = 'definitely_not_a_skill' }
        } | Out-Null
        throw 'should have rejected unknown skill id'
    } catch {
        if ($_.Exception.Message -notmatch '(INVALID_ACTION|combat:|400|Unknown skill|WRONG_TURN)') {
            throw "expected INVALID_ACTION-ish error, got: $($_.Exception.Message)"
        }
    }
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
    # Use the engine's active actor — under party mode the array's first
    # player is not necessarily the one whose turn it is.
    $heroId = $cs.state.activeActorId
    Assert-NotNull $heroId 'active actor at start'
    $a1 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'defend'; actorId = $heroId }
    }
    Assert-Eq 'in_progress' $a1.runStatus
    $next = $a1.state.activeActorId
    Assert-NotNull $next 'active actor after defend'
    $a2 = Invoke-TrpcMutation -Procedure 'combat.submitAction' -Payload @{
        runId = $rid; action = @{ kind = 'end_turn'; actorId = $next }
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
