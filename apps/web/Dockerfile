# Aetheria — apps/web Dockerfile.
#
# Multi-stage build over the pnpm monorepo. Build context = repo root.
#
#   docker build -f apps/web/Dockerfile -t aetheria-web .
#
# Relies on `output: "standalone"` in apps/web/next.config.mjs — Next emits
# .next/standalone with a self-contained server.js + only the npm packages
# it actually imports, so the runtime image stays small (~150 MB).

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

# Install all workspace deps (cached on lockfile).
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json                   ./apps/api/
COPY apps/web/package.json                   ./apps/web/
COPY apps/realtime/package.json              ./apps/realtime/
COPY apps/worker/package.json                ./apps/worker/
COPY packages/core/package.json              ./packages/core/
COPY packages/config/package.json            ./packages/config/
COPY packages/game-assets/package.json       ./packages/game-assets/
COPY packages/schema-api/package.json        ./packages/schema-api/
COPY packages/schema-db/package.json         ./packages/schema-db/
COPY packages/shared-types/package.json      ./packages/shared-types/
COPY packages/domain-account/package.json    ./packages/domain-account/
COPY packages/domain-admin/package.json      ./packages/domain-admin/
COPY packages/domain-auth/package.json       ./packages/domain-auth/
COPY packages/domain-battlepass/package.json ./packages/domain-battlepass/
COPY packages/domain-combat/package.json     ./packages/domain-combat/
COPY packages/domain-combat-runtime/package.json ./packages/domain-combat-runtime/
COPY packages/domain-economy/package.json    ./packages/domain-economy/
COPY packages/domain-events/package.json     ./packages/domain-events/
COPY packages/domain-inventory/package.json  ./packages/domain-inventory/
COPY packages/domain-notifications/package.json ./packages/domain-notifications/
COPY packages/domain-progression/package.json ./packages/domain-progression/
COPY packages/domain-pvp/package.json        ./packages/domain-pvp/
COPY packages/domain-quests/package.json     ./packages/domain-quests/
COPY packages/domain-roster/package.json     ./packages/domain-roster/
COPY packages/domain-save/package.json       ./packages/domain-save/
COPY packages/domain-shop/package.json       ./packages/domain-shop/
COPY packages/domain-social/package.json     ./packages/domain-social/
COPY packages/domain-telemetry/package.json  ./packages/domain-telemetry/
COPY packages/domain-world/package.json      ./packages/domain-world/
COPY packages/progression-runtime/package.json ./packages/progression-runtime/
# See note in apps/api/Dockerfile re: --no-frozen-lockfile.
RUN pnpm install --no-frozen-lockfile --prefer-offline

FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
# Web depends on @aetheria/api type-only (for AppRouter) and several
# workspace packages — generate Prisma so the type chain resolves.
RUN pnpm --filter @aetheria/schema-db generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @aetheria/web build

# ─────────────────────────────────────────────────────────────────────────
# Runtime — Next standalone output. server.js sits in .next/standalone and
# imports everything it needs out of that folder; static + public are
# copied alongside.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
USER node
# Standalone layout: apps/web/.next/standalone holds server.js + node_modules.
# `.next/static` and `public` are copied into the same relative locations
# that the standalone server.js expects.
COPY --chown=node:node --from=build /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
