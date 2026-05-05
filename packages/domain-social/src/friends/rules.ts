// Aetheria — pure friends-domain helpers.
//
// No DB / I/O. The service uses these to classify rows it has already
// read from MySQL into the user-centric edge view that callers consume.

import type { FriendEdge, FriendStatus } from "./types.js";

export const toFriendStatus = (raw: string): FriendStatus => {
  if (raw === "accepted" || raw === "blocked") return raw;
  return "pending";
};

interface RawRow {
  readonly userId: bigint;
  readonly friendId: bigint;
  readonly status: string;
  readonly createdAt: Date;
}

/**
 * Convert raw `friendships` rows into the user-centric edge view from
 * `viewerUserId`'s perspective. Pure — operates on a snapshot.
 */
export const buildFriendList = (
  viewerUserId: bigint,
  rows: readonly RawRow[],
): {
  accepted: FriendEdge[];
  outgoingPending: FriendEdge[];
  incomingPending: FriendEdge[];
  blocked: FriendEdge[];
} => {
  const accepted: FriendEdge[] = [];
  const outgoingPending: FriendEdge[] = [];
  const incomingPending: FriendEdge[] = [];
  const blocked: FriendEdge[] = [];

  for (const r of rows) {
    const status = toFriendStatus(r.status);
    const isOutgoing = r.userId === viewerUserId;
    const otherUserId = isOutgoing ? r.friendId : r.userId;

    if (status === "accepted") {
      accepted.push({
        otherUserId,
        status,
        direction: "accepted",
        createdAt: r.createdAt,
      });
    } else if (status === "blocked") {
      // Only surface blocks the viewer initiated. Blocks against the viewer
      // are intentionally hidden from the viewer's UI — they manifest as
      // "request rejected" responses if they ever try to add the blocker.
      if (isOutgoing) {
        blocked.push({
          otherUserId,
          status,
          direction: "outgoing",
          createdAt: r.createdAt,
        });
      }
    } else {
      // pending
      if (isOutgoing) {
        outgoingPending.push({
          otherUserId,
          status,
          direction: "outgoing",
          createdAt: r.createdAt,
        });
      } else {
        incomingPending.push({
          otherUserId,
          status,
          direction: "incoming",
          createdAt: r.createdAt,
        });
      }
    }
  }

  return { accepted, outgoingPending, incomingPending, blocked };
};
