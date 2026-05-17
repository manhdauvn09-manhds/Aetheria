# Suite 04 — account / profile management.
# Reads + writes against account.* tRPC procedures.

Start-Suite '04' 'Account & profile (tRPC account.*)'

Test-Case 'account.getProfile returns the authed user' {
    $u = Get-TestUser
    $p = Invoke-TrpcQuery -Procedure 'account.getProfile'
    Assert-Eq $u.UserId $p.user.id 'profile.user.id matches signup user'
    Assert-Eq $u.Email $p.user.email 'profile.user.email matches signup email'
    Assert-NotNull $p.profile.displayName 'profile.displayName'
    Assert-Eq 1 $p.profile.accountLevel 'fresh user starts at level 1'
    Assert-Eq 0 $p.profile.accountXp 'fresh user has 0 XP'
}

Test-Case 'account.getProfile without auth → 401' {
    try {
        Invoke-TrpcQuery -Procedure 'account.getProfile' -NoAuth | Out-Null
        throw 'Should have rejected unauth'
    } catch {
        if ($_.Exception.Message -notmatch '(401|UNAUTHENTICATED|unauthorized)') {
            throw "Expected 401-style error, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'account.updateProfile changes displayName' {
    $newName = "renamed-$((Get-Date -Format 'HHmmssfff').Substring(0,9))"
    $r = Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{ displayName = $newName }
    Assert-Eq $newName $r.profile.displayName 'new displayName persisted'
}

Test-Case 'account.updateProfile rejects empty patch' {
    try {
        Invoke-TrpcMutation -Procedure 'account.updateProfile' -Payload @{} | Out-Null
        throw 'Empty patch should be rejected by schema validator'
    } catch {
        # Zod validation error is fine — any error here is the desired outcome
        if ($_.Exception.Message -notmatch '(VALIDATION|BAD_REQUEST|400|At least one field)') {
            throw "Expected validation rejection, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'account.updateProfile rejects taken displayName' {
    # Pick a name we know is taken — the current user's own name was just changed,
    # so use it from the previous test result via another fresh user.
    $current = (Get-TestUser).Token
    # Sign up a second user and try to take the first user's name.
    $ts2 = (Get-Date -Format 'yyyyMMddHHmmssfff')
    $other = $null
    try {
        $other = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "dup-$ts2@aetheria-test.invalid"
            password = 'TestPass1234!'
            displayName = "other$($ts2.Substring(8,5))"
        }
    } catch {
        if ($_.Exception.Message -match '(429|RATE_LIMITED)') {
            Write-Host '         (skipped — signup rate-limited; rerun the suite alone to exercise this case)' -ForegroundColor DarkYellow
            return
        }
        throw
    }
    $otherTok = ($other.Content | ConvertFrom-Json).access.value
    $firstName = (Invoke-TrpcQuery -Procedure 'account.getProfile').profile.displayName
    try {
        $headers = @{ 'Origin' = $script:BaseUrl; 'Authorization' = "Bearer $otherTok" }
        $body = @{ "0" = @{ json = @{ displayName = $firstName } } }
        $resp = Invoke-HttpRaw -Method POST -Url "$script:ApiUrl/trpc/account.updateProfile`?batch=1" -Headers $headers -Body $body
        $j = $resp.Content | ConvertFrom-Json
        if ($j[0].error) {
            Assert-Match '(CONFLICT|already taken)' "$($j[0].error.json.message)" 'conflict message'
        } else {
            throw 'Duplicate displayName should be rejected'
        }
    } catch {
        if ($_.Exception.Message -notmatch '(CONFLICT|409|already taken)') { throw }
    }
}

End-Suite
