// Aetheria — Fastify server factory. Entry point in src/index.ts calls
// buildServer() then `.listen()`. Tests import buildServer() directly so
// they can drive the app via inject() without binding a port.

import { randomUUID } from "node:crypto";

import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";

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
  const appRouter = createAppRouter({ authService: auth.service });

  app.addHook("onClose", async () => {
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
