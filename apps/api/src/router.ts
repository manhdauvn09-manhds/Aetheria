// Aetheria — composed root tRPC router.
//
// `apps/api` owns the composition because it's the only layer with all the
// concrete dependencies (DB clients, refresh-token store, JWT secrets).
// Sub-routers come from domain packages — each one is a factory that closes
// over its service instance, so context wiring stays thin.

import { router } from "@aetheria/schema-api/trpc";
import { healthRouter } from "@aetheria/schema-api";
import { createAuthRouter, type AuthService } from "@aetheria/domain-auth";
import {
  createAccountRouter,
  type AccountService,
} from "@aetheria/domain-account";
import {
  createWorldRouter,
  type WorldService,
} from "@aetheria/domain-world";
import {
  createSaveRouter,
  type SaveService,
} from "@aetheria/domain-save";
import {
  createSyncRouter,
  type SyncService,
} from "@aetheria/domain-sync";
import {
  createCombatRouter,
  type CombatRunService,
} from "@aetheria/domain-combat-runtime";

export interface AppDeps {
  readonly authService: AuthService;
  readonly accountService: AccountService;
  readonly worldService: WorldService;
  readonly saveService: SaveService;
  readonly syncService: SyncService;
  readonly combatService: CombatRunService;
}

export const createAppRouter = (deps: AppDeps) =>
  router({
    health: healthRouter,
    auth: createAuthRouter(deps.authService),
    account: createAccountRouter(deps.accountService),
    world: createWorldRouter(deps.worldService),
    save: createSaveRouter(deps.saveService),
    sync: createSyncRouter(deps.syncService),
    combat: createCombatRouter(deps.combatService),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
