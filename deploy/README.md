# Aetheria — deployment manifests (dry-run)

These are scaffolds. The MVP has not been deployed end-to-end; the files
ship so ops can iterate without re-deriving the topology.

## Local stack

```sh
docker compose -f deploy/docker-compose.yml up -d   # mysql + redis
pnpm db:generate
pnpm db:migrate:mysql
pnpm dev                                            # api + realtime + web + worker
```

## Production targets

| Surface             | Where             | Manifest               | Notes                                                  |
| ------------------- | ----------------- | ---------------------- | ------------------------------------------------------ |
| `apps/web`          | Vercel            | `vercel.web.json`      | Next.js 15 standalone build                            |
| `apps/api`          | Fly.io            | `fly.api.toml`         | Health probe on `/health`                              |
| `apps/realtime`     | Fly.io (sticky LB) | `fly.realtime.toml`    | Sticky cookie via `/sticky-cookie?u=…`; uses Redis adapter |
| `apps/worker`       | Fly.io (no http)  | `fly.worker.toml`      | Singleton or sharded via `WORKER_JOBS` env             |
| MySQL 8 / Redis 7   | Managed (PlanetScale / Upstash) | n/a            | URLs injected as `DATABASE_URL_MYSQL` / `REDIS_URL`    |

## Environment matrix

`apps/api`: `DATABASE_URL_MYSQL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`,
`REDIS_URL` (optional but enables chat fan-out + pvp + lb), `PVP_SEASON_ID`,
`OTEL_EXPORTER_OTLP_ENDPOINT` (optional), `SENTRY_DSN` (optional).

`apps/realtime`: `JWT_SECRET`, `CORS_ORIGIN`, `REDIS_URL` (required for cross-instance fan-out).

`apps/worker`: `DATABASE_URL_MYSQL`, `REDIS_URL` (required for distributed lock), `WORKER_JOBS` (csv allowlist).

`apps/web`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_REALTIME_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
