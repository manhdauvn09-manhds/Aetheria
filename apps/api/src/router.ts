// Aetheria — composed root tRPC router.
//
// `apps/api` owns the composition because it's the only layer with all the
// concrete dependencies (DB clients, refresh-token store, JWT secrets).
// Sub-routers come from domain packages — each one is a factory that closes
// over its service instance, so context wiring stays thin.

import { router } from "@aetheria/schema-api/trpc";
import { healthRouter } from "@aetheria/schema-api";
import { createAuthRouter, type AuthService } from "@aetheria/domain-auth";

export interface AppDeps {
  readonly authService: AuthService;
}

export const createAppRouter = (deps: AppDeps) =>
  router({
    health: healthRouter,
    auth: createAuthRouter(deps.authService),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
