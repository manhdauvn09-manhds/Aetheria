// Aetheria — FriendsService.
//
// Operates on the existing `friendships` MySQL table. One canonical row
// per pair (requester → target). list() merges `friendshipsOut` +
// `friendshipsIn` so callers see a single user-centric view.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import { buildFriendList } from "./rules.js";
import type {
  FriendList,
  FriendRequestInput,
  FriendRespondInput,
} from "./types.js";

export type FriendsMysqlClient = Pick<MysqlClient, "friendship">;

export interface FriendsDeps {
  readonly mysql: FriendsMysqlClient;
}

export class FriendsService {
  private readonly mysql: FriendsMysqlClient;

  constructor(deps: FriendsDeps) {
    this.mysql = deps.mysql;
  }

  async list(userId: bigint): Promise<FriendList> {
    const rows = await this.mysql.friendship.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      orderBy: { createdAt: "desc" },
    });
    return buildFriendList(userId, rows);
  }

  async request(input: FriendRequestInput): Promise<{ status: "pending" }> {
    if (input.actorUserId === input.targetUserId) {
      throw AppError.badRequest("Cannot friend yourself");
    }

    // Block check — neither side may have blocked the other.
    const blockExisting = await this.mysql.friendship.findFirst({
      where: {
        status: "blocked",
        OR: [
          { userId: input.actorUserId, friendId: input.targetUserId },
          { userId: input.targetUserId, friendId: input.actorUserId },
        ],
      },
      select: { userId: true, friendId: true },
    });
    if (blockExisting) {
      throw AppError.forbidden("Friend request not allowed");
    }

    // Existing relationship in either direction blocks a fresh request.
    const existing = await this.mysql.friendship.findFirst({
      where: {
        OR: [
          { userId: input.actorUserId, friendId: input.targetUserId },
          { userId: input.targetUserId, friendId: input.actorUserId },
        ],
      },
      select: { status: true },
    });
    if (existing) {
      throw AppError.conflict("Friendship already exists", { status: existing.status });
    }

    await this.mysql.friendship.create({
      data: {
        userId: input.actorUserId,
        friendId: input.targetUserId,
        status: "pending",
      },
    });

    await audit.write({
      actor: input.actorUserId,
      action: "friend.request",
      targetType: "user",
      targetId: input.targetUserId,
      payload: {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { status: "pending" };
  }

  async respond(input: FriendRespondInput): Promise<{ status: "accepted" | "declined" }> {
    const row = await this.mysql.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: input.requesterUserId,
          friendId: input.actorUserId,
        },
      },
    });
    if (row?.status !== "pending") {
      throw AppError.notFound("friendRequest", input.requesterUserId);
    }

    if (input.accept) {
      await this.mysql.friendship.update({
        where: {
          userId_friendId: {
            userId: input.requesterUserId,
            friendId: input.actorUserId,
          },
        },
        data: { status: "accepted" },
      });
    } else {
      await this.mysql.friendship.delete({
        where: {
          userId_friendId: {
            userId: input.requesterUserId,
            friendId: input.actorUserId,
          },
        },
      });
    }

    await audit.write({
      actor: input.actorUserId,
      action: input.accept ? "friend.accept" : "friend.decline",
      targetType: "user",
      targetId: input.requesterUserId,
      payload: {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { status: input.accept ? "accepted" : "declined" };
  }
}
