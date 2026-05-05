// Aetheria — chat-bus subscriber.
//
// Subscribes to the Redis pub/sub channel `aetheria:chat:bus` (written
// to by `apps/api`'s ChatService) and re-broadcasts each message to the
// matching Socket.IO rooms. Messages are dropped silently on parse
// failure — operators see them in stderr via the logger.

import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { Server as IoServer } from "socket.io";

import { REDIS_CHAT_CHANNEL, type ChatBusMessage } from "@aetheria/domain-social/chat/publisher";

import { broadcastTargets, type ChannelType } from "./rooms.js";

const isChannelType = (s: unknown): s is ChannelType =>
  s === "global" || s === "guild" || s === "party" || s === "whisper";

const parseBusMessage = (raw: string): ChatBusMessage | null => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (
    typeof r.messageId !== "string" ||
    !isChannelType(r.channelType) ||
    !(r.channelId === null || typeof r.channelId === "string") ||
    typeof r.senderId !== "string" ||
    typeof r.content !== "string" ||
    typeof r.flagged !== "boolean" ||
    typeof r.createdAt !== "string"
  ) {
    return null;
  }
  return r as unknown as ChatBusMessage;
};

export interface ChatBusSubscriber {
  readonly close: () => Promise<void>;
}

/**
 * Wire a fresh Redis subscriber to fan messages into Socket.IO rooms.
 * Returns a `close()` that quits the subscriber connection.
 */
export const attachChatBus = (
  io: IoServer,
  subClient: Redis,
  log: Logger,
): ChatBusSubscriber => {
  void subClient.subscribe(REDIS_CHAT_CHANNEL).catch((e: unknown) => {
    log.error({ err: e }, "chat bus subscribe failed");
  });

  subClient.on("message", (channel, raw) => {
    if (channel !== REDIS_CHAT_CHANNEL) return;
    const msg = parseBusMessage(raw);
    if (!msg) {
      log.warn({ raw: raw.slice(0, 200) }, "dropped malformed chat bus message");
      return;
    }
    const rooms = broadcastTargets({
      channelType: msg.channelType,
      channelId: msg.channelId,
      senderId: msg.senderId,
    });
    if (rooms.length === 0) return;
    io.to([...rooms]).emit("chat:message", msg);
  });

  return {
    close: async (): Promise<void> => {
      try {
        await subClient.unsubscribe(REDIS_CHAT_CHANNEL);
      } catch (e) {
        log.warn({ err: e }, "chat bus unsubscribe failed");
      }
      await subClient.quit();
    },
  };
};
