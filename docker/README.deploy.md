# Aetheria — production deployment (VPS `77.42.35.9`)

End-to-end deploy from a Windows PowerShell on your local PC to the
shared VPS that also hosts PrivateDatingLevel.

## Topology

The server hosts two products. Each runs as an isolated `docker compose`
project, behind a single host-level Caddy reverse proxy that terminates
TLS and routes per-domain.

```
Internet
  │
  ▼
HOST :80, :443  ────────  Caddy (installed on host, NOT in container)
                              │
              ┌───────────────┼───────────────────────────────┐
              ▼               ▼                               ▼
   privatedatinglevelup     aetheria.games-core.com       aetheria-api
   .allin1site.com                                        + aetheria-ws
              │               │                               │
              ▼               ▼                               ▼
       127.0.0.1:18080   127.0.0.1:18100               127.0.0.1:18101 / :18102
       (pld-prod nginx)  (aetheria web)                (aetheria api / realtime)
              │               │                               │
              ▼               ▼                               ▼
        docker net          ┌─────────────────────────────────┐
        pld-internal        │ docker net  aetheria-internal   │
                            │  ├─ aetheria_web                │
                            │  ├─ aetheria_api                │
                            │  ├─ aetheria_realtime           │
                            │  ├─ aetheria_worker             │
                            │  ├─ aetheria_mysql  (internal)  │
                            │  └─ aetheria_redis  (internal)  │
                            └─────────────────────────────────┘
```

### Isolation invariants

| Concern        | PrivateDatingLevel       | Aetheria                  |
|----------------|--------------------------|---------------------------|
| Compose project | `pld-prod`              | `aetheria-prod`           |
| Docker network  | `pld-internal`          | `aetheria-internal`       |
| Source dir      | `/opt/apps/pld/src`     | `/opt/apps/aetheria/src`  |
| Data volumes    | `/var/data/pld/*`       | `/var/data/aetheria/*`    |
| Host port       | `127.0.0.1:18080`       | `127.0.0.1:18100/01/02`   |
| MySQL access    | self-contained          | self-contained (no host port) |
| Redis access    | self-contained          | self-contained (no host port) |

Neither stack speaks to the other. Caddy is the only place where they
share a piece of host state — and only because both want Let's Encrypt
certs and you can't run two services on `:80/:443`.

## First-time deploy (run once per server)

```powershell
# 1. Local prep
Copy-Item docker\.env.prod.example .env.prod
notepad .env.prod
#    - replace every change-me-* placeholder
#    - openssl rand -base64 48  for JWT_SECRET and JWT_REFRESH_SECRET
#    - openssl rand -base64 32  for NEXTAUTH_SECRET
#    - confirm the domain URLs match aetheria.games-core.com + subdomains

# 2. DNS — point all three records at the VPS public IP (77.42.35.9):
#    NOTE: Use dash naming — CF Free plan only supports 1-level wildcard.
#      aetheria.games-core.com         A 77.42.35.9
#      aetheria-api.games-core.com     A 77.42.35.9
#      aetheria-ws.games-core.com      A 77.42.35.9
#    Wait for propagation (TTL minutes). Without this, Let's Encrypt fails.

# 3. Install host Caddy on the server (covers BOTH Aetheria + PLD).
.\scripts\deploy.ps1 setup-host

# 4. Upload your local .env.prod to the server (mode 600).
.\scripts\deploy.ps1 env-push

# 5. First deploy: rsync source, build images on the server, start the stack.
.\scripts\deploy.ps1 deploy

# 6. Apply the MySQL schema (one-shot prisma migrate deploy).
.\scripts\deploy.ps1 migrate

# 7. Smoke test — open in a browser:
#      https://aetheria.games-core.com
#      https://aetheria-api.games-core.com/health
#      https://aetheria-ws.games-core.com/healthz
```

## Day-to-day

```powershell
.\scripts\deploy.ps1 deploy           # rsync + rebuild + up
.\scripts\deploy.ps1 logs api         # tail one service
.\scripts\deploy.ps1 logs             # tail every service
.\scripts\deploy.ps1 ps               # container status
.\scripts\deploy.ps1 status           # ports + containers + disk + RAM
.\scripts\deploy.ps1 shell api        # interactive shell
.\scripts\deploy.ps1 down             # stop containers (data kept)
```

## Resource budget (for awareness)

The VPS is 4 GB RAM. Per-service caps in `docker-compose.prod.yml`:

| service          | cpus | memory |
|------------------|------|--------|
| aetheria_mysql   | 1.0  | 1 GB   |
| aetheria_api     | 1.0  | 512 MB |
| aetheria_web     | 1.0  | 512 MB |
| aetheria_realtime| 0.5  | 384 MB |
| aetheria_worker  | 0.3  | 256 MB |
| aetheria_redis   | 0.3  | 320 MB |
| **total**        | **~4** | **~3 GB** |

PLD claims roughly 1 GB on its side (each Go service capped at 256 MB).
Headroom is tight — monitor with `free -h` after first boot. If memory
pressure shows up, bump VPS plan or trim aetheria_api/web caps.

## Operating safely alongside PrivateDatingLevel

- **Never** edit `/opt/apps/pld/*`. That tree belongs to PLD.
- **Never** mount `/var/data/pld/*`. Aetheria's volumes live in
  `/var/data/aetheria/*`.
- The host Caddyfile lists routes for BOTH products. If PLD's port ever
  changes, update the upstream in `docker/host/Caddyfile` and re-run
  `.\scripts\deploy.ps1 setup-host` to push + reload.
- `docker system prune` on the host would delete dangling images / unused
  networks from **both** products. Prefer `docker compose -p aetheria-prod
  build --no-cache` to rebuild without touching PLD artefacts.
- A reboot brings both stacks back up automatically (`restart:
  unless-stopped`).

## Rolling back

```powershell
# Roll back the running images to the previous git revision:
git checkout <previous-sha>
.\scripts\deploy.ps1 deploy

# Or stop everything entirely (data preserved):
.\scripts\deploy.ps1 down
```

To destroy data (rare — irreversible), SSH in and:
```bash
docker compose -p aetheria-prod -f /opt/apps/aetheria/src/docker-compose.prod.yml down
rm -rf /var/data/aetheria
```

## Troubleshooting

**Caddy says `connection refused` when hitting the domain**
The app container is still starting. Check `.\scripts\deploy.ps1 logs`.

**Let's Encrypt fails with `unauthorized` / DNS lookup error**
DNS doesn't resolve yet. `nslookup aetheria.games-core.com 1.1.1.1` from
your laptop should return `77.42.35.9`. If it doesn't, wait or fix DNS.

**`docker compose build` runs out of memory**
The VPS has 3.7 GB usable. Building all 4 images in parallel is tight.
`.\scripts\deploy.ps1 build api` then `build web`, etc. — one at a time.

**Port already in use**
Run `.\scripts\deploy.ps1 status` and check the port list. If something
unexpected holds `:18100-18102`, identify it via the `ss` output and stop
it before re-running `deploy`.

**Need to inspect MySQL data**
`.\scripts\deploy.ps1 shell mysql` then `mysql -u root -p`. The root
password is whatever you set in `.env.prod`.
