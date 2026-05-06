// Aetheria — PvP matchmaking domain types.
//
// Pure data shapes. The Redis queue stores entries as ZSET members keyed
// `<userId>:<joinedAtMs>` with the user's MMR as the score; this lets us
// scan by mmr range while still recovering the wait time per entry.

export type PvpMode = "1v1" | "3v3";

export type PvpRegion = "na" | "eu" | "ap";

export interface QueueEntry {
  readonly userId: bigint;
  readonly mode: PvpMode;
  readonly region: PvpRegion;
  readonly mmr: number;
  /** ms-since-epoch — when the queue entry was created. */
  readonly joinedAt: number;
}

/** Bracket widening curve. Linear ramp clamped at `maxWidth`. */
export interface BracketPolicy {
  /** MMR delta tolerated immediately on join. */
  readonly initialWidth: number;
  /** MMR delta added per second of waiting. */
  readonly widthPerSecond: number;
  /** Hard upper cap. */
  readonly maxWidth: number;
}

export const DEFAULT_BRACKET: BracketPolicy = {
  initialWidth: 50,
  widthPerSecond: 25,
  maxWidth: 1000,
};

/** Tick output: a pair the matcher considers fair to fight. */
export interface MatchProposal {
  readonly mode: PvpMode;
  readonly region: PvpRegion;
  readonly a: QueueEntry;
  readonly b: QueueEntry;
  /** `now - oldest.joinedAt`, the longest waiter's wait time. */
  readonly waitedMs: number;
}

export interface QueueInput {
  readonly userId: bigint;
  readonly mode: PvpMode;
  readonly region: PvpRegion;
  readonly mmr: number;
}

export interface CancelQueueInput {
  readonly userId: bigint;
  readonly mode: PvpMode;
  readonly region: PvpRegion;
}

export interface QueueStatus {
  readonly inQueue: boolean;
  readonly mode: PvpMode | null;
  readonly region: PvpRegion | null;
  readonly mmr: number | null;
  readonly joinedAt: Date | null;
}
