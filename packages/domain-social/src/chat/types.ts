// Aetheria — Chat domain types.
//
// Mirrors `chat_messages` rows in `schema-db`. The same shape is used for
// both `send` echo and `history` paged reads. Channel semantics:
//
//   • global  — channelId is null; readable by anyone.
//   • guild   — channelId is the Guild.id; only guild members can read/write.
//   • party   — channelId is a transient party id (any positive BigInt).
//   • whisper — channelId is the *other* user's id; (sender, channel) pair
//                 keys the conversation regardless of which side spoke.

import type { ChannelType } from "../types.js";

export type { ChannelType };

export interface ChatMessageRow {
  readonly messageId: bigint;
  readonly channelType: ChannelType;
  readonly channelId: bigint | null;
  readonly senderId: bigint;
  readonly content: string;
  readonly flagged: boolean;
  readonly createdAt: Date;
}

export interface SendChatInput {
  readonly actorUserId: bigint;
  readonly channelType: ChannelType;
  readonly channelId?: bigint | null;
  readonly content: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface HistoryChatInput {
  readonly actorUserId: bigint;
  readonly channelType: ChannelType;
  readonly channelId?: bigint | null;
  readonly limit?: number;
  readonly before?: Date;
}

export interface ReportChatInput {
  readonly actorUserId: bigint;
  readonly messageId: bigint;
  readonly reason: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}
