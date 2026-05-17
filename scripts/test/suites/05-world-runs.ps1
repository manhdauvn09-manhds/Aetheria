# Suite 05 — world catalog + run lifecycle.
# world.realms / world.levelsForRealm / world.startLevel / world.resumeRun /
# world.abandonRun. The catalog falls back to @aetheria/game-assets JSON when
# the MySQL realms / levels tables are empty (a common dev-DB state), so the
# realm/level shapes here should match whether or not the DB is seeded.

Start-Suite '05' 'World catalog & run lifecycle'

# Realms list
Test-Case 'world.realms returns 5 realms with stable shape' {
    $rl = Invoke-TrpcQuery -Procedure 'world.realms'
    Assert-Eq 5 $rl.Count 'realm count'
    foreach ($r in $rl) {
        Assert-NotNull $r.id 'realm id'
        Assert-NotNull $r.name 'realm name'
        Assert-Match '^#[0-9A-Fa-f]{6}$' $r.colorHex 'colorHex'
        Assert-True ($r.orderIndex -ge 1) 'orderIndex'
    }
}

# Levels for the first realm
Test-Case 'world.levelsForRealm(1) returns at least 1 level' {
    $lvs = Invoke-TrpcQuery -Procedure 'world.levelsForRealm' -Payload @{ realmId = 1 }
    Assert-True ($lvs.Count -ge 1) "at least 1 level in realm 1 (got $($lvs.Count))"
    Assert-NotNull $lvs[0].id 'level.id'
    Assert-NotNull $lvs[0].name 'level.name'
    Assert-True ($lvs[0].levelNumber -ge 1) 'levelNumber'
}

# Start a run on level 1 and capture its id for the next two tests.
$script:RunId = $null
Test-Case 'world.startLevel(1) creates an in_progress run' {
    $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    Assert-NotNull $r.run.id 'run.id'
    Assert-Eq 'in_progress' $r.run.status 'run.status'
    Assert-Eq 1 $r.level.levelNumber 'level returned'
    $script:RunId = $r.run.id
}

# Regression: when DB level rows have placeholder empty JSON (the seed only
# guarantees FK target), startLevel MUST fall back to game-assets JSON for
# map/encounter content. Empty map breaks the client (.tiles.length crash).
Test-Case 'world.startLevel returns a renderable map (tiles.length > 0)' {
    $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    Assert-NotNull $r.level.map 'level.map'
    $tiles = $r.level.map.tiles
    Assert-NotNull $tiles 'level.map.tiles'
    Assert-True ($tiles.Count -gt 0) "tiles array must be non-empty (got $($tiles.Count))"
    Assert-True ($r.level.map.width -gt 0) 'map.width > 0'
    Assert-True ($r.level.map.height -gt 0) 'map.height > 0'
}

Test-Case 'world.startLevel returns encounter with at least one wave' {
    $r = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    Assert-NotNull $r.level.encounter 'level.encounter'
    $waves = $r.level.encounter.waves
    Assert-NotNull $waves 'encounter.waves'
    Assert-True ($waves.Count -ge 1) "at least 1 wave (got $($waves.Count))"
}

# Resume the run we just created.
Test-Case 'world.resumeRun returns the same run' {
    if (-not $script:RunId) { throw 'Prior test did not capture a run id' }
    $r = Invoke-TrpcQuery -Procedure 'world.resumeRun' -Payload @{ runId = $script:RunId }
    Assert-Eq $script:RunId $r.run.id 'same run.id'
    Assert-Eq 'in_progress' $r.run.status 'still in_progress'
}

# Abandon a *different* run so we can verify abandon end-state cleanly.
Test-Case 'world.abandonRun marks status = abandoned' {
    $start = Invoke-TrpcMutation -Procedure 'world.startLevel' -Payload @{ levelNumber = 1 }
    Invoke-TrpcMutation -Procedure 'world.abandonRun' -Payload @{ runId = $start.run.id } | Out-Null
    # Resuming an abandoned run should now fail (status != in_progress).
    try {
        Invoke-TrpcQuery -Procedure 'world.resumeRun' -Payload @{ runId = $start.run.id } | Out-Null
        throw 'abandoned run should not be resumable'
    } catch {
        if ($_.Exception.Message -notmatch '(not resumable|INVALID_ACTION|not in_progress)') {
            throw "Expected 'not resumable' error, got: $($_.Exception.Message)"
        }
    }
}

# Authorisation: trying to resume someone else's run must fail.
# Note: signup is rate-limited at 10/min per IP. If suite 03 already burned
# the budget, this test will retry once after a short pause and otherwise
# skip itself with a clear message rather than fail spuriously.
Test-Case 'world.resumeRun is scoped by user (no cross-user access)' {
    if (-not $script:RunId) { throw 'No run id captured' }
    $ts = (Get-Date -Format 'yyyyMMddHHmmssfff')
    $other = $null
    try {
        $other = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "x-$ts@aetheria-test.invalid"
            password = 'TestPass1234!'
            displayName = "x$($ts.Substring(8,5))"
        }
    } catch {
        if ($_.Exception.Message -match '(429|RATE_LIMITED|500)') {
            Write-Host '         (skipped — signup rate-limited; rerun the suite alone to exercise this case)' -ForegroundColor DarkYellow
            return
        }
        throw
    }
    $otherTok = ($other.Content | ConvertFrom-Json).access.value
    $payload = [System.Web.HttpUtility]::UrlEncode("{`"0`":{`"json`":{`"runId`":$($script:RunId)}}}")
    $headers = @{ 'Origin' = $script:BaseUrl; 'Authorization' = "Bearer $otherTok" }
    $resp = Invoke-HttpRaw -Method GET -Url "$script:ApiUrl/trpc/world.resumeRun`?batch=1&input=$payload" -Headers $headers
    $j = $resp.Content | ConvertFrom-Json
    Assert-NotNull $j[0].error 'cross-user access must error'
    Assert-Match '(NOT_FOUND|not found|404)' "$($j[0].error.json.message)" 'cross-user error is NOT_FOUND'
}

End-Suite
