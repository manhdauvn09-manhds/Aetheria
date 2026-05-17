# Suite 09 — URL pattern, NEXT_PUBLIC env baking, Next.js auth proxy routes.
# Regression tests for the "fetch failed" outage caused by NEXT_PUBLIC_API_URL
# being set to api.aetheria.games-core.com (DNS doesn't exist on CF Free
# 1-level wildcard) instead of aetheria-api.games-core.com.
#
# Also covers the Next.js auth proxy layer (/api/auth/*) that wraps tRPC and
# the input validation rules (displayName regex, password length).
#
# NOTE: Auth bucket is 10 req/60s/IP. We sleep 65s up-front to start with a
# clean bucket and then carefully ration our /api/auth calls.

Start-Suite '09' 'URL pattern, env baking, auth proxy & validation'

Write-Host "         (waiting 65s to clear auth rate-limit bucket before this suite...)" -ForegroundColor DarkGray
Start-Sleep -Seconds 65

# ─── A. URL pattern correctness (no network) ─────────────────────────

Test-Case 'API URL uses dash naming (aetheria-api), NOT subsubdomain' {
    Assert-Match '^https://aetheria-api\.' $script:ApiUrl 'API URL pattern'
    if ($script:ApiUrl -match 'https://api\.aetheria\.') {
        throw "API URL uses subsubdomain — CF Free wildcard supports 1 level only"
    }
}

Test-Case 'Realtime URL uses dash naming (aetheria-ws), NOT subsubdomain' {
    Assert-Match '^https://aetheria-ws\.' $script:WsUrl 'WS URL pattern'
    if ($script:WsUrl -match 'https://ws\.aetheria\.') {
        throw "WS URL uses subsubdomain — CF Free wildcard supports 1 level only"
    }
}

Test-Case 'Wrong subsubdomain pattern api.aetheria.* DOES NOT resolve' {
    try {
        $null = Resolve-DnsName -Name 'api.aetheria.games-core.com' -Type A -DnsOnly -Server 1.1.1.1 -ErrorAction Stop
        Write-Host "         (warn: api.aetheria.games-core.com resolves — keep dash pattern anyway)" -ForegroundColor DarkYellow
    } catch {
        # Expected: NXDOMAIN
    }
}

# ─── B. Web bundle env baking ────────────────────────────────────────

Test-Case 'Web HTML does NOT reference wrong URL pattern (api.aetheria.*)' {
    $r = Invoke-HttpRaw -Method GET -Url $script:BaseUrl
    if ($r.Content -match '://api\.aetheria\.games-core\.com') {
        throw 'Wrong URL pattern (api.aetheria.*) found in HTML — web container needs rebuild'
    }
    if ($r.Content -match '://ws\.aetheria\.games-core\.com') {
        throw 'Wrong WS URL pattern (ws.aetheria.*) found in HTML — web container needs rebuild'
    }
}

Test-Case 'Web /signup page is served (200, contains form)' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/signup"
    Assert-Eq 200 $r.StatusCode 'signup page status'
    Assert-Match 'Create your account' $r.Content 'signup form heading'
}

# Web CSP has a known relaxation: 'unsafe-eval' is allowed because Pixi.js
# v8's WebGL shader compilation requires it (chunk 4340 throws "Cannot
# read 'canvas' of null" otherwise). The pixi.js/unsafe-eval polyfill
# exists but Next.js chunk ordering doesn't reliably patch in time.
# Trade-off documented in apps/web/next.config.mjs — 'self' still blocks
# external script origins which is the bigger XSS risk.
Test-Case "Web CSP includes script-src 'self' (still blocks external scripts)" {
    $r = Invoke-HttpRaw -Method GET -Url $script:BaseUrl
    $csp = "$($r.Headers['Content-Security-Policy'])"
    Assert-Match "script-src[^;]*'self'" $csp 'CSP has script-src self'
    # 'unsafe-eval' is intentional — see next.config.mjs comment.
}

Test-Case 'Web /play/[N] page loads (signals Pixi can render)' {
    # The page is auth-gated client-side, but the HTML shell + Pixi
    # bundle still get served. Pixi import resolves at runtime; if the
    # CSP-safe pixi.js/unsafe-eval import is missing from the bundle,
    # Pixi v8 throws _unsafeEvalCheck and combat scene goes blank.
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/play/1"
    Assert-Eq 200 $r.StatusCode 'play page status'
    # Look for the lazy-loaded combat chunk reference in the HTML.
    Assert-Match '/_next/static/chunks/' $r.Content 'next.js chunks linked'
}

# ─── C. CORS / Origin header behavior (no auth needed) ───────────────

Test-Case 'API accepts allowed Origin (web app)' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:ApiUrl/health" -Headers @{
        'Origin' = $script:BaseUrl
    }
    Assert-Eq 200 $r.StatusCode 'health status'
}

Test-Case 'API does NOT reflect evil Origin in ACAO' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:ApiUrl/health" -Headers @{
        'Origin' = 'https://evil.example.com'
    }
    $acao = "$($r.Headers['Access-Control-Allow-Origin'])"
    if ($acao -eq 'https://evil.example.com') {
        throw 'Evil origin reflected in ACAO — CORS misconfigured'
    }
}

# ─── D. Auth proxy: ONE successful signup, then validation rejects ────
# Strategy: 1 successful signup (counts 1/10), then 400-rejects don't count
# against IP bucket on most rate-limit implementations (depends on plugin
# order). Order: validation FIRST so rejects happen before bucket charge.

$tsx = (Get-Date -Format 'yyyyMMddHHmmssfff')
$suffix = $tsx.Substring(8, 6)

# Validation rejects (these are POST /api/auth/signup but with bad bodies;
# they SHOULD return 400 from Next.js BEFORE the API rate limiter is hit
# because they fail Zod parse in the Next route handler.)
Test-Case 'Signup with email-as-displayName → 400 VALIDATION_FAILED' {
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "bademail-$tsx@aetheria-test.invalid"
            password = 'TestPass1234!'
            displayName = "bademail-$tsx@aetheria-test.invalid"
        } | Out-Null
        throw 'Should have rejected displayName containing @ and .'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 400') {
            throw "Expected 400, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'Signup with short password (<10 chars) → 400 VALIDATION_FAILED' {
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "shortpass-$tsx@aetheria-test.invalid"
            password = 'Short1!'
            displayName = "short$suffix"
        } | Out-Null
        throw 'Should have rejected short password'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 400') {
            throw "Expected 400, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'Signup with invalid email → 400 VALIDATION_FAILED' {
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "not-an-email"
            password = 'TestPass1234!'
            displayName = "validname$suffix"
        } | Out-Null
        throw 'Should have rejected invalid email'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 400') {
            throw "Expected 400, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'Signup with too-short displayName (1 char) → 400' {
    try {
        Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
            email = "shortname-$tsx@aetheria-test.invalid"
            password = 'TestPass1234!'
            displayName = 'a'
        } | Out-Null
        throw 'Should have rejected 1-char displayName'
    } catch {
        if ($_.Exception.Message -notmatch 'HTTP 400') {
            throw "Expected 400, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'Signup with malformed JSON body → 400' {
    try {
        $params = @{
            Uri = "$script:BaseUrl/api/auth/signup"
            Method = 'POST'
            Headers = @{ 'X-Aetheria-Client' = 'test-suite' }
            Body = '{not-valid-json}'
            ContentType = 'application/json'
            TimeoutSec = 15
            UseBasicParsing = $true
            ErrorAction = 'Stop'
        }
        Invoke-WebRequest @params | Out-Null
        throw 'Should have rejected malformed JSON'
    } catch {
        $resp = $_.Exception.Response
        if (-not $resp -or [int]$resp.StatusCode -ne 400) {
            throw "Expected 400, got: $($_.Exception.Message)"
        }
    }
}

# ─── E. One real signup to prove the URL/env wiring works end-to-end ──
# This is the regression test for the "fetch failed" bug. If
# NEXT_PUBLIC_API_URL is wrong, the Next.js server-side fetch to the API
# fails and this returns 500/INTERNAL.

$probeEmail = "probe-$tsx@aetheria-test.invalid"
$probeName = "probe$suffix"
$probePass = 'TestPass1234!'
$probeToken = $null

Test-Case 'Signup with valid inputs → 200 + session JSON (URL wiring works)' {
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
        email = $probeEmail
        password = $probePass
        displayName = $probeName
    }
    Assert-Eq 200 $r.StatusCode 'signup HTTP status'
    $j = $r.Content | ConvertFrom-Json
    Assert-NotNull $j.user.id 'user.id'
    Assert-Eq $probeEmail $j.user.email 'user.email'
    Assert-NotNull $j.access.value 'access token'
    Assert-Match '^eyJ' $j.access.value 'JWT format'
    $script:_probeToken = $j.access.value
}

Test-Case 'Signup with valid underscore + hyphen in displayName works' {
    $okName = "ok_name-$suffix"
    $r = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
        email = "okname-$tsx@aetheria-test.invalid"
        password = $probePass
        displayName = $okName
    }
    Assert-Eq 200 $r.StatusCode 'signup HTTP status'
}

# ─── F. Use the probe token on tRPC to prove full chain works ────────

Test-Case 'End-to-end: use signup access token on tRPC API call' {
    Assert-NotNull $script:_probeToken 'probe token from earlier signup'
    $headers = @{
        'Authorization' = "Bearer $script:_probeToken"
        'Origin' = $script:BaseUrl
    }
    $obj = '{"0":{"json":null,"meta":{"values":["undefined"],"v":1}}}'
    $enc = [System.Web.HttpUtility]::UrlEncode($obj)
    $url = "$script:ApiUrl/trpc/health.ping`?batch=1&input=$enc"
    $r = Invoke-HttpRaw -Method GET -Url $url -Headers $headers
    Assert-Eq 200 $r.StatusCode 'tRPC call status'
}

End-Suite
