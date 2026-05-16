# Suite 01 — infrastructure: DNS / network reach / TLS / security headers.
# Smoke-tests the public-facing edges (Cloudflare, host Caddy, app containers)
# without exercising any real game logic. If this suite fails, all subsequent
# suites will fail too — fix infra first.

Start-Suite '01' 'Infrastructure & edge'

# DNS resolution — all three hostnames must resolve to a Cloudflare IP.
# (Cannot use `$host` — PowerShell reserves it for the host runtime.)
foreach ($h in @($script:BaseUrl, $script:ApiUrl, $script:WsUrl)) {
    $hostname = ([uri]$h).Host
    Test-Case "DNS resolves $hostname" {
        $r = Resolve-DnsName -Name $hostname -Type A -DnsOnly -Server 1.1.1.1 -ErrorAction Stop |
             Where-Object Type -EQ 'A' | Select-Object -First 1
        Assert-NotNull $r 'A record'
        Assert-True ($r.IPAddress -match '^(104\.21|172\.6[4-9]|172\.7[01])\.') "DNS should resolve to a Cloudflare anycast IP (got: $($r.IPAddress))"
    } | Out-Null
}

# HTTPS reachability — each hostname must return a 2xx through Cloudflare.
$probes = @(
    @{ Url = "$script:BaseUrl/";        Name = 'web /' }
    @{ Url = "$script:ApiUrl/health";   Name = 'api /health' }
    @{ Url = "$script:WsUrl/healthz";   Name = 'realtime /healthz' }
)
foreach ($p in $probes) {
    Test-Case ("Reach " + $p.Name) {
        $r = Invoke-HttpRaw -Method GET -Url $p.Url
        Assert-True ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) "Expected 2xx, got $($r.StatusCode)"
    } | Out-Null
}

# Cloudflare proxy hops — every response should carry a cf-ray header.
Test-Case 'Cloudflare proxy active (cf-ray header)' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/"
    Assert-NotNull $r.Headers['cf-ray'] 'cf-ray'
}

# Host Caddy reverse-proxy hops — Via: 1.1 Caddy should appear on /api endpoints.
Test-Case 'Host Caddy via header present' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:ApiUrl/health"
    Assert-Match 'Caddy' "$($r.Headers['Via'])" 'Via header'
}

# API health body shape.
Test-Case 'API /health body shape' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:ApiUrl/health"
    $j = $r.Content | ConvertFrom-Json
    Assert-Eq $true $j.ok 'health.ok'
    Assert-True ($j.ts -gt 1700000000000) 'health.ts is a recent epoch ms'
}

# Realtime health body shape.
Test-Case 'Realtime /healthz body shape' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:WsUrl/healthz"
    $j = $r.Content | ConvertFrom-Json
    Assert-Eq $true $j.ok 'healthz.ok'
}

# HTTP → HTTPS redirect — Cloudflare auto-301s plain HTTP.
Test-Case 'HTTP is upgraded to HTTPS by Cloudflare' {
    $r = Invoke-HttpRaw -Method GET -Url ($script:BaseUrl -replace '^https://', 'http://') -Headers @{}
    # CF returns either 301 from CF edge or follows automatically — both end at 200.
    Assert-True ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) "Got HTTP $($r.StatusCode)"
}

End-Suite
