# =============================================================================
# Aetheria — deploy to VPS 77.42.35.9 from a Windows PowerShell.
# =============================================================================
# Workflow:
#   1. rsync source code (lean, respects .dockerignore) → /opt/apps/aetheria/src/
#   2. ssh in, run `docker compose -p aetheria-prod -f docker-compose.prod.yml
#      --env-file .env.prod up -d --build`
#   3. show status + tail recent logs
#
# Coexists with PrivateDatingLevel — separate project name, network, ports,
# volumes. Read docker/README.deploy.md for the full topology.
#
# Usage:
#   .\scripts\deploy.ps1 deploy        # full deploy: sync + build + up
#   .\scripts\deploy.ps1 sync          # rsync only — no docker action
#   .\scripts\deploy.ps1 up            # docker compose up (assumes code is in place)
#   .\scripts\deploy.ps1 build         # docker compose build only
#   .\scripts\deploy.ps1 down          # docker compose down (no volumes)
#   .\scripts\deploy.ps1 logs          # tail all aetheria-prod logs
#   .\scripts\deploy.ps1 logs api      # tail just one service
#   .\scripts\deploy.ps1 ps            # docker compose ps
#   .\scripts\deploy.ps1 migrate       # run prisma migrate deploy in the api container
#   .\scripts\deploy.ps1 shell api     # exec into a service
#   .\scripts\deploy.ps1 setup-host    # one-time: install host Caddy + bootstrap dirs
#   .\scripts\deploy.ps1 env-push      # upload .env.prod from local to server (overwrites!)
#   .\scripts\deploy.ps1 status        # quick health check (ports, containers, disk)
#
# Prereqs (one-time):
#   - SSH key in ~/.ssh that 77.42.35.9 trusts as root.
#   - Windows OpenSSH client installed (`ssh -V` works).
#   - rsync available; on Windows easiest path is via Git Bash or WSL. The
#     script falls back to `scp -r` if rsync is missing (slower but works).
# =============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet(
        "deploy", "sync", "up", "build", "down", "logs", "ps",
        "migrate", "shell", "setup-host", "env-push", "status", "help"
    )]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$Service = ""
)

$ErrorActionPreference = "Stop"

# ── Configuration ─────────────────────────────────────────────────────
$REMOTE_HOST    = "77.42.35.9"
$REMOTE_USER    = "root"
$REMOTE_BASE    = "/opt/apps/aetheria"      # owns src/ and .env.prod
$REMOTE_DATA    = "/var/data/aetheria"      # owns mysql/ + redis/ volumes
$PROJECT_NAME   = "aetheria-prod"
$COMPOSE_FILE   = "docker-compose.prod.yml"
$ENV_FILE_NAME  = ".env.prod"
$repoRoot       = Split-Path -Parent $PSScriptRoot
$sshTarget      = "${REMOTE_USER}@${REMOTE_HOST}"
$composeCmd     = "cd ${REMOTE_BASE}/src && docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} --env-file ${ENV_FILE_NAME}"

Set-Location $repoRoot

function Test-Ssh {
    Write-Host "==> Verifying SSH access to ${sshTarget}..." -ForegroundColor Cyan
    & ssh -o BatchMode=yes -o ConnectTimeout=10 $sshTarget "true"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: SSH to ${sshTarget} failed. Confirm your key is in authorized_keys." -ForegroundColor Red
        exit 1
    }
}

function Invoke-RemoteCommand {
    param([string]$RemoteCommand)
    & ssh $sshTarget $RemoteCommand
}

function Sync-Source {
    Write-Host "==> Ensuring remote dirs exist..." -ForegroundColor Cyan
    Invoke-RemoteCommand "mkdir -p ${REMOTE_BASE}/src ${REMOTE_DATA}/mysql ${REMOTE_DATA}/redis"
    if ($LASTEXITCODE -ne 0) { exit 1 }

    $useRsync = $null -ne (Get-Command rsync -ErrorAction SilentlyContinue)
    if ($useRsync) {
        Write-Host "==> rsync source to ${sshTarget}:${REMOTE_BASE}/src/" -ForegroundColor Cyan
        # --delete makes the server an exact mirror of the local tree.
        # Exclusions match .dockerignore intent so we never ship node_modules,
        # generated Prisma clients, or local .env files.
        & rsync -avz --delete --human-readable `
            --exclude='.git/' `
            --exclude='node_modules/' `
            --exclude='**/node_modules/' `
            --exclude='**/dist/' `
            --exclude='**/.next/' `
            --exclude='**/.turbo/' `
            --exclude='**/*.tsbuildinfo' `
            --exclude='**/src/generated/' `
            --exclude='**/.prisma/' `
            --exclude='.env' `
            --exclude='.env.local' `
            --exclude='.env.docker' `
            --exclude='.env.prod' `
            --exclude='.claude/' `
            --exclude='.dev/' `
            --exclude='coverage/' `
            --exclude='**/__tests__/' `
            --exclude='*.log' `
            -e "ssh" `
            "$repoRoot/" "${sshTarget}:${REMOTE_BASE}/src/"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: rsync failed." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "==> rsync not found; falling back to tar | ssh (slower, no incremental sync)." -ForegroundColor Yellow
        $tarCmd = "tar --exclude='.git' --exclude='node_modules' --exclude='**/node_modules' " +
                  "--exclude='**/dist' --exclude='**/.next' --exclude='**/.turbo' " +
                  "--exclude='**/*.tsbuildinfo' --exclude='**/src/generated' --exclude='**/.prisma' " +
                  "--exclude='.env*' --exclude='.claude' --exclude='.dev' --exclude='coverage' " +
                  "--exclude='**/__tests__' --exclude='*.log' -czf - -C `"$repoRoot`" ."
        # Use cmd /c so the pipe is interpreted by Windows correctly; ssh receives stdin.
        cmd /c "$tarCmd | ssh ${sshTarget} `"tar -xzf - -C ${REMOTE_BASE}/src`""
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: tar over ssh failed." -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "==> Source synced." -ForegroundColor Green
}

function Push-Env {
    $localEnv = Join-Path $repoRoot ".env.prod"
    if (-not (Test-Path $localEnv)) {
        Write-Host "ERROR: $localEnv not found. Copy docker/.env.prod.example to .env.prod and fill it in first." -ForegroundColor Red
        exit 1
    }
    Write-Host "==> Uploading $localEnv → ${sshTarget}:${REMOTE_BASE}/src/${ENV_FILE_NAME}" -ForegroundColor Cyan
    Invoke-RemoteCommand "mkdir -p ${REMOTE_BASE}/src && chmod 700 ${REMOTE_BASE}/src"
    & scp $localEnv "${sshTarget}:${REMOTE_BASE}/src/${ENV_FILE_NAME}"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: scp failed." -ForegroundColor Red
        exit 1
    }
    Invoke-RemoteCommand "chmod 600 ${REMOTE_BASE}/src/${ENV_FILE_NAME}"
    Write-Host "==> .env.prod uploaded (mode 600)." -ForegroundColor Green
}

function Ensure-EnvOnServer {
    $check = & ssh $sshTarget "test -f ${REMOTE_BASE}/src/${ENV_FILE_NAME} && echo OK || echo MISSING"
    if ($check -ne "OK") {
        Write-Host "ERROR: ${REMOTE_BASE}/src/${ENV_FILE_NAME} is missing on the server." -ForegroundColor Red
        Write-Host "       Create local .env.prod from docker/.env.prod.example then run:" -ForegroundColor Yellow
        Write-Host "         .\scripts\deploy.ps1 env-push" -ForegroundColor Yellow
        exit 1
    }
}

# ── Commands ──────────────────────────────────────────────────────────
switch ($Command) {
    "deploy" {
        Test-Ssh
        Sync-Source
        Ensure-EnvOnServer
        Write-Host "==> docker compose up --build -d" -ForegroundColor Cyan
        Invoke-RemoteCommand "$composeCmd up -d --build"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: deploy failed." -ForegroundColor Red
            exit 1
        }
        Write-Host ""
        Write-Host "==> Container status:" -ForegroundColor Green
        Invoke-RemoteCommand "$composeCmd ps"
        Write-Host ""
        Write-Host "==> Recent logs (api):" -ForegroundColor Green
        Invoke-RemoteCommand "$composeCmd logs --tail=30 api"
        Write-Host ""
        Write-Host "Deploy done." -ForegroundColor Green
        Write-Host "If this was a first deploy or the schema changed, run:" -ForegroundColor Yellow
        Write-Host "  .\scripts\deploy.ps1 migrate" -ForegroundColor Yellow
    }

    "sync" {
        Test-Ssh
        Sync-Source
    }

    "up" {
        Test-Ssh
        Ensure-EnvOnServer
        Invoke-RemoteCommand "$composeCmd up -d --build"
    }

    "build" {
        Test-Ssh
        Ensure-EnvOnServer
        if ($Service) {
            Invoke-RemoteCommand "$composeCmd build $Service"
        } else {
            Invoke-RemoteCommand "$composeCmd build"
        }
    }

    "down" {
        Test-Ssh
        Ensure-EnvOnServer
        Write-Host "==> docker compose down (volumes preserved)" -ForegroundColor Cyan
        Invoke-RemoteCommand "$composeCmd down"
    }

    "logs" {
        Test-Ssh
        Ensure-EnvOnServer
        if ($Service) {
            Invoke-RemoteCommand "$composeCmd logs -f --tail=200 $Service"
        } else {
            Invoke-RemoteCommand "$composeCmd logs -f --tail=100"
        }
    }

    "ps" {
        Test-Ssh
        Ensure-EnvOnServer
        Invoke-RemoteCommand "$composeCmd ps"
    }

    "migrate" {
        Test-Ssh
        Ensure-EnvOnServer
        Write-Host "==> Running prisma migrate deploy inside aetheria_api..." -ForegroundColor Cyan
        # Prisma CLI is not in the runtime image — invoke via the build stage one-shot.
        Invoke-RemoteCommand "$composeCmd run --rm --no-deps --entrypoint /bin/sh api -c 'npx -y prisma@5.22.0 migrate deploy --schema=node_modules/@aetheria/schema-db/prisma/mysql/schema.prisma'"
    }

    "shell" {
        if (-not $Service) {
            Write-Host "Specify a service: .\scripts\deploy.ps1 shell api" -ForegroundColor Red
            exit 1
        }
        Test-Ssh
        Invoke-RemoteCommand "$composeCmd exec $Service sh"
    }

    "setup-host" {
        Test-Ssh
        Write-Host "==> One-time host bootstrap: dirs + Caddy install" -ForegroundColor Cyan
        Invoke-RemoteCommand "mkdir -p ${REMOTE_BASE}/src ${REMOTE_DATA}/mysql ${REMOTE_DATA}/redis"
        # Upload Caddyfile + installer, then run it.
        & scp "$repoRoot/docker/host/Caddyfile" "${sshTarget}:${REMOTE_BASE}/host-Caddyfile.new"
        & scp "$repoRoot/docker/host/install-host-caddy.sh" "${sshTarget}:${REMOTE_BASE}/install-host-caddy.sh"
        Invoke-RemoteCommand "chmod +x ${REMOTE_BASE}/install-host-caddy.sh && mv ${REMOTE_BASE}/host-Caddyfile.new ${REMOTE_BASE}/host-Caddyfile && cd ${REMOTE_BASE} && bash install-host-caddy.sh"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: host setup failed." -ForegroundColor Red
            exit 1
        }
        Write-Host "==> Host Caddy is up. DNS must point both domains at 77.42.35.9 for certs to issue." -ForegroundColor Green
    }

    "env-push" {
        Test-Ssh
        Push-Env
    }

    "status" {
        Test-Ssh
        Write-Host "==> Server snapshot:" -ForegroundColor Cyan
        Invoke-RemoteCommand "echo '-- ports --'; ss -tlnp '( sport = :80 or sport = :443 or sport = :18080 or sport = :18100 or sport = :18101 or sport = :18102 )' 2>/dev/null; echo; echo '-- aetheria containers --'; cd ${REMOTE_BASE}/src 2>/dev/null && docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} ps 2>/dev/null || echo '(stack not yet deployed)'; echo; echo '-- disk --'; df -h / | tail -1; echo; echo '-- memory --'; free -h | head -2"
    }

    default {
        Write-Host "Aetheria deploy helper — VPS ${REMOTE_HOST}" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Quickstart (first deploy on a fresh server):" -ForegroundColor Yellow
        Write-Host "  1. Copy-Item docker\.env.prod.example .env.prod"
        Write-Host "  2. Edit .env.prod — strong secrets + real domains."
        Write-Host "  3. .\scripts\deploy.ps1 setup-host    # installs host Caddy"
        Write-Host "  4. .\scripts\deploy.ps1 env-push      # ships .env.prod via scp (mode 600)"
        Write-Host "  5. .\scripts\deploy.ps1 deploy        # rsync + build + up"
        Write-Host "  6. .\scripts\deploy.ps1 migrate       # one-shot prisma migrate deploy"
        Write-Host ""
        Write-Host "Day-to-day:" -ForegroundColor Yellow
        Write-Host "  .\scripts\deploy.ps1 deploy           # sync changes + rebuild + restart"
        Write-Host "  .\scripts\deploy.ps1 logs [service]   # tail logs (api/web/realtime/worker/mysql/redis)"
        Write-Host "  .\scripts\deploy.ps1 ps               # container status"
        Write-Host "  .\scripts\deploy.ps1 status           # ports + disk + RAM snapshot"
        Write-Host "  .\scripts\deploy.ps1 shell api        # interactive shell in a container"
        Write-Host "  .\scripts\deploy.ps1 down             # stop (data preserved)"
    }
}
