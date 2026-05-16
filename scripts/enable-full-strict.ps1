# =============================================================================
# Aetheria - flip the origin to HTTPS and prepare CF for Full (Strict).
# =============================================================================
# Prerequisite: install-origin-cert.ps1 must have already shipped the cert +
# key to /etc/caddy/certs/games-core-origin.{pem,key}. This script then:
#   1. Uploads the new Caddyfile that listens on :443 with that cert
#   2. Validates the Caddyfile
#   3. Reloads Caddy (zero-downtime)
#   4. Verifies origin self-test on :443
#   5. Prints the final manual step (flip CF SSL mode in dashboard)
# =============================================================================

$ErrorActionPreference = 'Stop'
$REMOTE = 'root@77.42.35.9'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host ''
Write-Host '  Aetheria - enable Full (Strict) SSL' -ForegroundColor Cyan
Write-Host ''

Write-Host "  [1/5] Checking origin cert exists on $REMOTE ..." -ForegroundColor Cyan
$probe = & ssh $REMOTE 'test -s /etc/caddy/certs/games-core-origin.pem && test -s /etc/caddy/certs/games-core-origin.key && echo OK || echo MISSING'
if ($probe -ne 'OK') {
    Write-Host '  ERROR: /etc/caddy/certs/games-core-origin.{pem,key} not found.' -ForegroundColor Red
    Write-Host '         Run scripts\install-origin-cert.ps1 first.' -ForegroundColor Yellow
    exit 1
}
Write-Host '        cert + key present' -ForegroundColor Green

Write-Host '  [2/5] Uploading Caddyfile ...' -ForegroundColor Cyan
& scp "$repoRoot\docker\host\Caddyfile" "${REMOTE}:/etc/caddy/Caddyfile"

Write-Host '  [3/5] Validating Caddyfile ...' -ForegroundColor Cyan
$val = & ssh $REMOTE 'caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1'
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: Caddyfile invalid:' -ForegroundColor Red
    Write-Host $val
    exit 1
}
$val | Select-Object -Last 1 | ForEach-Object { Write-Host "        $_" -ForegroundColor Gray }

Write-Host '  [4/5] Reloading Caddy (zero-downtime) ...' -ForegroundColor Cyan
& ssh $REMOTE 'systemctl reload caddy && sleep 2 && systemctl is-active caddy'

Write-Host '  [5/5] Verifying origin :443 with TLS ...' -ForegroundColor Cyan
$probeCmd = @'
echo '== port 443 listening =='
ss -tlnp 'sport = :443' | head -3
echo
echo '== TLS handshake to ourselves =='
echo | openssl s_client -connect 127.0.0.1:443 -servername aetheria.games-core.com -brief 2>&1 | head -5
echo
echo '== HTTPS smoke (loop back) =='
curl -ks --resolve aetheria.games-core.com:443:127.0.0.1 -o /dev/null -w 'web   HTTP %{http_code}\n' https://aetheria.games-core.com/
curl -ks --resolve aetheria-api.games-core.com:443:127.0.0.1 -o /dev/null -w 'api   HTTP %{http_code}\n' https://aetheria-api.games-core.com/health
curl -ks --resolve aetheria-ws.games-core.com:443:127.0.0.1 -o /dev/null -w 'ws    HTTP %{http_code}\n' https://aetheria-ws.games-core.com/healthz
'@
$probe = & ssh $REMOTE $probeCmd
Write-Host $probe

Write-Host ''
Write-Host '  Origin now serves HTTPS on :443 with CF Origin Certificate.' -ForegroundColor Green
Write-Host ''
Write-Host '  Final step (you do this on Cloudflare):' -ForegroundColor Yellow
Write-Host '    1. CF dashboard - games-core.com - SSL/TLS - Overview'
Write-Host '    2. Select radio: Full (strict)'
Write-Host '    3. Wait 5 seconds for CF edge to reconfigure'
Write-Host '    4. Re-run scripts/test/run-all.ps1 to verify'
Write-Host ''
