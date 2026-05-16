// Aetheria — tRPC React client. Used in client components via hooks like
// `trpc.health.ping.useQuery()`. The Provider is wired in app/providers.tsx.
//
// NOTE — `@aetheria/core` is listed as a direct dependency of `apps/web` in
// package.json even though no value is imported here. AppRouter's inferred
// type chain transitively references core types (CacheMetrics, CatalogMetrics
// from item-cache / catalog-cache). Without core as a top-level node_modules
// entry, tsc would reach those types only via a pnpm symlink path like
// `node_modules/@aetheria/domain-auth/node_modules/@aetheria/core/...`, which
// it refuses to emit ("not portable") and bails on the build.

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@aetheria/api/router";

export const trpc = createTRPCReact<AppRouter>();
