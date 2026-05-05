// Aetheria — realtime gateway boot.
//
// Stands up an HTTP server (for /healthz + /sticky-cookie helpers) and
// attaches a Socket.IO server. When REDIS_URL is set, the Redis adapter
// is wired so chat fan-out (4.41) reaches every instance behind the LB.

import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import pino, { type Logger } from "pino";
import { Server as IoServer } from "socket.io";

import { buildAuthMiddleware } from "./auth.js";
import type { Env } from "./env.js";
import { shardForUser, STICKY_COOKIE_NAME } from "./sticky.js";

export interface RealtimeBundle {
  readonly http: HttpServer;
  readonly io: IoServer;
  readonly log: Logger;
  readonly close: () => Promise<void>;
}

const buildLogger = (env: Env): Logger =>
  pino(
    env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty" }, level: "debug" }
      : { level: "info" },
  );

const buildHttpHandler = (env: Env, log: Logger) =>
  (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url ?? "/";
    if (url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
      return;
    }
    if (url.startsWith("/sticky-cookie")) {
      const u = new URL(url, "http://localhost").searchParams.get("u");
      if (!u) {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("missing ?u=<userId>");
        return;
      }
      const shard = shardForUser(u, env.REALTIME_INSTANCES);
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": `${STICKY_COOKIE_NAME}=${shard.toString()}; Path=/; HttpOnly; SameSite=Lax`,
      });
      res.end(JSON.stringify({ shard, instances: env.REALTIME_INSTANCES }));
      return;
    }
    log.debug({ url }, "unhandled http request");
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  };

export const buildRealtime = (env: Env): RealtimeBundle => {
  const log = buildLogger(env);
  const http = createServer(buildHttpHandler(env, log));

  const io = new IoServer(http, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    serveClient: false,
    transports: ["websocket", "polling"],
  });

  let pubClient: Redis | null = null;
  let subClient: Redis | null = null;
  if (env.REDIS_URL) {
    pubClient = new Redis(env.REDIS_URL);
    subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    log.info("redis adapter attached");
  } else {
    log.warn("REDIS_URL not set — running single-instance (no cross-process pub/sub)");
  }

  io.use(
    buildAuthMiddleware({
      secret: env.JWT_SECRET,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }),
  );

  io.on("connection", (socket) => {
    const userId = socket.auth?.userId ?? "?";
    void socket.join(`user:${userId}`);
    log.debug({ userId, socketId: socket.id }, "socket connected");
    socket.on("disconnect", (reason) => {
      log.debug({ userId, socketId: socket.id, reason }, "socket disconnected");
    });
  });

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      void io.close(() => {
        resolve();
      });
    });
    if (pubClient) await pubClient.quit();
    if (subClient) await subClient.quit();
    await new Promise<void>((resolve) => {
      http.close(() => {
        resolve();
      });
    });
  };

  return { http, io, log, close };
};
