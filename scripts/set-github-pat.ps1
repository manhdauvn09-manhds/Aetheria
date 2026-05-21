# scripts/set-github-pat.ps1
#
# Prompts once for a GitHub fine-grained PAT, writes it into
# %USERPROFILE%\.git-credentials for the `manhdauvn09-manhds` account,
# and clears the Windows Credential Manager cache so the `manager`
# helper doesn't shadow our store entry with a stale token.
#
# After this runs, `git push` should work without any further prompt.
#
# Usage:
#   .\scripts\set-github-pat.ps1
#
# To revoke later: edit ~/.git-credentials and remove the relevant line.

[CmdletBinding()]
param(
    [string]$Username = 'manhdauvn09-manhds',
    [string]$GitHost    = 'github.com'
)

$ErrorActionPreference = 'Stop'

# ── 1. Prompt for PAT (input hidden) ──────────────────────────────────
Write-Host ""
Write-Host "GitHub PAT setup for $Username @ $GitHost" -ForegroundColor Cyan
Write-Host "  (Token must have Contents: Read+Write on the repo.)" -ForegroundColor DarkGray
Write-Host ""
$secure = Read-Host "Paste your PAT (input hidden, will be saved to ~/.git-credentials)" -AsSecureString
if ($secure.Length -eq 0) {
    Write-Host "No PAT provided. Aborting." -ForegroundColor Yellow
    exit 1
}
# Convert SecureString → plain (needed for file write). Held in a local
# var that goes out of scope at end of script.
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Sanity check: GitHub fine-grained PATs start with "github_pat_".
# Classic PATs start with "ghp_". Either is acceptable.
if (-not ($pat -match '^(github_pat_|ghp_|ghs_|gho_|ghu_)')) {
    Write-Host "  warn: token doesn't look like a GitHub PAT prefix (expected github_pat_/ghp_/...)" -ForegroundColor Yellow
    Write-Host "        continuing anyway" -ForegroundColor DarkGray
}

# ── 2. Write to ~/.git-credentials, preserving other accounts ─────────
$credFile = Join-Path $env:USERPROFILE '.git-credentials'
$line = "https://${Username}:${pat}@${GitHost}"

if (Test-Path $credFile) {
    # Read existing lines; remove any line for the same user@host pair.
    # Pattern matches our line shape regardless of token value.
    $pattern = "^https://${Username}:[^@]+@${GitHost}/?\s*$"
    $existing = Get-Content -Path $credFile -Encoding UTF8 |
        Where-Object { $_ -notmatch $pattern }
    $all = @($existing) + @($line)
    Set-Content -Path $credFile -Value $all -Encoding UTF8
    Write-Host "  updated $credFile (existing $Username line replaced)" -ForegroundColor Green
} else {
    Set-Content -Path $credFile -Value $line -Encoding UTF8
    Write-Host "  created $credFile with one entry" -ForegroundColor Green
}

# ── 3. Clear Windows Credential Manager cache for github.com ──────────
# The `manager` helper (git-credential-manager.exe) caches tokens in WCM
# and CAN return a stale one BEFORE our `store` helper is consulted.
# Deleting the WCM entry forces git to fall through to ~/.git-credentials.
$wcmTargets = @(
    "git:https://github.com",
    "git:https://${Username}@github.com",
    "LegacyGeneric:target=git:https://github.com"
)
foreach ($t in $wcmTargets) {
    # cmdkey /delete: only writes to stdout/stderr — silence both.
    cmdkey /delete:$t 2>&1 | Out-Null
}
Write-Host "  cleared Windows Credential Manager git entries" -ForegroundColor Green

# ── 4. Ensure both helpers are configured (store as fallback) ─────────
# manager + store both registered globally is the existing setup; keep
# it. We just verify the order is right.
$helpers = git config --global --get-all credential.helper 2>$null
if ($helpers -notcontains 'store') {
    git config --global --add credential.helper store
    Write-Host "  registered 'store' as credential helper" -ForegroundColor Green
}

# ── 5. Smoke-test ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "Verifying with git ls-remote (read-only check)..." -ForegroundColor Cyan
$repoUrl = "https://${GitHost}/${Username}/Aetheria.git"
$env:GIT_TERMINAL_PROMPT = '0'
$lsr = & git ls-remote --heads $repoUrl 2>&1
if ($LASTEXITCODE -eq 0) {
    $branchCount = (($lsr -split "`n") | Where-Object { $_ -match 'refs/heads/' }).Count
    Write-Host "  ls-remote OK ($branchCount branches visible)" -ForegroundColor Green
} else {
    Write-Host "  ls-remote FAILED:" -ForegroundColor Red
    Write-Host "  $lsr" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  PAT may be invalid, expired, or missing 'Contents: Read+Write'" -ForegroundColor Yellow
    Write-Host "  on repo $Username/Aetheria. Re-run this script with the right token." -ForegroundColor Yellow
    exit 1
}

# Clean up the variable
$pat = $null
[System.GC]::Collect()

Write-Host ""
Write-Host "Done. Next 'git push' should work silently." -ForegroundColor Green
Write-Host ""
