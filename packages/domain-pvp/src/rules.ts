// Aetheria — pure matchmaking rules.
//
// No I/O. The service feeds these helpers raw queue entries (parsed
// from Redis) and consumes their verdicts. The same helpers power
// admin previews + client-side "estimated wait" hints.

import {
  DEFAULT_BRACKET,
  type BracketPolicy,
  type MatchProposal,
  type PvpMode,
  type PvpRegion,
  type QueueEntry,
} from "./types.js";

const MODES: readonly PvpMode[] = ["1v1", "3v3"];
const REGIONS: readonly PvpRegion[] = ["na", "eu", "ap"];

export const isPvpMode = (s: string): s is PvpMode =>
  (MODES as readonly string[]).includes(s);

export const isPvpRegion = (s: string): s is PvpRegion =>
  (REGIONS as readonly string[]).includes(s);

/** Redis ZSET key for a (mode, region) tuple. */
export const queueKey = (mode: PvpMode, region: PvpRegion): string =>
  `aetheria:pvp:q:${mode}:${region}`;

/** Member format used inside the ZSET: stable, ordered, easy to parse. */
export const encodeMember = (userId: bigint, joinedAtMs: number): string =>
  `${userId.toString()}:${joinedAtMs.toString()}`;

/** Inverse of `encodeMember`. Returns null on malformed input. */
export const decodeMember = (
  raw: string,
): { userId: bigint; joinedAtMs: number } | null => {
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const userPart = raw.slice(0, idx);
  const tsPart = raw.slice(idx + 1);
  if (!/^\d+$/.test(userPart) || !/^\d+$/.test(tsPart)) return null;
  let userId: bigint;
  try {
    userId = BigInt(userPart);
  } catch {
    return null;
  }
  const joinedAtMs = Number.parseInt(tsPart, 10);
  if (!Number.isFinite(joinedAtMs)) return null;
  return { userId, joinedAtMs };
};

/**
 * MMR delta tolerated for an entry that has waited `elapsedMs`.
 * `initialWidth + widthPerSecond * seconds`, clamped at `maxWidth`.
 */
export const bracketWidth = (
  elapsedMs: number,
  policy: BracketPolicy = DEFAULT_BRACKET,
): number => {
  const seconds = Math.max(0, elapsedMs) / 1000;
  const w = policy.initialWidth + policy.widthPerSecond * seconds;
  return Math.min(policy.maxWidth, Math.max(0, Math.round(w)));
};

/** Two players are pairable when their mmr delta fits the wider waiter's bracket. */
export const isPairable = (
  a: QueueEntry,
  b: QueueEntry,
  now: number,
  policy: BracketPolicy = DEFAULT_BRACKET,
): boolean => {
  if (a.userId === b.userId) return false;
  const wA = bracketWidth(now - a.joinedAt, policy);
  const wB = bracketWidth(now - b.joinedAt, policy);
  const tolerance = Math.max(wA, wB);
  return Math.abs(a.mmr - b.mmr) <= tolerance;
};

/**
 * Greedy matcher tick: pick the longest-waiting entry, find any partner
 * within its current bracket, emit the pair, repeat. Pure — operates on
 * a snapshot. Caller is responsible for removing the matched entries
 * from Redis.
 */
export const proposeMatches = (
  entries: readonly QueueEntry[],
  now: number,
  policy: BracketPolicy = DEFAULT_BRACKET,
): readonly MatchProposal[] => {
  if (entries.length < 2) return [];
  const sorted = [...entries].sort((x, y) => x.joinedAt - y.joinedAt);
  const used = new Set<bigint>();
  const out: MatchProposal[] = [];
  for (const a of sorted) {
    if (used.has(a.userId)) continue;
    const partner = sorted.find(
      (b) => !used.has(b.userId) && b.userId !== a.userId && isPairable(a, b, now, policy),
    );
    if (!partner) continue;
    used.add(a.userId);
    used.add(partner.userId);
    out.push({
      mode: a.mode,
      region: a.region,
      a,
      b: partner,
      waitedMs: now - Math.min(a.joinedAt, partner.joinedAt),
    });
  }
  return out;
};
