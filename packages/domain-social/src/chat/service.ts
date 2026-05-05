// Aetheria — ChatService.
//
// Persists chat messages to MySQL `chat_messages` and applies the
// moderation rules from 4.36 (validateContent / containsProfanity /
// shouldFlagMessage / checkRateLimit). Realtime fan-out lives in
// 4.40–4.41; this service is the durable source of truth + audit trail.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import {
  checkRateLimit,
  DEFAULT_RATE_LIMITS,
  shouldFlagMessage,
  validateContent,
} from "../rules.js";
import type { ChannelType } from "../types.js";

import type {
  ChatMessageRow,
  HistoryChatInput,
  ReportChatInput,
  SendChatInput,
} from "./types.js";

export type ChatMysqlClient = Pick<
  MysqlClient,
  "chatMessage" | "guildMember" | "friendship"
>;

export interface ChatDeps {
  readonly mysql: ChatMysqlClient;
  /** Defaults to `Date.now()`. Tests inject a frozen clock. */
  readonly clock?: () => Date;
  /** Optional override for the default profanity list. */
  readonly profanityList?: readonly string[];
}

const HISTORY_DEFAULT = 50;
const HISTORY_MAX = 200;
const REPEAT_LOOKBACK_MS = 60_000;

const toChannelType = (raw: string): ChannelType => {
  if (raw === "guild" || raw === "party" || raw === "whisper") return raw;
  return "global";
};

const requireChannelId = (
  channelType: ChannelType,
  channelId: bigint | null | undefined,
): bigint | null => {
  if (channelType === "global") return null;
  if (channelId === null || channelId === undefined) {
    throw AppError.badRequest(`channelId required for ${channelType} channel`);
  }
  return channelId;
};

export class ChatService {
  private readonly mysql: ChatMysqlClient;
  private readonly clock: () => Date;
  private readonly profanityList: readonly string[] | undefined;

  constructor(deps: ChatDeps) {
    this.mysql = deps.mysql;
    this.clock = deps.clock ?? ((): Date => new Date());
    this.profanityList = deps.profanityList;
  }

  async send(input: SendChatInput): Promise<ChatMessageRow> {
    const channelId = requireChannelId(input.channelType, input.channelId);

    // 1. Content validation (length / control chars / profanity flag).
    const validation = validateContent(input.content, undefined, this.profanityList);
    if (!validation.ok) {
      throw AppError.badRequest("Message rejected", { reason: validation.reason });
    }

    // 2. Channel-level access control.
    await this.assertCanWrite(input.actorUserId, input.channelType, channelId);

    // 3. Sliding-window rate limit per (user, channel).
    const policy = DEFAULT_RATE_LIMITS[input.channelType];
    const now = this.clock();
    const recentSends = await this.mysql.chatMessage.findMany({
      where: {
        senderId: input.actorUserId,
        channelType: input.channelType,
        channelId,
        createdAt: { gt: new Date(now.getTime() - policy.windowMs) },
      },
      select: { createdAt: true, content: true },
    });
    const rl = checkRateLimit(
      recentSends.map((r) => r.createdAt.getTime()),
      now.getTime(),
      policy,
    );
    if (!rl.ok) {
      throw AppError.conflict("Rate limit exceeded", {
        retryAfterMs: rl.retryAfterMs,
      });
    }

    // 4. Spam heuristic — count near-identical sends in the last minute.
    const repeatCount = recentSends.filter(
      (r) =>
        r.content === validation.content &&
        r.createdAt.getTime() > now.getTime() - REPEAT_LOOKBACK_MS,
    ).length;
    const flagged = shouldFlagMessage({
      content: validation.content,
      recentSameContentCount: repeatCount,
      ...(this.profanityList ? { profanityList: this.profanityList } : {}),
    });

    // 5. Persist.
    const created = await this.mysql.chatMessage.create({
      data: {
        channelType: input.channelType,
        channelId,
        senderId: input.actorUserId,
        content: validation.content,
        flagged,
        createdAt: now,
      },
    });

    // 6. Audit only flagged messages (every send would be too noisy).
    if (flagged) {
      await audit.write({
        actor: input.actorUserId,
        action: "chat.flagged",
        targetType: "chatMessage",
        targetId: created.id,
        payload: {
          channelType: input.channelType,
          channelId: channelId === null ? null : channelId.toString(),
          repeatCount,
        },
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    }

    return this.toRow(created);
  }

  async history(input: HistoryChatInput): Promise<readonly ChatMessageRow[]> {
    const channelId = requireChannelId(input.channelType, input.channelId);
    await this.assertCanRead(input.actorUserId, input.channelType, channelId);

    const limit = Math.min(HISTORY_MAX, Math.max(1, input.limit ?? HISTORY_DEFAULT));

    if (input.channelType === "whisper") {
      // Whisper history pairs (actor, other) regardless of who spoke. The
      // canonical rows have channelId = receiver's userId, so history
      // between A and B is rows where (sender=A, channel=B) OR
      // (sender=B, channel=A). `requireChannelId` guarantees non-null here.
      if (channelId === null) throw AppError.badRequest("channelId required for whisper");
      const other: bigint = channelId;
      const rows = await this.mysql.chatMessage.findMany({
        where: {
          channelType: "whisper",
          OR: [
            { senderId: input.actorUserId, channelId: other },
            { senderId: other, channelId: input.actorUserId },
          ],
          ...(input.before ? { createdAt: { lt: input.before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((r) => this.toRow(r));
    }

    const rows = await this.mysql.chatMessage.findMany({
      where: {
        channelType: input.channelType,
        channelId,
        ...(input.before ? { createdAt: { lt: input.before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => this.toRow(r));
  }

  async report(input: ReportChatInput): Promise<{ messageId: bigint; flagged: true }> {
    if (input.reason.trim().length === 0 || input.reason.length > 500) {
      throw AppError.badRequest("Report reason must be 1-500 chars");
    }
    const msg = await this.mysql.chatMessage.findUnique({
      where: { id: input.messageId },
      select: { id: true, flagged: true },
    });
    if (!msg) throw AppError.notFound("chatMessage", input.messageId);

    if (!msg.flagged) {
      await this.mysql.chatMessage.update({
        where: { id: msg.id },
        data: { flagged: true },
      });
    }

    await audit.write({
      actor: input.actorUserId,
      action: "chat.report",
      targetType: "chatMessage",
      targetId: msg.id,
      payload: { reason: input.reason.trim() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { messageId: msg.id, flagged: true };
  }

  // ──────────────────────────────────────────────────────────────────
  // Access control
  // ──────────────────────────────────────────────────────────────────

  private async assertCanWrite(
    actorUserId: bigint,
    channelType: ChannelType,
    channelId: bigint | null,
  ): Promise<void> {
    if (channelType === "global" || channelType === "party") return;
    // `requireChannelId` already threw for null on non-global channels.
    if (channelId === null) throw AppError.badRequest("channelId required");
    if (channelType === "guild") {
      await this.assertGuildMember(actorUserId, channelId);
      return;
    }
    // whisper — channelId = receiver. Cannot whisper if either side blocked.
    await this.assertNotBlocked(actorUserId, channelId);
  }

  private async assertCanRead(
    actorUserId: bigint,
    channelType: ChannelType,
    channelId: bigint | null,
  ): Promise<void> {
    if (channelType === "global" || channelType === "party") return;
    if (channelId === null) throw AppError.badRequest("channelId required");
    if (channelType === "guild") {
      await this.assertGuildMember(actorUserId, channelId);
    }
    // whisper — anyone with the other user's id can read pair history if
    // they're not blocked. Block check is symmetric so reuse it.
    if (channelType === "whisper") {
      await this.assertNotBlocked(actorUserId, channelId);
    }
  }

  private async assertGuildMember(userId: bigint, guildId: bigint): Promise<void> {
    const member = await this.mysql.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { userId: true },
    });
    if (!member) throw AppError.forbidden("Not a member of this guild");
  }

  private async assertNotBlocked(actor: bigint, other: bigint): Promise<void> {
    if (actor === other) {
      throw AppError.badRequest("Cannot whisper yourself");
    }
    const block = await this.mysql.friendship.findFirst({
      where: {
        status: "blocked",
        OR: [
          { userId: actor, friendId: other },
          { userId: other, friendId: actor },
        ],
      },
      select: { userId: true },
    });
    if (block) throw AppError.forbidden("Whisper not allowed");
  }

  private toRow(row: {
    id: bigint;
    channelType: string;
    channelId: bigint | null;
    senderId: bigint;
    content: string;
    flagged: boolean;
    createdAt: Date;
  }): ChatMessageRow {
    return {
      messageId: row.id,
      channelType: toChannelType(row.channelType),
      channelId: row.channelId,
      senderId: row.senderId,
      content: row.content,
      flagged: row.flagged,
      createdAt: row.createdAt,
    };
  }
}
