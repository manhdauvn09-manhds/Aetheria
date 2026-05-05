// Aetheria — chat realtime publisher contract.
//
// `ChatService` calls `publisher.publish(...)` after a message is durably
// persisted. The implementation is up to the host: in `apps/api`,
// `redisChatPublisher(redis)` writes to a Redis pub/sub channel that
// `apps/realtime` subscribes to. Tests can supply a no-op or in-memory
// fake.

import type { Redis } from "ioredis";

import type { ChatMessageRow } from "./types.js";

export const REDIS_CHAT_CHANNEL = "aetheria:chat:bus";

/** Wire-format pushed onto the realtime bus. BigInts are stringified. */
export interface ChatBusMessage {
  readonly messageId: string;
  readonly channelType: "global" | "guild" | "party" | "whisper";
  readonly channelId: string | null;
  readonly senderId: string;
  readonly content: string;
  readonly flagged: boolean;
  readonly createdAt: string;
}

export interface RealtimePublisher {
  publish: (msg: ChatBusMessage) => Promise<void>;
}

/** Convert a service-side row to the bus payload. */
export const toBusMessage = (row: ChatMessageRow): ChatBusMessage => ({
  messageId: row.messageId.toString(),
  channelType: row.channelType,
  channelId: row.channelId === null ? null : row.channelId.toString(),
  senderId: row.senderId.toString(),
  content: row.content,
  flagged: row.flagged,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Build a publisher backed by Redis pub/sub. Failures are swallowed
 * after being logged so realtime hiccups never break the durable
 * write path.
 */
export const redisChatPublisher = (
  redis: Redis,
  log?: { warn: (obj: unknown, msg?: string) => void },
): RealtimePublisher => ({
  publish: async (msg): Promise<void> => {
    try {
      await redis.publish(REDIS_CHAT_CHANNEL, JSON.stringify(msg));
    } catch (e) {
      log?.warn({ err: e, messageId: msg.messageId }, "chat realtime publish failed");
    }
  },
});
