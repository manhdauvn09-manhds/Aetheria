# Aetheria — apps/api Dockerfile.
#
# Multi-stage build over the pnpm monorepo. Build context = repo root, so
# the Dockerfile sees workspace metadata and every package it needs to
# resolve. Run from the root:
#
#   docker build -f apps/api/Dockerfile -t aetheria-api .
#
# Layers cache well as long as package.json / pnpm-lock.yaml don't change.

# ─────────────────────────────────────────────────────────────────────────
# Stage 1: base — pinned node + pnpm, glibc shim + openssl (Prisma needs)
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────
# Stage 2: deps — install all workspace deps (cached on lockfile)
# ─────────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
# Copy every package.json in the workspace so pnpm resolves the graph.
# We intentionally don't copy src yet — that maximises Docker layer cache
# hits when only source changes.
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
COPY packages/ui-kit/package.json            ./packages/ui-kit/
COPY packages/domain-account/package.json    ./packages/domain-account/
COPY packages/domain-admin/package.json      ./packages/domain-admin/
COPY packages/domain-auth/package.json       ./packages/domain-auth/
COPY packages/domain-battlepass/package.json ./packages/domain-battlepass/
COPY packages/domain-combat/package.json     ./packages/domain-combat/
COPY packages/domain-combat-runtime/package.json ./packages/domain-combat-runtime/
COPY packages/domain-economy/package.json    ./packages/domain-economy/
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
RUN pnpm install --frozen-lockfile --prefer-offline

# ─────────────────────────────────────────────────────────────────────────
# Stage 3: build — copy source, generate Prisma client, compile API
# ─────────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
# Prisma client must be generated against the MySQL schema before the API
# (which imports the generated client) can typecheck + compile.
RUN pnpm --filter @aetheria/schema-db generate
RUN pnpm --filter @aetheria/api build

# Deploy just the API + its transitive workspace deps into /deploy, giving
# us a minimal runtime tree that the next stage can copy wholesale.
RUN pnpm --filter @aetheria/api deploy --prod --legacy /deploy

# ─────────────────────────────────────────────────────────────────────────
# Stage 4: runtime — minimal alpine image, no source / dev deps / pnpm
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
# Drop privileges. The `node` user (uid 1000) ships in the base image.
USER node
COPY --chown=node:node --from=build /deploy/node_modules ./node_modules
COPY --chown=node:node --from=build /app/apps/api/dist ./dist
COPY --chown=node:node --from=build /app/apps/api/package.json ./package.json
EXPOSE 3000
# `tini` reaps zombies + forwards SIGTERM so the Fastify onClose hook fires
# cleanly on `docker stop`.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
