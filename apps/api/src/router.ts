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
import {
  createRosterRouter,
  createSkillsRouter,
  type RosterService,
} from "@aetheria/domain-roster";
import {
  createInventoryRouter,
  type InventoryService,
} from "@aetheria/domain-inventory";
import {
  createQuestsRouter,
  type QuestService,
} from "@aetheria/domain-quests";
import {
  createBattlePassRouter,
  type BattlePassService,
} from "@aetheria/domain-battlepass";
import {
  createPvpRouter,
  type LeaderboardService,
  type MmrService,
  type PvpMatchmakingService,
  type PvpMatchService,
} from "@aetheria/domain-pvp";
import {
  createShopRouter,
  type ShopService,
} from "@aetheria/domain-shop";
import {
  createChatRouter,
  createFriendsRouter,
  createGuildRouter,
  type ChatService,
  type FriendsService,
  type GuildService,
} from "@aetheria/domain-social";

export interface AppDeps {
  readonly authService: AuthService;
  readonly accountService: AccountService;
  readonly worldService: WorldService;
  readonly saveService: SaveService;
  readonly syncService: SyncService;
  readonly combatService: CombatRunService;
  readonly rosterService: RosterService;
  readonly inventoryService: InventoryService;
  readonly questService: QuestService;
  readonly battlePassService: BattlePassService;
  readonly guildService: GuildService;
  readonly friendsService: FriendsService;
  readonly chatService: ChatService;
  readonly pvpService: PvpMatchmakingService;
  readonly pvpMatchService: PvpMatchService;
  readonly mmrService: MmrService;
  readonly lbService: LeaderboardService;
  readonly shopService: ShopService;
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
    roster: createRosterRouter(deps.rosterService),
    skills: createSkillsRouter(deps.rosterService),
    inventory: createInventoryRouter(deps.inventoryService),
    quests: createQuestsRouter(deps.questService),
    battlepass: createBattlePassRouter(deps.battlePassService),
    guild: createGuildRouter(deps.guildService),
    friends: createFriendsRouter(deps.friendsService),
    chat: createChatRouter(deps.chatService),
    pvp: createPvpRouter(deps.pvpService, deps.pvpMatchService, deps.mmrService, deps.lbService),
    shop: createShopRouter(deps.shopService),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
