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
import { attachChatBus, type ChatBusSubscriber } from "./chatBus.js";
import type { Env } from "./env.js";
import { attachPvpMatches, type PvpMatchesRuntime } from "./pvpMatches.js";
import { channelRoom, type ChannelType } from "./rooms.js";
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
  let chatBusSub: Redis | null = null;
  let chatBus: ChatBusSubscriber | null = null;
  let pvpMatchSub: Redis | null = null;
  let pvpEndPub: Redis | null = null;
  let pvpMatches: PvpMatchesRuntime | null = null;
  if (env.REDIS_URL) {
    pubClient = new Redis(env.REDIS_URL);
    subClient = pubClient.duplicate();
    chatBusSub = pubClient.duplicate();
    pvpMatchSub = pubClient.duplicate();
    pvpEndPub = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    chatBus = attachChatBus(io, chatBusSub, log);
    pvpMatches = attachPvpMatches(io, pvpMatchSub, pvpEndPub, log);
    log.info("redis adapter + chat bus + pvp matches attached");
  } else {
    log.warn("REDIS_URL not set — running single-instance (no cross-process chat/pvp bus)");
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
    void socket.join("channel:global");
    log.debug({ userId, socketId: socket.id }, "socket connected");

    // Client-driven join/leave for guild + party rooms. Whisper rooms
    // are derived from `user:<id>` and never joined explicitly. Guild
    // membership is enforced upstream at api send-time; clients can
    // only join rooms they already know about.
    socket.on("chat:join", (payload: unknown) => {
      const room = parseRoomPayload(payload);
      if (!room) return;
      void socket.join(room);
    });
    socket.on("chat:leave", (payload: unknown) => {
      const room = parseRoomPayload(payload);
      if (!room) return;
      void socket.leave(room);
    });

    socket.on("disconnect", (reason) => {
      log.debug({ userId, socketId: socket.id, reason }, "socket disconnected");
    });
  });

  const close = async (): Promise<void> => {
    if (chatBus) await chatBus.close();
    if (pvpMatches) await pvpMatches.close();
    await new Promise<void>((resolve) => {
      void io.close(() => {
        resolve();
      });
    });
    if (pubClient) await pubClient.quit();
    if (subClient) await subClient.quit();
    if (pvpEndPub) await pvpEndPub.quit();
    chatBusSub = null; // already closed via chatBus.close()
    pvpMatchSub = null; // already closed via pvpMatches.close()
    await new Promise<void>((resolve) => {
      http.close(() => {
        resolve();
      });
    });
  };

  return { http, io, log, close };
};

const isChannelType = (s: unknown): s is ChannelType =>
  s === "global" || s === "guild" || s === "party" || s === "whisper";

const parseRoomPayload = (payload: unknown): string | null => {
  if (payload === null || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  if (!isChannelType(r.channelType)) return null;
  if (r.channelType === "global") return "channel:global";
  if (r.channelType === "whisper") return null; // never explicit-join
  if (typeof r.channelId !== "string" || !/^\d+$/.test(r.channelId)) return null;
  return channelRoom(r.channelType, r.channelId);
};
