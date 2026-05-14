# Aetheria — Docker workflow helper (PowerShell on Windows).
#
# Usage:
#   .\docker\build.ps1 up           # build + start everything
#   .\docker\build.ps1 down         # stop + remove containers (keeps volumes)
#   .\docker\build.ps1 build        # build all images only (no start)
#   .\docker\build.ps1 build api    # build just one service
#   .\docker\build.ps1 logs         # tail logs from all services
#   .\docker\build.ps1 logs api     # tail logs from one service
#   .\docker\build.ps1 ps           # status of all services
#   .\docker\build.ps1 reset        # DESTRUCTIVE: down + remove volumes
#   .\docker\build.ps1 migrate      # run prisma migrate deploy inside the api container
#
# Prerequisites:
#   - Docker Desktop running
#   - .env.docker present at repo root (copy from docker/.env.example)

param(
    [Parameter(Position = 0)]
    [ValidateSet("up", "down", "build", "logs", "ps", "reset", "migrate", "shell", "help")]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$Service = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$envFile = Join-Path $repoRoot ".env.docker"
if (-not (Test-Path $envFile) -and $Command -ne "help") {
    Write-Host "ERROR: .env.docker not found at $envFile" -ForegroundColor Red
    Write-Host "       Run: Copy-Item docker/.env.example .env.docker"  -ForegroundColor Yellow
    Write-Host "       Then edit the placeholders before re-running."   -ForegroundColor Yellow
    exit 1
}

$composeArgs = @("compose", "--env-file", $envFile)

switch ($Command) {
    "up" {
        Write-Host "Building images and starting the stack..." -ForegroundColor Cyan
        & docker @composeArgs up --build -d
        Write-Host ""
        Write-Host "Stack is up. Try:" -ForegroundColor Green
        Write-Host "  http://aetheria.localhost          (web)"     -ForegroundColor Green
        Write-Host "  http://api.aetheria.localhost/health (api)"   -ForegroundColor Green
        Write-Host "  http://ws.aetheria.localhost/healthz (realtime)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Logs:    .\docker\build.ps1 logs"               -ForegroundColor Yellow
        Write-Host "Stop:    .\docker\build.ps1 down"               -ForegroundColor Yellow
    }
    "down" {
        Write-Host "Stopping the stack (volumes kept)..." -ForegroundColor Cyan
        & docker @composeArgs down
    }
    "build" {
        if ($Service) {
            Write-Host "Building $Service..." -ForegroundColor Cyan
            & docker @composeArgs build $Service
        } else {
            Write-Host "Building all images..." -ForegroundColor Cyan
            & docker @composeArgs build
        }
    }
    "logs" {
        if ($Service) {
            & docker @composeArgs logs -f --tail=200 $Service
        } else {
            & docker @composeArgs logs -f --tail=100
        }
    }
    "ps" {
        & docker @composeArgs ps
    }
    "reset" {
        Write-Host "DESTRUCTIVE: this will remove containers AND volumes (mysql data, redis data, caddy certs)." -ForegroundColor Red
        $confirm = Read-Host "Type 'yes' to continue"
        if ($confirm -ne "yes") {
            Write-Host "Aborted." -ForegroundColor Yellow
            exit 0
        }
        & docker @composeArgs down -v
        Write-Host "Stack and volumes destroyed." -ForegroundColor Green
    }
    "migrate" {
        Write-Host "Running prisma migrate deploy inside the api container..." -ForegroundColor Cyan
        # `prisma migrate deploy` doesn't ship in the runtime image (devDep).
        # Easiest path: invoke it from the build stage via a one-shot run.
        & docker @composeArgs run --rm --no-deps `
            --entrypoint "/bin/sh" `
            api -c "npx -y prisma@5.22.0 migrate deploy --schema=node_modules/@aetheria/schema-db/prisma/mysql/schema.prisma"
    }
    "shell" {
        if (-not $Service) {
            Write-Host "Specify a service: .\docker\build.ps1 shell api" -ForegroundColor Red
            exit 1
        }
        & docker @composeArgs exec $Service sh
    }
    default {
        Write-Host "Aetheria Docker helper" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Commands:" -ForegroundColor Yellow
        Write-Host "  up                 build + start the full stack (web, api, realtime, worker, mysql, redis, caddy)"
        Write-Host "  down               stop containers, keep volumes"
        Write-Host "  build [service]    rebuild images (one service or all)"
        Write-Host "  logs  [service]    tail logs (one service or all)"
        Write-Host "  ps                 show container status"
        Write-Host "  reset              DESTROY everything (containers + volumes) — prompts for confirmation"
        Write-Host "  migrate            run prisma migrate deploy against the running MySQL container"
        Write-Host "  shell <service>    open a shell inside a running container"
        Write-Host "  help               this message"
    }
}
