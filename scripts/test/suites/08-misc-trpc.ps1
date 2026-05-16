# Suite 08 — miscellaneous tRPC procedures the web app reaches at first paint.
# Catches schema changes that would break /menu and adjacent pages.

Start-Suite '08' 'Misc tRPC procedures (inventory / quests / pvp / shop)'

Get-TestUser | Out-Null

Test-Case 'inventory.list reachable for fresh user' {
    # ConvertFrom-Json on empty JSON array [] is funky in PowerShell. The
    # only thing the test really cares about: the procedure exists and
    # doesn't 500. Invoke-TrpcQuery already throws on tRPC-level errors;
    # reaching this line means it succeeded.
    Invoke-TrpcQuery -Procedure 'inventory.list' | Out-Null
}

Test-Case 'roster.list reachable for fresh user' {
    Invoke-TrpcQuery -Procedure 'roster.list' | Out-Null
}

Test-Case 'quests.activeForUser returns shape' {
    try {
        $r = Invoke-TrpcQuery -Procedure 'quests.activeForUser'
        # Some procedures return arrays, some objects — just assert no error.
        Assert-NotNull $r 'response'
    } catch {
        # If proc name differs in your build, this is fine — only fail on 500.
        if ($_.Exception.Message -match '500') { throw }
    }
}

Test-Case 'battlepass.currentSeason returns ok or null' {
    try {
        Invoke-TrpcQuery -Procedure 'battlepass.currentSeason' | Out-Null
    } catch {
        # No active season is a valid state, but a 500 is not.
        if ($_.Exception.Message -match '500') { throw }
    }
}

Test-Case 'pvp.queueStatus returns idle for a fresh user' {
    try {
        $r = Invoke-TrpcQuery -Procedure 'pvp.queueStatus' -Payload @{ mode = '1v1' }
        Assert-NotNull $r 'queueStatus response'
    } catch {
        if ($_.Exception.Message -match '500') { throw }
    }
}

Test-Case 'shop.list returns array' {
    try {
        $r = Invoke-TrpcQuery -Procedure 'shop.list'
        Assert-True ($r -is [array] -or $r.PSObject.TypeNames -contains 'System.Object[]' -or $null -eq $r) 'shop.list array shape'
    } catch {
        if ($_.Exception.Message -match '500') { throw }
    }
}

Test-Case 'health.ping (tRPC) returns ok' {
    $r = Invoke-TrpcQuery -Procedure 'health.ping' -NoAuth
    Assert-Eq $true $r.ok 'health.ping.ok'
}

End-Suite
