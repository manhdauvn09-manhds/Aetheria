# Suite 02 — security & CORS headers.
# Regression-tests every header we deliberately set (CSP, HSTS, COOP, CORP,
# X-Frame, etc.) and the CORS preflight (x-aetheria-client was the bug that
# motivated this suite; we lock it in).

Start-Suite '02' 'Security & CORS headers'

# Web origin — the response from the Next.js front-end through Caddy + CF.
Test-Case 'Web HSTS preload (≥ 2y, includeSubDomains, preload)' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/"
    $h = $r.Headers['Strict-Transport-Security']
    Assert-NotNull $h 'HSTS header'
    Assert-Match 'max-age=63072000' $h 'HSTS max-age'
    Assert-Match 'includeSubDomains' $h 'HSTS includeSubDomains'
    Assert-Match 'preload' $h 'HSTS preload'
}

Test-Case 'Web CSP present and frame-ancestors none' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/"
    $h = $r.Headers['Content-Security-Policy']
    Assert-NotNull $h 'CSP header'
    Assert-Match "frame-ancestors 'none'" $h 'CSP frame-ancestors'
    Assert-Match "default-src 'self'" $h 'CSP default-src'
}

Test-Case 'Web X-Frame-Options blocks cross-origin framing' {
    # Origin (Next.js) sets DENY, but Cloudflare's edge layer rewrites it to
    # SAMEORIGIN on the Free plan (no Transform Rule available to suppress).
    # Both values defeat the threat we care about: cross-origin iframes. CSP
    # `frame-ancestors 'none'` (verified above) is the modern, browser-honoured
    # version of the same defence — X-Frame-Options is the legacy fallback.
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/"
    $xfo = "$($r.Headers['X-Frame-Options'])"
    Assert-True ($xfo -in 'DENY','SAMEORIGIN') "X-Frame-Options should be DENY or SAMEORIGIN, got '$xfo'"
}

Test-Case 'Web COOP = same-origin' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/"
    Assert-Eq 'same-origin' "$($r.Headers['Cross-Origin-Opener-Policy'])" 'COOP'
}

Test-Case 'Web Permissions-Policy locks down sensors' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:BaseUrl/"
    $h = $r.Headers['Permissions-Policy']
    Assert-NotNull $h 'Permissions-Policy'
    Assert-Match 'camera=\(\)' $h 'camera disabled'
    Assert-Match 'microphone=\(\)' $h 'microphone disabled'
}

Test-Case 'API CSP tight (default-src none)' {
    $r = Invoke-HttpRaw -Method GET -Url "$script:ApiUrl/health"
    $h = $r.Headers['Content-Security-Policy']
    Assert-NotNull $h 'API CSP'
    Assert-Match "default-src 'none'" $h 'API CSP default-src none'
}

# CORS preflight — this is the regression test for the x-aetheria-client bug.
Test-Case 'CORS preflight allows x-aetheria-client header' {
    $r = Invoke-HttpRaw -Method OPTIONS -Url "$script:ApiUrl/trpc/world.realms" -Headers @{
        'Origin' = $script:BaseUrl
        'Access-Control-Request-Method' = 'GET'
        'Access-Control-Request-Headers' = 'authorization, x-aetheria-client, content-type'
    }
    Assert-Eq 204 $r.StatusCode 'preflight status'
    $allow = "$($r.Headers['Access-Control-Allow-Headers'])"
    Assert-Match 'x-aetheria-client' $allow 'allow-headers'
    Assert-Match 'authorization' $allow 'allow-headers includes authorization'
    Assert-Match 'content-type' $allow 'allow-headers includes content-type'
}

Test-Case 'CORS preflight reflects our origin' {
    $r = Invoke-HttpRaw -Method OPTIONS -Url "$script:ApiUrl/trpc/world.realms" -Headers @{
        'Origin' = $script:BaseUrl
        'Access-Control-Request-Method' = 'GET'
        'Access-Control-Request-Headers' = 'authorization'
    }
    Assert-Eq $script:BaseUrl "$($r.Headers['Access-Control-Allow-Origin'])" 'allow-origin'
    Assert-Eq 'true' "$($r.Headers['Access-Control-Allow-Credentials'])" 'allow-credentials'
}

Test-Case 'CORS rejects unknown origin' {
    try {
        $r = Invoke-HttpRaw -Method OPTIONS -Url "$script:ApiUrl/trpc/world.realms" -Headers @{
            'Origin' = 'https://evil.example.com'
            'Access-Control-Request-Method' = 'GET'
        }
        # Fastify CORS returns 204 but WITHOUT the allow-origin reflecting evil
        $allow = "$($r.Headers['Access-Control-Allow-Origin'])"
        Assert-True ($allow -ne 'https://evil.example.com') "allow-origin should not reflect evil origin (got '$allow')"
    } catch {
        # 4xx is also acceptable
        if ($_.Exception.Message -notmatch 'HTTP 4') { throw }
    }
}

End-Suite
