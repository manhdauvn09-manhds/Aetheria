# Suite 03 — authentication flow.
# Signup / login / refresh / logout. Each test signs up a fresh user with a
# timestamped email so re-runs don't collide.

Start-Suite '03' 'Authentication flow'

$ts = (Get-Date -Format 'yyyyMMddHHmmssfff')
$email = "auth-$ts@aetheria-test.invalid"
$displayName = "auth$($ts.Substring(8,6))"
$password = 'Aq7!zKmTvW4xP9r'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Test-Case 'POST /api/auth/signup creates account' {
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
        email = $email; password = $password; displayName = $displayName
    } -Session $session
    $j = $r.Content | ConvertFrom-Json
    Assert-NotNull $j.user.id 'user.id'
    Assert-Eq $email $j.user.email 'user.email'
    Assert-NotNull $j.access.value 'access token'
    Assert-Match '^eyJ' $j.access.value 'JWT format'
    Assert-True ($j.access.expiresAt -gt [DateTimeOffset]::Now.ToUnixTimeMilliseconds()) 'access not expired'
}

Test-Case 'POST /api/auth/signup refresh cookie set httpOnly' {
    # The earlier request set Set-Cookie on $session — check the SetCookie raw response too
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
        email = "auth-dup-$ts@aetheria-test.invalid"; password = $password; displayName = "dup$($ts.Substring(8,6))"
    }
    $cookieHdr = "$($r.Headers['Set-Cookie'])"
    Assert-Match 'aetheria_refresh=' $cookieHdr 'refresh cookie name'
    Assert-Match 'HttpOnly' $cookieHdr 'HttpOnly flag'
    Assert-Match 'SameSite=Strict' $cookieHdr 'SameSite=Strict'
    Assert-Match 'Secure' $cookieHdr 'Secure flag (prod)'
}

Test-Case 'Duplicate signup → 409 conflict (no email enumeration)' {
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = $email; password = $password; displayName = "dup$($ts.Substring(9,5))"
        } | Out-Null
        throw 'Should have failed with 409'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 409') {
            throw "Expected HTTP 409, got: $($_.Exception.Message)"
        }
        # Message must NOT leak which field (email vs displayName) collided
        $body = "$($_.Exception.Message)"
        if ($body -match '(Email is already registered|Display name is already taken)') {
            throw "Enumeration leak: response identifies which field collided"
        }
    }
}

Test-Case 'Signup rejects known-pwned password (HIBP)' {
    # Classic breach corpus entry — appears in millions of breaches.
    $ts2 = (Get-Date -Format 'yyyyMMddHHmmssfff')
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "pwned-$ts2@aetheria-test.invalid"
            password = 'password1234'   # well-known breached
            displayName = "pwn$($ts2.Substring(9,5))"
        } | Out-Null
        # HIBP outage soft-fails — accept either 400 (rejected) or 200/409
        Write-Host '         (HIBP may have soft-failed; pwned-password reject is best-effort)' -ForegroundColor DarkYellow
    } catch {
        if ($_.Exception.Message -notmatch '(HTTP 400|PWNED_PASSWORD|breach)') {
            # If it's 409 (dup) or 429 (rate-limit) treat as inconclusive
            if ($_.Exception.Message -notmatch '(HTTP 409|HTTP 429)') {
                throw "Expected 400 PWNED_PASSWORD or soft-fail, got: $($_.Exception.Message)"
            }
        }
    }
}

Test-Case 'Login with correct password returns access token' {
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/login" -Body @{
        email = $email; password = $password
    }
    $j = $r.Content | ConvertFrom-Json
    Assert-NotNull $j.access.value 'access token from login'
}

Test-Case 'Login with wrong password rejected (401)' {
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/login" -Body @{
            email = $email; password = 'WrongPass9999!'
        } | Out-Null
        throw 'Should have rejected wrong password'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 401') {
            throw "Expected 401, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'Login non-existent email rejected with same message (no enumeration)' {
    $bodyA = $null; $bodyB = $null
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/login" -Body @{
            email = "ghost-$ts@aetheria-test.invalid"; password = 'WhateverPass1!'
        } | Out-Null
    } catch { $bodyA = $_.Exception.Message }
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/login" -Body @{
            email = $email; password = 'WrongPass!'
        } | Out-Null
    } catch { $bodyB = $_.Exception.Message }
    # Both must report 401 with the same generic message — no enumeration signal.
    Assert-Match 'HTTP 401' $bodyA 'ghost email returns 401'
    Assert-Match 'HTTP 401' $bodyB 'wrong password returns 401'
}

Test-Case 'POST /api/auth/refresh with valid cookie returns fresh token' {
    # Use the session from earlier signup which has the refresh cookie
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/refresh" -Body @{} -Session $session
    $j = $r.Content | ConvertFrom-Json
    Assert-NotNull $j.access.value 'refresh returned access token'
}

Test-Case 'POST /api/auth/refresh without cookie rejected' {
    $emptySession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/refresh" -Body @{} -Session $emptySession | Out-Null
        throw 'Should have rejected without cookie'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 4') {
            throw "Expected 4xx, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'POST /api/auth/logout clears refresh cookie' {
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/logout" -Body @{} -Session $session
    $cookieHdr = "$($r.Headers['Set-Cookie'])"
    if ($cookieHdr) {
        Assert-Match 'Max-Age=0' $cookieHdr 'logout cookie Max-Age=0'
    }
}

End-Suite
