# Aetheria — Docker workflow

Full stack runs in one `docker compose` command:

- **mysql** — MySQL 8 master (persistent volume)
- **redis** — Redis 7 (cache + pubsub + queue)
- **api** — Fastify + tRPC HTTP API
- **web** — Next.js 15 (standalone build)
- **realtime** — Socket.IO gateway
- **worker** — cron job runner
- **caddy** — reverse proxy + auto-HTTPS

## Local dev (Windows + PowerShell)

```powershell
# 1. Copy + edit the env template at the repo root.
Copy-Item docker\.env.example .env.docker
# Open .env.docker and:
#   - replace every change-me-* placeholder with strong values
#   - generate JWT_SECRET / JWT_REFRESH_SECRET via `openssl rand -base64 48`
#   - generate NEXTAUTH_SECRET via `openssl rand -base64 32`

# 2. Bring up the stack.
.\docker\build.ps1 up

# 3. Run the DB migrations the very first time (idempotent on re-runs).
.\docker\build.ps1 migrate

# 4. Open the app.
#    http://aetheria.localhost              → web
#    http://api.aetheria.localhost/health   → api liveness probe
#    http://ws.aetheria.localhost/healthz   → realtime liveness probe
```

`*.localhost` is auto-routed to `127.0.0.1` by every modern browser and by
Windows itself, so no hosts-file edit is needed.

### Common commands

```powershell
.\docker\build.ps1 ps                # status
.\docker\build.ps1 logs              # tail all services
.\docker\build.ps1 logs api          # tail one service
.\docker\build.ps1 build api         # rebuild just one service
.\docker\build.ps1 shell api         # open a shell inside the api container
.\docker\build.ps1 down              # stop containers, keep volumes
.\docker\build.ps1 reset             # NUCLEAR — drop containers + volumes
```

## Production deploy

The same `docker-compose.yml` runs on a VPS — only env values change.

1. Point DNS (NOTE: Use dash naming — CF Free wildcard supports 1 level only):
   - `aetheria.games-core.com` → VPS public IP
   - `aetheria-api.games-core.com` → same IP
   - `aetheria-ws.games-core.com` → same IP

2. On the VPS, copy `docker/.env.example` to `.env.docker` and **uncomment
   the production block at the bottom** (HTTPS URLs + `CADDY_AUTO_HTTPS=on`).

3. Open ports 80 + 443 to the public internet (Let's Encrypt needs both
   for the HTTP-01 challenge).

4. `docker compose --env-file .env.docker up -d --build` — Caddy will
   provision certificates automatically on first request to each subdomain.

5. Run migrations once after first boot:
   `docker compose run --rm api npx prisma migrate deploy --schema=node_modules/@aetheria/schema-db/prisma/mysql/schema.prisma`

### Production hardening

- Comment out the `ports:` block on `mysql` and `redis` so they only
  speak on the internal docker network.
- Set `ENFORCE_CLOUDFLARE=true` if you front the stack with Cloudflare.
- Mount a host-side log driver (json-file with rotation, or shipping to
  an external collector) — the default driver fills disk over time.

## Two-system co-tenancy (Aetheria + PrivateDatingLevel)

If the same VPS hosts both products, run each project's compose stack on
its own bridge network and front everything with a single shared Caddy
container (drop the `caddy` service from one of the compose files and
point both products' Caddyfiles at the shared instance). Both projects
already use distinct subdomains so there's no port or certificate clash:

- `aetheria.games-core.com`
- `privatedatinglevelup.allin1site.com`

## Image sizes (after `--build`)

| service   | runtime image | notes                                                |
|-----------|---------------|------------------------------------------------------|
| api       | ~180 MB       | node:22-alpine + prisma client + compiled JS         |
| web       | ~160 MB       | Next.js standalone server                            |
| realtime  | ~140 MB       | node:22-alpine + socket.io                           |
| worker    | ~170 MB       | node:22-alpine + prisma client                       |
| mysql     | ~600 MB       | upstream mysql:8.0                                   |
| redis     | ~40 MB        | redis:7-alpine                                       |
| caddy     | ~50 MB        | caddy:2-alpine                                       |

## Troubleshooting

**`pnpm install` fails inside the api Dockerfile** — usually a corrupt
`pnpm-lock.yaml` after a workspace edit. Regenerate locally with
`pnpm install --no-frozen-lockfile`, commit, retry.

**`Permission to .git denied` on push** — unrelated to docker; see
`docker/README.md` history for the GCM/store helper precedence fix.

**Caddy logs `connection refused` on first start** — the upstream service
(api/web/realtime) is still booting. Caddy retries automatically; the
warnings clear within ~30 seconds.

**MySQL container exits with `Access denied for user 'aetheria_app'`** —
you changed `MYSQL_PASSWORD` after the volume was initialised. MySQL only
reads `MYSQL_*` env vars on first start; either rotate the password from
inside MySQL or run `.\docker\build.ps1 reset` to drop the volume and
re-bootstrap. The reset is destructive — all data is lost.
