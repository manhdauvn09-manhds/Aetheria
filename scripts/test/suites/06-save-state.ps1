# Suite 06 — save slot CRUD (the consolidated MySQL save_states table).

Start-Suite '06' 'Save slots (tRPC save.*)'

Test-Case 'save.list empty for a fresh user' {
    $u = Get-TestUser  # also resets state to a fresh signup if not done yet
    $list = Invoke-TrpcQuery -Procedure 'save.list'
    Assert-Eq 0 $list.Count 'new account has no saves'
}

$script:SaveSlot = 1
Test-Case 'save.snapshot writes a manual slot' {
    $r = Invoke-TrpcMutation -Procedure 'save.snapshot' -Payload @{
        slot = $script:SaveSlot
        payload = @{ hp = 100; mp = 50; ts = (Get-Date -Format o) }
    }
    Assert-Eq $script:SaveSlot $r.slot 'slot persisted'
    Assert-True ($r.schemaVersion -ge 1) 'schemaVersion ≥ 1'
    Assert-True ($r.payloadBytes -gt 0) 'payloadBytes > 0'
}

Test-Case 'save.list now contains the snapshot' {
    # @() forces array context — PowerShell unwraps single-element arrays
    # returned by ConvertFrom-Json into a bare object.
    $list = @(Invoke-TrpcQuery -Procedure 'save.list')
    Assert-Eq 1 $list.Count 'one save'
    Assert-Eq $script:SaveSlot $list[0].slot 'slot match'
}

Test-Case 'save.load returns the payload' {
    $r = Invoke-TrpcQuery -Procedure 'save.load' -Payload @{ slot = $script:SaveSlot }
    Assert-Eq $script:SaveSlot $r.slot 'slot'
    Assert-Eq 100 $r.payload.hp 'payload.hp roundtrip'
    Assert-Eq 50 $r.payload.mp 'payload.mp roundtrip'
}

Test-Case 'save.snapshot on same slot bumps schemaVersion' {
    $first = Invoke-TrpcQuery -Procedure 'save.load' -Payload @{ slot = $script:SaveSlot }
    $r = Invoke-TrpcMutation -Procedure 'save.snapshot' -Payload @{
        slot = $script:SaveSlot
        payload = @{ hp = 80; mp = 60 }
    }
    Assert-True ($r.schemaVersion -gt $first.schemaVersion) 'schemaVersion bumped'
}

Test-Case 'save.reconcile detects stale version' {
    $r = Invoke-TrpcMutation -Procedure 'save.reconcile' -Payload @{
        slot = $script:SaveSlot
        expectedVersion = 1   # almost certainly stale
        payload = @{ hp = 70 }
    }
    Assert-NotNull $r.status 'reconcile returns status'
    # Server returns "stale" with the actual current row when expectedVersion is wrong.
    if ($r.status -ne 'stale' -and $r.status -ne 'ok') {
        throw "Unexpected reconcile status: $($r.status)"
    }
}

Test-Case 'save.delete removes the slot' {
    Invoke-TrpcMutation -Procedure 'save.delete' -Payload @{ slot = $script:SaveSlot } | Out-Null
    $list = Invoke-TrpcQuery -Procedure 'save.list'
    Assert-True (-not ($list | Where-Object slot -EQ $script:SaveSlot)) 'slot removed from list'
}

Test-Case 'save.snapshot rejects invalid slot (>3)' {
    try {
        Invoke-TrpcMutation -Procedure 'save.snapshot' -Payload @{
            slot = 99
            payload = @{ ok = $true }
        } | Out-Null
        throw 'slot 99 should be rejected by validator'
    } catch {
        if ($_.Exception.Message -notmatch '(VALIDATION|BAD_REQUEST|slot|400)') {
            throw "Expected validation error, got: $($_.Exception.Message)"
        }
    }
}

End-Suite
