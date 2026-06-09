# Aetheria — Project Knowledge

> ⚠️ **GROUND TRUTH (2026-06-09)** — single source of truth. Mọi `.md`, `.html`,
> `scripts/*.ps1`, `docker/README.deploy.md`, `HANDOFF.md`, `DEVELOPER_GUIDE.html`
> còn nhắc `77.42.35.9`/`aetheria-9`/`62.238.28.106` là phế liệu (cả 2 server cũ
> đã xoá 2026-06-04).

> ⚠️ **CURRENT STATE**: Aetheria stack đang **STOP có chủ ý** trên mcp-80 để nhường
> RAM cho việc khác. Server_health sẽ báo `UNHEALTHY` / `NOT FOUND` — **đây không phải bug**.
> Khi cần bật lại: `docker compose -f docker-compose.prod.yml up -d` trong workDir.

## Where things live

| | |
|---|---|
| Server | **mcp-80** = `65.108.62.80` |
| workDir | `/opt/apps/aetheria/src` |
| Compose file | `docker-compose.prod.yml` |
| Branch | `master` (`gitPull: false`) |
| Containers | `aetheria_web` (9500), `aetheria_api` (9510), `aetheria_realtime` (9520), `aetheria_worker`, `aetheria_mysql` |
| Public | confirm subdomain qua host nginx vhost |
| API quirk | API enforces `CF-Connecting-IP` → `curl` trực tiếp `127.0.0.1:9510` trả 403; phải đi qua public domain Cloudflare. |

## Data

⚠️ **MySQL chạy nội bộ container `aetheria_mysql`**, bind `/var/data/aetheria/mysql`.
Volume đã copy từ server cũ ngày 2026-06-03 (bỏ `audit_log` ~15GB).
**KHÔNG đụng** `/var/data/aetheria/mysql` → mất data.

## Deploy (khi bật lại)

```
MCP `deploy` { server_id: "mcp-80", app_id: "aetheria-web" }      ← service "web"
MCP `deploy` { server_id: "mcp-80", app_id: "aetheria-api" }      ← service "api"
MCP `deploy` { server_id: "mcp-80", app_id: "aetheria-realtime" } ← service "realtime"
MCP `deploy` { server_id: "mcp-80", app_id: "aetheria-worker" }   ← service "worker"
```

`gitPull=false`. Push code qua MCP `write_file`.

## KHÔNG

- ❌ Chạy `scripts/deploy.ps1`, `scripts/install-origin-cert.ps1`, `scripts/enable-full-strict.ps1` — trỏ server cũ aetheria-9.
- ❌ Đụng volume `aetheria_mysql` bind path.
- ❌ Start container nginx riêng — host nginx (systemd) đang giữ port 80/443.

## Phế liệu — ignore
```
HANDOFF.md, DEVELOPER_GUIDE.html, docker/README.deploy.md
scripts/deploy.ps1, scripts/install-origin-cert.ps1, scripts/enable-full-strict.ps1
.claude/settings.local.json
```
