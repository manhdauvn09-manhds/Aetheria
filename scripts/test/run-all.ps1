# =============================================================================
# Aetheria — production test runner (PowerShell).
# =============================================================================
# Runs every *.ps1 under scripts/test/suites in lexical order and reports a
# pass/fail summary. Each suite is independent and isolated by a fresh user.
#
# Usage:
#   .\scripts\test\run-all.ps1                    # run everything
#   .\scripts\test\run-all.ps1 -Suite auth        # run only suites whose name contains "auth"
#   .\scripts\test\run-all.ps1 -Suite auth,world  # match multiple
#   .\scripts\test\run-all.ps1 -FailFast          # stop on first failure
#
# Environment overrides (handy when deploying to a different stack):
#   AETHERIA_BASE_URL   default https://aetheria.games-core.com
#   AETHERIA_API_URL    default https://aetheria-api.games-core.com
#   AETHERIA_WS_URL     default https://aetheria-ws.games-core.com
#
# Exit code: 0 = all passed, 1 = at least one failed (handy for CI).
# =============================================================================

param(
    [string[]]$Suite = @('*'),
    [switch]$FailFast,
    [switch]$ListOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$root = $PSScriptRoot
. "$root\lib\_helpers.ps1"
Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

Reset-TestState
$script:TestState.FailFast = [bool]$FailFast

$suites = Get-ChildItem "$root\suites\*.ps1" | Sort-Object Name
if ($ListOnly) {
    Write-Host ""
    Write-Host "Suites available:" -ForegroundColor Cyan
    foreach ($s in $suites) { Write-Host ("  - " + $s.BaseName) }
    return
}

# Filter suites by name substring (case-insensitive). '*' = all.
$filtered = @()
foreach ($s in $suites) {
    $shouldRun = ($Suite -contains '*')
    if (-not $shouldRun) {
        foreach ($q in $Suite) {
            if ($s.BaseName -like "*$q*") { $shouldRun = $true; break }
        }
    }
    if ($shouldRun) { $filtered += $s }
}

# Banner
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor DarkGray
Write-Host "  Aetheria production test suite" -ForegroundColor Cyan
Write-Host ("  Target:   " + $script:BaseUrl) -ForegroundColor Gray
Write-Host ("  API:      " + $script:ApiUrl) -ForegroundColor Gray
Write-Host ("  Realtime: " + $script:WsUrl) -ForegroundColor Gray
Write-Host ("  Started:  " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Gray
Write-Host ("  Suites:   " + (($filtered | ForEach-Object BaseName) -join ', ')) -ForegroundColor Gray
Write-Host ("=" * 60) -ForegroundColor DarkGray

$start = Get-Date
$crashed = @()

foreach ($s in $filtered) {
    try {
        . $s.FullName
    } catch {
        Write-Host ""
        Write-Host ("  ⚠ Suite {0} crashed: {1}" -f $s.BaseName, $_.Exception.Message) -ForegroundColor Red
        $crashed += $s.BaseName
        if ($FailFast) { break }
    }
}

$totalDur = ((Get-Date) - $start).TotalSeconds
Write-FinalReport -DurationSec $totalDur

if ($crashed.Count -gt 0) {
    Write-Host "  Suites that crashed (not the same as a failing test case):" -ForegroundColor Red
    foreach ($c in $crashed) { Write-Host "   * $c" -ForegroundColor Yellow }
    Write-Host ""
}

# Exit code for CI
if ($script:TestState.Fail -gt 0 -or $crashed.Count -gt 0) { exit 1 } else { exit 0 }
