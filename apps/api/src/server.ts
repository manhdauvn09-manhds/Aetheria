// Aetheria — Fastify server factory. Entry point in src/index.ts calls
// buildServer() then `.listen()`. Tests import buildServer() directly so
// they can drive the app via inject() without binding a port.

import { randomUUID } from "node:crypto";

import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { Redis } from "ioredis";

import { CLOUDFLARE_CIDRS, startSentry, startTracing } from "@aetheria/core";

import { AccountService } from "@aetheria/domain-account";
import { AdminService } from "@aetheria/domain-admin";
import { BattlePassService } from "@aetheria/domain-battlepass";
import { CombatRunService } from "@aetheria/domain-combat-runtime";
import { InventoryService } from "@aetheria/domain-inventory";
import { NotificationsService } from "@aetheria/domain-notifications";
import {
  LeaderboardService,
  MmrService,
  PvpMatchmakingService,
  PvpMatchService,
  redisMatchPublisher,
} from "@aetheria/domain-pvp";
import { QuestService } from "@aetheria/domain-quests";
import { RosterService } from "@aetheria/domain-roster";
import { SaveService } from "@aetheria/domain-save";
import { ShopService } from "@aetheria/domain-shop";
import {
  ChatService,
  FriendsService,
  GuildService,
  redisChatPublisher,
} from "@aetheria/domain-social";
import { SyncService } from "@aetheria/domain-sync";
import { TelemetryService } from "@aetheria/domain-telemetry";
import { WorldService } from "@aetheria/domain-world";
import { disconnectMysql, mysql } from "@aetheria/schema-db/mysql";

import { attachMatchEndConsumer } from "./pvp/matchEndConsumer.js";
import { noopRedis } from "./pvp/noopRedis.js";

import { buildAuth } from "./auth/build.js";
import { buildContextFactory } from "./context.js";
import type { Env } from "./env.js";
import { registerPlugins } from "./plugins.js";
import { createAppRouter, type AppRouter } from "./router.js";

export const buildServer = async (env: Env): Promise<FastifyInstance> => {
  startTracing({
    serviceName: "aetheria-api",
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
  startSentry({ dsn: process.env.SENTRY_DSN, environment: env.NODE_ENV });

  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" }, level: "debug" }
        : { level: "info" },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    // Trust XFF only from Cloudflare in production; in dev/test trust the
    // local proxy chain so `curl -H 'x-forwarded-for: …'` from localhost
    // still works for debugging. Never `trustProxy: true` blanket — it lets
    // any caller spoof their source IP and bypass per-IP rate limits.
    trustProxy: env.ENFORCE_CLOUDFLARE ? Array.from(CLOUDFLARE_CIDRS) : "loopback",
    bodyLimit: 1_048_576, // 1 MiB
    requestTimeout: 30_000, // 30s (DoS protection, matches DB query timeout)
  });

  // Single shared Redis client for *commands* (publish, ZADD/ZREM, SET,
  // refresh-token store, oneshot token store, auth rate-limit bucket). A
  // second client is duplicated below for SUBSCRIBE — ioredis requires the
  // sub mode on its own connection. That's 2 redis connections per api
  // process, down from 4 (audit finding #4).
  const sharedRedis = env.REDIS_URL
    ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 })
    : null;

  // Build auth before registerPlugins so the auth-route rate limiter can
  // share the same Redis client (cluster-safe bucket).
  const auth = buildAuth(env, sharedRedis);
  await registerPlugins(app, env, { redis: sharedRedis });

  // Lightweight liveness probe — bypasses rate-limit (see plugins.ts allowList).
  app.get("/health", () => ({ ok: true as const, ts: Date.now() }));

  // Global error handler. tRPC has its own onError below (sanitizes its own
  // responses), but any non-tRPC route or pre-tRPC hook that throws would
  // otherwise hit Fastify's default error response — which echoes the raw
  // `error.message` and (in dev) the stack. Centralize the shape:
  //   - log full structured error server-side
  //   - return a stable `{ error: { code, message } }` envelope
  //   - mask internal messages outside dev so we don't leak filesystem paths,
  //     SQL fragments, or third-party stack traces to attackers probing for
  //     fingerprints.
  app.setErrorHandler((err, req, reply) => {
    const status = typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
    app.log.error(
      {
        err,
        path: req.url,
        method: req.method,
        reqId: req.id,
        status,
      },
      "unhandled error",
    );
    const isClientError = status >= 400 && status < 500;
    const safeMessage =
      env.NODE_ENV === "development" || isClientError
        ? err.message
        : "Internal server error";
    reply.code(status).send({
      error: {
        code: err.code ?? (isClientError ? "BAD_REQUEST" : "INTERNAL_ERROR"),
        message: safeMessage,
      },
    });
  });

  const createContext = buildContextFactory(env);
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
  const inventoryService = new InventoryService({ mysql, redis: sharedRedis });
  const questService = new QuestService({ mysql });
  const battlePassService = new BattlePassService({ mysql });
  const guildService = new GuildService({ mysql });
  const friendsService = new FriendsService({ mysql });
  const shopService = new ShopService({ mysql, redis: sharedRedis });
  const notificationsService = new NotificationsService({ mysql });
  const adminService = new AdminService({ mysql, redis: sharedRedis });
  const telemetryService = new TelemetryService();

  // Realtime fan-out is opt-in: when REDIS_URL is set, ChatService
  // publishes each accepted send to the bus that apps/realtime
  // subscribes to. Without Redis the writes are still durable but
  // clients only see them via the next history poll.
  const chatPublisher = sharedRedis
    ? redisChatPublisher(sharedRedis, { warn: (o, m): void => app.log.warn(o, m) })
    : undefined;
  const chatService = new ChatService({
    mysql,
    ...(chatPublisher ? { publisher: chatPublisher } : {}),
  });

  // PvP matchmaking: Redis-backed queue + matcher loop. Without
  // REDIS_URL we wire a no-op redis stub so the API still boots; the
  // queue endpoints will reply but no matches will be made.
  const matchPublisher = sharedRedis
    ? redisMatchPublisher(sharedRedis, { warn: (o, m): void => app.log.warn(o, m) })
    : undefined;
  const lbService = new LeaderboardService({
    redis: sharedRedis ?? noopRedis,
    seasonId: env.PVP_SEASON_ID,
  });
  const mmrService = new MmrService({ mysql, leaderboard: lbService });
  const matchService = new PvpMatchService({
    mysql,
    mmrService,
    ...(matchPublisher ? { publisher: matchPublisher } : {}),
  });
  const pvpService = new PvpMatchmakingService({
    redis: sharedRedis ?? noopRedis,
    mysql,
    onMatch: (proposal): Promise<void> =>
      matchService.createFromProposal(proposal).then(
        () => undefined,
        (e: unknown) => {
          app.log.error({ err: e }, "pvp match creation failed");
        },
      ),
  });
  const stopPvp = sharedRedis ? pvpService.start() : (): void => undefined;
  // match-end subscriber: realtime publishes match results, api persists them.
  // Subscriber must be on its own connection — ioredis blocks commands on a
  // client that has entered subscribe mode.
  const matchEndSub = sharedRedis ? sharedRedis.duplicate() : null;
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
    mmrService,
    lbService,
    shopService,
    notificationsService,
    adminService,
    telemetryService,
  });

  // Monitor connection health every 60s.
  //
  // NOTE — we read Prisma internals (`mysql._engine.client.connection.pool`)
  // because the public client doesn't expose pool stats unless `metrics` is
  // enabled as a previewFeature in schema.prisma (a bigger change that
  // regenerates the client). Optional chaining keeps us crash-safe, but the
  // shape can drift when Prisma upgrades — at which point we'd silently log
  // "unknown" forever. Raise a single boot-time warning when the internals
  // aren't accessible so operators know the metric is dead and can either
  // (a) enable Prisma's official $metrics, or (b) update the access path.
  let internalsAvailable: boolean | null = null;
  const metricsInterval = setInterval(() => {
    try {
      const pool = mysql._engine?.client?.connection?.pool;
      const poolSize = pool?.size ?? "unknown";
      const poolMax = pool?.max ?? "unknown";
      const poolAvailable = pool?.available?.length ?? "unknown";
      const poolQueued = pool?.waitQueue?.length ?? 0;
      // First successful tick decides whether the internals path resolves at
      // all. If it doesn't, warn once (instead of silently shipping "unknown"
      // every 60s forever — the kind of metric drift that hides for months).
      if (internalsAvailable === null) {
        internalsAvailable = pool !== undefined;
        if (!internalsAvailable) {
          app.log.warn(
            "mysql pool stats unavailable — Prisma internals path likely changed " +
              "(mysql._engine.client.connection.pool). Enable `previewFeatures = [\"metrics\"]` " +
              "in schema.prisma to use $metrics, or update the access path in server.ts.",
          );
        }
      }
      const poolStatus = {
        timestamp: new Date().toISOString(),
        mysql_pool_size: poolSize,
        mysql_pool_max: poolMax,
        mysql_pool_available: poolAvailable,
        mysql_pool_queued: poolQueued,
        mysql_pool_utilization:
          typeof poolSize === "number" && typeof poolMax === "number"
            ? `${Math.round((poolSize / poolMax) * 100)}%`
            : "unknown",
        redis_connected: sharedRedis?.status === "ready",
      };
      app.log.info(poolStatus, "connection metrics");
      // Alert if pool queue is growing (indicates exhaustion risk)
      if (poolQueued > 2) {
        app.log.warn({ queued: poolQueued, size: poolSize }, "pool queue backlog");
      }
    } catch (err) {
      app.log.error({ err }, "metrics collection failed");
    }
  }, 60_000);

  app.addHook("onClose", async () => {
    clearInterval(metricsInterval);
    for (const off of questUnsubscribes) off();
    for (const off of bpUnsubscribes) off();
    stopPvp();
    // matchEndConsumer.close() quits its dedicated subscribe connection.
    if (matchEndConsumer) await matchEndConsumer.close();
    // Owned redis is only set when no shared client was passed in (e.g. a
    // future caller who builds auth in isolation). When a shared client is
    // used, the server owns it and quits it below.
    if (auth.ownedRedis) await auth.ownedRedis.quit();
    if (sharedRedis) await sharedRedis.quit();
    // Drain the MySQL pool so a graceful shutdown doesn't leave half-open
    // sockets queued in the OS until the platform yanks them.
    //
    // Cap the drain at 5s — if MySQL is unreachable (network partition during
    // deploy, paused container, etc.) `$disconnect()` can hang indefinitely
    // and leave the platform's SIGTERM-to-SIGKILL grace timer to clean up,
    // which loses the connection's "QUIT" cooperatively-closed signal and
    // shows up in MySQL logs as aborted connections. Time out and move on.
    const drainTimeout = new Promise<void>((resolve) =>
      setTimeout(() => {
        app.log.warn("mysql $disconnect timeout — moving on after 5s");
        resolve();
      }, 5_000),
    );
    await Promise.race([disconnectMysql(), drainTimeout]);
  });

  await app.register(fastifyTRPCPlugin<AppRouter>, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }) => createContext(req),
      onError: ({ path, error }) => {
        // Security: Log full error server-side for debugging, but tRPC's
        // response layer sanitizes detailed messages from client responses
        // to avoid leaking implementation details (see schema-api/trpc).
        app.log.warn(
          {
            path,
            code: error.code,
            msg: error.message,
            stack: env.NODE_ENV === "development" ? error.stack : undefined,
          },
          "trpc error",
        );
      },
    },
  });

  return app;
};
