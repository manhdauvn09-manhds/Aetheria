// Aetheria — Friends domain types.
//
// One canonical row per pair lives in `friendships` keyed
// (userId = requester, friendId = target). Status transitions:
//   • pending  — request created, awaiting response
//   • accepted — both sides see each other as friends
//   • blocked  — userId has blocked friendId (not symmetric)
//
// Decline removes the row entirely (no audit trail beyond AuditLog).
// Listing merges `friendshipsOut` + `friendshipsIn` so callers see a
// single user-centric view regardless of which row holds the relationship.

export type FriendStatus = "pending" | "accepted" | "blocked";

/**
 * One entry as observed from `viewerUserId`'s perspective. `direction`
 * disambiguates outgoing-pending vs incoming-pending; for `accepted`
 * relationships it is `"accepted"` so the caller can render a single
 * "Friend" pill.
 */
export interface FriendEdge {
  readonly otherUserId: bigint;
  readonly status: FriendStatus;
  /** outgoing = viewer is the requester (userId); incoming = viewer is the target (friendId). */
  readonly direction: "outgoing" | "incoming" | "accepted";
  readonly createdAt: Date;
}

export interface FriendList {
  readonly accepted: readonly FriendEdge[];
  readonly outgoingPending: readonly FriendEdge[];
  readonly incomingPending: readonly FriendEdge[];
  readonly blocked: readonly FriendEdge[];
}

export interface FriendRequestInput {
  readonly actorUserId: bigint;
  readonly targetUserId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface FriendRespondInput {
  readonly actorUserId: bigint;
  /** The original requester whose pending row we're resolving. */
  readonly requesterUserId: bigint;
  readonly accept: boolean;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}
