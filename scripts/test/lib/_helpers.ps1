# Aetheria — test suite shared helpers.
# Loaded by every suite under scripts/test/suites/*.ps1 and by run-all.ps1.

# ─── Configuration (overridable via env) ──────────────────────────────
$script:BaseUrl = $env:AETHERIA_BASE_URL; if (-not $script:BaseUrl) { $script:BaseUrl = 'https://aetheria.games-core.com' }
$script:ApiUrl  = $env:AETHERIA_API_URL;  if (-not $script:ApiUrl)  { $script:ApiUrl  = 'https://aetheria-api.games-core.com' }
$script:WsUrl   = $env:AETHERIA_WS_URL;   if (-not $script:WsUrl)   { $script:WsUrl   = 'https://aetheria-ws.games-core.com' }

Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

# ─── Test state (single run) ──────────────────────────────────────────
$script:TestState = @{
    Pass        = 0
    Fail        = 0
    Failures    = [System.Collections.ArrayList]@()
    Token       = $null
    UserEmail   = $null
    UserId      = $null
    SuiteStart  = $null
    SuitePassAtStart = 0
    SuiteFailAtStart = 0
    FailFast    = $false
}

function Reset-TestState {
    $script:TestState.Pass = 0
    $script:TestState.Fail = 0
    $script:TestState.Failures.Clear()
    $script:TestState.Token = $null
    $script:TestState.UserEmail = $null
    $script:TestState.UserId = $null
}

# ─── Test case wrapper ────────────────────────────────────────────────
function Test-Case {
    <#
    .SYNOPSIS
        Runs a script block; reports PASS or FAIL with the block's error.
        The block's return value is forwarded so callers can use it.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Action
    )
    try {
        $result = & $Action
        Write-Host ("  [PASS] {0}" -f $Name) -ForegroundColor Green
        $script:TestState.Pass++
        return $result
    } catch {
        $msg = $_.Exception.Message
        Write-Host ("  [FAIL] {0}" -f $Name) -ForegroundColor Red
        Write-Host ("         {0}" -f $msg) -ForegroundColor DarkGray
        if ($_.ErrorDetails.Message) {
            $body = $_.ErrorDetails.Message
            if ($body.Length -gt 240) { $body = $body.Substring(0, 240) + '...' }
            Write-Host ("         body: {0}" -f $body) -ForegroundColor DarkGray
        }
        $script:TestState.Fail++
        $script:TestState.Failures.Add([pscustomobject]@{ Name = $Name; Error = $msg }) | Out-Null
        if ($script:TestState.FailFast) { throw "FailFast triggered by: $Name" }
        return $null
    }
}

# ─── Assertions ───────────────────────────────────────────────────────
function Assert-Eq { param($Expected, $Actual, [string]$What = 'value')
    if ($Expected -ne $Actual) { throw "$What mismatch: expected '$Expected', got '$Actual'" }
}
function Assert-True { param($Cond, [string]$What = 'condition')
    if (-not $Cond) { throw "$What is false" }
}
function Assert-Match { param($Pattern, $Actual, [string]$What = 'value')
    if ($Actual -notmatch $Pattern) { throw "$What did not match '$Pattern' (got: '$Actual')" }
}
function Assert-NotNull { param($Value, [string]$What = 'value')
    if ($null -eq $Value) { throw "$What is null" }
}

# ─── HTTP helper — preserves error body for assertion ────────────────
function Invoke-HttpRaw {
    [CmdletBinding()]
    param(
        [string]$Method = 'GET',
        [string]$Url,
        [hashtable]$Headers = @{},
        [object]$Body,
        [int]$TimeoutSec = 15,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session
    )
    $headers2 = @{ 'X-Aetheria-Client' = 'test-suite' }
    foreach ($k in $Headers.Keys) { $headers2[$k] = $Headers[$k] }
    $params = @{
        Uri = $Url
        Method = $Method
        Headers = $headers2
        TimeoutSec = $TimeoutSec
        UseBasicParsing = $true
        ErrorAction = 'Stop'
    }
    if ($Session) { $params.WebSession = $Session }
    if ($null -ne $Body) {
        if ($Body -is [hashtable] -or $Body -is [pscustomobject]) {
            $params.Body = ($Body | ConvertTo-Json -Compress -Depth 12)
        } else {
            $params.Body = $Body
        }
        $params.ContentType = 'application/json'
    }
    try {
        return Invoke-WebRequest @params
    } catch {
        # Re-throw a normalized error that carries the response status + body
        $resp = $_.Exception.Response
        $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
        $body = $null
        if ($_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
        $msg = "HTTP $status from $Url"
        if ($body) { $msg += " :: $body" }
        throw $msg
    }
}

# ─── Auth helper — caches a token for the suite run ──────────────────
function Get-TestUser {
    <#
    .SYNOPSIS
        Sign up a brand-new test user (unique email per session) and cache
        the access token. Subsequent calls return the cached values.
    #>
    if ($script:TestState.Token) {
        return [pscustomobject]@{
            Email  = $script:TestState.UserEmail
            UserId = $script:TestState.UserId
            Token  = $script:TestState.Token
        }
    }
    $ts = (Get-Date -Format 'yyyyMMddHHmmssfff')
    $email = "ts-$ts@aetheria-test.invalid"
    $name = "ts$($ts.Substring(8,6))"
    # Auth bucket is 10 signups/60s/IP. When the full suite runs many
    # auth-heavy suites back-to-back the bucket can be exhausted by the
    # time a later suite calls Get-TestUser. Back off once (wait out the
    # window) + retry so the full run self-heals instead of cascading
    # 429s through suites 04/05/06.
    $resp = $null
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
            $resp = Invoke-HttpRaw -Method POST -Url "$script:BaseUrl/api/auth/signup" -Body @{
                email = $email
                password = 'Aq7!zKmTvW4xP9r'
                displayName = $name
            }
            break
        } catch {
            if ($attempt -lt 2 -and $_.Exception.Message -match '429') {
                Write-Host '         (auth bucket full — waiting 62s then retrying signup…)' -ForegroundColor DarkYellow
                Start-Sleep -Seconds 62
                continue
            }
            throw
        }
    }
    $data = $resp.Content | ConvertFrom-Json
    $script:TestState.Token = $data.access.value
    $script:TestState.UserEmail = $email
    $script:TestState.UserId = $data.user.id
    return [pscustomobject]@{
        Email  = $email
        UserId = $data.user.id
        Token  = $data.access.value
    }
}

# ─── tRPC GET (query) ─────────────────────────────────────────────────
function Invoke-TrpcQuery {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Procedure,
        [object]$Payload = $null,
        [switch]$NoAuth,
        [int]$ExpectStatus = 200
    )
    $token = $null
    if (-not $NoAuth) { $token = (Get-TestUser).Token }

    $payloadJson = if ($null -eq $Payload) { 'null' } else { ($Payload | ConvertTo-Json -Compress -Depth 12) }
    $obj = "{`"0`":{`"json`":$payloadJson}}"
    $enc = [System.Web.HttpUtility]::UrlEncode($obj)
    $url = "$script:ApiUrl/trpc/$Procedure`?batch=1&input=$enc"
    $headers = @{ 'Origin' = $script:BaseUrl }
    if ($token) { $headers['Authorization'] = "Bearer $token" }

    $resp = Invoke-HttpRaw -Method GET -Url $url -Headers $headers
    if ($resp.StatusCode -ne $ExpectStatus) { throw "Expected HTTP $ExpectStatus, got $($resp.StatusCode)" }
    $body = $resp.Content | ConvertFrom-Json
    if ($body[0].error) { throw "tRPC: $($body[0].error.json.message)" }
    return $body[0].result.data.json
}

# ─── tRPC POST (mutation) ─────────────────────────────────────────────
function Invoke-TrpcMutation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Procedure,
        [object]$Payload,
        [switch]$NoAuth,
        [int]$ExpectStatus = 200
    )
    $token = $null
    if (-not $NoAuth) { $token = (Get-TestUser).Token }

    $body = @{ "0" = @{ json = $Payload } }
    $headers = @{ 'Origin' = $script:BaseUrl }
    if ($token) { $headers['Authorization'] = "Bearer $token" }

    $resp = Invoke-HttpRaw -Method POST -Url "$script:ApiUrl/trpc/$Procedure`?batch=1" -Headers $headers -Body $body
    if ($resp.StatusCode -ne $ExpectStatus) { throw "Expected HTTP $ExpectStatus, got $($resp.StatusCode)" }
    $r = $resp.Content | ConvertFrom-Json
    if ($r[0].error) { throw "tRPC: $($r[0].error.json.message)" }
    return $r[0].result.data.json
}

# ─── Suite frame ─────────────────────────────────────────────────────
function Start-Suite {
    param([string]$Number, [string]$Name)
    Write-Host ""
    Write-Host ("───── [{0}] {1} {2}" -f $Number, $Name, ('─' * [Math]::Max(0, 50 - $Name.Length))) -ForegroundColor Cyan
    $script:TestState.SuiteStart = Get-Date
    $script:TestState.SuitePassAtStart = $script:TestState.Pass
    $script:TestState.SuiteFailAtStart = $script:TestState.Fail
}

function End-Suite {
    $passed = $script:TestState.Pass - $script:TestState.SuitePassAtStart
    $failed = $script:TestState.Fail - $script:TestState.SuiteFailAtStart
    $dur = ((Get-Date) - $script:TestState.SuiteStart).TotalSeconds
    $color = if ($failed -eq 0) { 'Green' } else { 'Yellow' }
    Write-Host ("   suite: {0} pass / {1} fail   ({2:N1}s)" -f $passed, $failed, $dur) -ForegroundColor $color
}

# ─── Final report ─────────────────────────────────────────────────────
function Write-FinalReport {
    param([double]$DurationSec = 0)
    $total = $script:TestState.Pass + $script:TestState.Fail
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor DarkGray
    $color = if ($script:TestState.Fail -eq 0) { 'Green' } else { 'Red' }
    Write-Host ("  RESULT: {0} passed / {1} failed   ({2} total)" -f $script:TestState.Pass, $script:TestState.Fail, $total) -ForegroundColor $color
    Write-Host ("  Duration: {0:N1}s" -f $DurationSec) -ForegroundColor DarkGray
    Write-Host ("=" * 60) -ForegroundColor DarkGray
    if ($script:TestState.Fail -gt 0) {
        Write-Host ""
        Write-Host "  Failures:" -ForegroundColor Red
        foreach ($f in $script:TestState.Failures) {
            Write-Host ("   * {0}" -f $f.Name) -ForegroundColor Yellow
            Write-Host ("     {0}" -f $f.Error) -ForegroundColor DarkGray
        }
    }
    Write-Host ""
}
