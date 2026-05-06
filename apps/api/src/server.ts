// Aetheria — Fastify server factory. Entry point in src/index.ts calls
// buildServer() then `.listen()`. Tests import buildServer() directly so
// they can drive the app via inject() without binding a port.

import { randomUUID } from "node:crypto";

import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { Redis } from "ioredis";

import { AccountService } from "@aetheria/domain-account";
import { BattlePassService } from "@aetheria/domain-battlepass";
import { CombatRunService } from "@aetheria/domain-combat-runtime";
import { InventoryService } from "@aetheria/domain-inventory";
import {
  PvpMatchmakingService,
  PvpMatchService,
  redisMatchPublisher,
} from "@aetheria/domain-pvp";
import { QuestService } from "@aetheria/domain-quests";
import { RosterService } from "@aetheria/domain-roster";
import { SaveService } from "@aetheria/domain-save";
import {
  ChatService,
  FriendsService,
  GuildService,
  redisChatPublisher,
} from "@aetheria/domain-social";
import { SyncService } from "@aetheria/domain-sync";
import { WorldService } from "@aetheria/domain-world";
import { mysql } from "@aetheria/schema-db/mysql";

import { attachMatchEndConsumer } from "./pvp/matchEndConsumer.js";
import { noopRedis } from "./pvp/noopRedis.js";

import { buildAuth } from "./auth/build.js";
import { buildContextFactory } from "./context.js";
import type { Env } from "./env.js";
import { registerPlugins } from "./plugins.js";
import { createAppRouter, type AppRouter } from "./router.js";

export const buildServer = async (env: Env): Promise<FastifyInstance> => {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" }, level: "debug" }
        : { level: "info" },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
  });

  await registerPlugins(app, env);

  // Lightweight liveness probe — bypasses rate-limit (see plugins.ts allowList).
  app.get("/health", () => ({ ok: true as const, ts: Date.now() }));

  const createContext = buildContextFactory(env);
  const auth = buildAuth(env);
  // AccountService re-uses the MySQL client + the same RefreshTokenStore
  // as the auth bundle so deleteAccount can revoke active sessions.
  const accountService = new AccountService({
    mysql,
    refreshStore: auth.refreshStore,
  });
  const worldService = new WorldService({ mysql });
  const saveService = new SaveService();
  const syncService = new SyncService({ mysql });
  const combatService = new CombatRunService();
  const rosterService = new RosterService({ mysql });
  const inventoryService = new InventoryService({ mysql });
  const questService = new QuestService({ mysql });
  const battlePassService = new BattlePassService({ mysql });
  const guildService = new GuildService({ mysql });
  const friendsService = new FriendsService({ mysql });

  // Realtime fan-out is opt-in: when REDIS_URL is set, ChatService
  // publishes each accepted send to the bus that apps/realtime
  // subscribes to. Without Redis the writes are still durable but
  // clients only see them via the next history poll.
  const chatRedis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;
  const chatPublisher = chatRedis
    ? redisChatPublisher(chatRedis, { warn: (o, m): void => app.log.warn(o, m) })
    : undefined;
  const chatService = new ChatService({
    mysql,
    ...(chatPublisher ? { publisher: chatPublisher } : {}),
  });

  // PvP matchmaking: Redis-backed queue + matcher loop. Without
  // REDIS_URL we wire a no-op redis stub so the API still boots; the
  // queue endpoints will reply but no matches will be made.
  const pvpRedis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;
  const matchPublisher = pvpRedis
    ? redisMatchPublisher(pvpRedis, { warn: (o, m): void => app.log.warn(o, m) })
    : undefined;
  const matchService = new PvpMatchService({
    mysql,
    ...(matchPublisher ? { publisher: matchPublisher } : {}),
  });
  const pvpService = new PvpMatchmakingService({
    redis: pvpRedis ?? noopRedis,
    mysql,
    onMatch: (proposal): Promise<void> =>
      matchService.createFromProposal(proposal).then(
        () => undefined,
        (e: unknown) => {
          app.log.error({ err: e }, "pvp match creation failed");
        },
      ),
  });
  const stopPvp = pvpRedis ? pvpService.start() : (): void => undefined;
  // match-end subscriber: realtime publishes match results, api persists them.
  const matchEndSub = pvpRedis ? pvpRedis.duplicate() : null;
  const matchEndConsumer = matchEndSub
    ? attachMatchEndConsumer(matchEndSub, matchService, app.log)
    : null;
  // Wire bus subscriptions on boot; tear them down on close so the
  // singleton bus doesn't leak handlers across hot reloads.
  const questUnsubscribes = questService.start();
  const bpUnsubscribes = battlePassService.start();
  const appRouter = createAppRouter({
    authService: auth.service,
    accountService,
    worldService,
    saveService,
    syncService,
    combatService,
    rosterService,
    inventoryService,
    questService,
    battlePassService,
    guildService,
    friendsService,
    chatService,
    pvpService,
    pvpMatchService: matchService,
  });

  app.addHook("onClose", async () => {
    for (const off of questUnsubscribes) off();
    for (const off of bpUnsubscribes) off();
    stopPvp();
    if (matchEndConsumer) await matchEndConsumer.close();
    if (chatRedis) await chatRedis.quit();
    if (pvpRedis) await pvpRedis.quit();
    if (auth.redis) await auth.redis.quit();
  });

  await app.register(fastifyTRPCPlugin<AppRouter>, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }) => createContext(req),
      onError: ({ path, error }) => {
        app.log.warn({ path, code: error.code, msg: error.message }, "trpc error");
      },
    },
  });

  return app;
};
