# =============================================================================
# Aetheria — install Cloudflare Origin Certificate on the VPS.
# =============================================================================
# After generating an Origin Cert at CF dashboard:
#   SSL/TLS → Origin Server → Create Certificate
# this script ships the cert + key to the server and stages them under
#   /etc/caddy/certs/games-core-origin.pem
#   /etc/caddy/certs/games-core-origin.key
#
# Usage:
#   .\scripts\install-origin-cert.ps1
# It will prompt you to paste the certificate, then the private key.
# =============================================================================

$ErrorActionPreference = 'Stop'
$REMOTE = 'root@77.42.35.9'

Write-Host ""
Write-Host "  Aetheria — Cloudflare Origin Certificate installer" -ForegroundColor Cyan
Write-Host "  Target: $REMOTE" -ForegroundColor Gray
Write-Host ""
Write-Host "  Paste the ORIGIN CERTIFICATE (the first blob from CF dashboard)." -ForegroundColor Yellow
Write-Host "  Start with '-----BEGIN CERTIFICATE-----' line and end with"
Write-Host "  '-----END CERTIFICATE-----'. Then press Enter on an empty line."
Write-Host ""

$certLines = @()
while ($true) {
    $line = Read-Host
    if ([string]::IsNullOrEmpty($line)) { break }
    $certLines += $line
}
if (-not ($certLines -join "`n").Contains('BEGIN CERTIFICATE')) {
    Write-Host "ERROR: pasted text doesn't look like a PEM certificate." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Now paste the PRIVATE KEY (second blob from CF dashboard)." -ForegroundColor Yellow
Write-Host "  Start with '-----BEGIN ... PRIVATE KEY-----' and end with the matching END line." -ForegroundColor Yellow
Write-Host "  Press Enter on an empty line when done."
Write-Host ""

$keyLines = @()
while ($true) {
    $line = Read-Host
    if ([string]::IsNullOrEmpty($line)) { break }
    $keyLines += $line
}
if (-not ($keyLines -join "`n").Contains('PRIVATE KEY')) {
    Write-Host "ERROR: pasted text doesn't look like a PEM private key." -ForegroundColor Red
    exit 1
}

$certPem = ($certLines -join "`n") + "`n"
$keyPem  = ($keyLines  -join "`n") + "`n"

# Write to local temp first so the pasted secret never touches stdout.
$tmpCert = New-TemporaryFile
$tmpKey  = New-TemporaryFile
try {
    [System.IO.File]::WriteAllText($tmpCert.FullName, $certPem)
    [System.IO.File]::WriteAllText($tmpKey.FullName,  $keyPem)

    Write-Host ""
    Write-Host "  Copying to $REMOTE ..." -ForegroundColor Cyan
    & ssh $REMOTE 'mkdir -p /etc/caddy/certs && chmod 700 /etc/caddy/certs'
    & scp $tmpCert.FullName "${REMOTE}:/etc/caddy/certs/games-core-origin.pem"
    & scp $tmpKey.FullName  "${REMOTE}:/etc/caddy/certs/games-core-origin.key"

    & ssh $REMOTE 'chown caddy:caddy /etc/caddy/certs/games-core-origin.* && chmod 644 /etc/caddy/certs/games-core-origin.pem && chmod 600 /etc/caddy/certs/games-core-origin.key'

    Write-Host "  Verifying file integrity..." -ForegroundColor Cyan
    $verify = & ssh $REMOTE 'openssl x509 -in /etc/caddy/certs/games-core-origin.pem -noout -subject -dates -issuer 2>&1 && echo "---" && openssl pkey -in /etc/caddy/certs/games-core-origin.key -noout -text 2>&1 | head -1 && echo "match-test:" && (openssl x509 -in /etc/caddy/certs/games-core-origin.pem -noout -modulus | openssl md5; openssl rsa -in /etc/caddy/certs/games-core-origin.key -noout -modulus 2>/dev/null | openssl md5)'
    Write-Host $verify

    Write-Host ""
    Write-Host "  ✅ Cert + key installed. Next step:" -ForegroundColor Green
    Write-Host "     .\scripts\enable-full-strict.ps1" -ForegroundColor Yellow
} finally {
    Remove-Item $tmpCert.FullName -Force -ErrorAction SilentlyContinue
    Remove-Item $tmpKey.FullName  -Force -ErrorAction SilentlyContinue
}
