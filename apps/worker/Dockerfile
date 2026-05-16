# Aetheria — apps/worker Dockerfile (cron job worker).
#
#   docker build -f apps/worker/Dockerfile -t aetheria-worker .

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

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
COPY apps/worker ./apps/worker
RUN pnpm --filter @aetheria/schema-db generate
RUN pnpm --filter @aetheria/worker build
RUN pnpm --filter @aetheria/worker deploy --prod /deploy

# Runtime — see apps/api/Dockerfile for the tsx rationale.
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl tini
RUN npm install -g tsx@4.19.2
WORKDIR /app
ENV NODE_ENV=production
USER node
COPY --chown=node:node --from=build /deploy/node_modules ./node_modules
COPY --chown=node:node --from=build /app/apps/worker/src ./src
COPY --chown=node:node --from=build /app/apps/worker/package.json ./package.json
COPY --chown=node:node --from=build /app/apps/worker/tsconfig.json ./tsconfig.json
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["tsx", "src/index.ts"]
