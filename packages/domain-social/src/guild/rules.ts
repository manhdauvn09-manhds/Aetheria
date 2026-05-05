// Aetheria — pure guild permission rules.
//
// No DB / I/O. The service layer parses the actor's GuildMember.role and
// passes it through these helpers so admin previews + client UI can mirror
// the exact permission matrix the server enforces.

import type { GuildRole } from "./types.js";

const RANK: Record<GuildRole, number> = { member: 0, officer: 1, leader: 2 };

/** Strict ordering: leader > officer > member. */
export const isHigherRank = (a: GuildRole, b: GuildRole): boolean => RANK[a] > RANK[b];

/** True iff `actor` may invite a non-member into the guild. */
export const canInvite = (actor: GuildRole): boolean =>
  actor === "leader" || actor === "officer";

/**
 * True iff `actor` may kick `target`. Leaders can kick officers or members;
 * officers can only kick members; nobody can kick a leader (leadership is
 * transferred via `promote`, then the demoted ex-leader can be kicked).
 */
export const canKick = (actor: GuildRole, target: GuildRole): boolean => {
  if (target === "leader") return false;
  return isHigherRank(actor, target);
};

/**
 * True iff `actor` may change `current` → `next`. Only leaders can change
 * roles. Demoting yourself to non-leader is not allowed via this path —
 * leadership transfer is a separate, two-step ritual: promote a successor
 * to leader (which atomically demotes the current leader to officer in
 * the service), then optionally promote/demote further.
 */
export const canPromote = (
  actor: GuildRole,
  current: GuildRole,
  next: GuildRole,
): boolean => {
  if (actor !== "leader") return false;
  if (current === next) return false;
  return true;
};

/** True iff `actor` may start a guild raid. Leader-only. */
export const canStartRaid = (actor: GuildRole): boolean => actor === "leader";

/** Bounds for guild name + tag (mirrored in schema-db VARCHARs). */
export const GUILD_NAME_MIN = 3;
export const GUILD_NAME_MAX = 64;
export const GUILD_TAG_MIN = 2;
export const GUILD_TAG_MAX = 4;

/** Default invite TTL: 7 days. Pure helper so callers can override. */
export const inviteExpiresAt = (now: Date, ttlMs = 7 * 24 * 60 * 60 * 1000): Date =>
  new Date(now.getTime() + ttlMs);

/** True iff the invite has not yet expired at `now`. */
export const isInviteFresh = (expiresAt: Date, now: Date): boolean =>
  expiresAt.getTime() > now.getTime();
