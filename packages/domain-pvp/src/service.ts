// Aetheria — PvpMatchmakingService.
//
// Owns the Redis-backed matchmaking queue + a periodic matcher loop.
// Only handles `queue` / `cancelQueue` / `tick`; persisting the
// resulting `pvp_matches` row + room creation is task 4.44.

import type { Redis } from "ioredis";

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import {
  bracketWidth,
  decodeMember,
  encodeMember,
  proposeMatches,
  queueKey,
} from "./rules.js";
import {
  DEFAULT_BRACKET,
  type BracketPolicy,
  type CancelQueueInput,
  type MatchProposal,
  type PvpMode,
  type PvpRegion,
  type QueueEntry,
  type QueueInput,
  type QueueStatus,
} from "./types.js";

/** Subset of the ioredis client this service touches. */
export type PvpRedisClient = Pick<
  Redis,
  "zadd" | "zrem" | "zrange" | "zcard" | "zscore" | "set" | "del"
>;

/**
 * Per-user marker key used to make `queue()` race-free. Lifetime ties to
 * the queue entry: written via `SET NX EX` on join, deleted on cancel /
 * match-found.
 */
const userQueueMarkerKey = (userId: bigint): string =>
  `aetheria:pvp:user:${userId.toString()}`;
const QUEUE_MARKER_TTL_SECONDS = 60 * 30;

/** Subset of the Prisma client this service touches (for default MMR lookups). */
export type PvpMysqlClient = Pick<MysqlClient, "mmr">;

export interface PvpDeps {
  readonly redis: PvpRedisClient;
  readonly mysql?: PvpMysqlClient;
  readonly clock?: () => number;
  readonly bracket?: BracketPolicy;
  /** Tick interval for the matcher loop. Defaults to 1500 ms. */
  readonly tickMs?: number;
  /** Hook invoked for every emitted proposal. 4.44 will plug in match creation. */
  readonly onMatch?: (proposal: MatchProposal) => void | Promise<void>;
  /** Optional tuples to scan; defaults to all `(mode, region)` permutations. */
  readonly scanScopes?: readonly { mode: PvpMode; region: PvpRegion }[];
}

/** Default starting MMR for new players. Mirrors the `mmr` table default. */
export const DEFAULT_MMR = 1000;

const ALL_MODES: readonly PvpMode[] = ["1v1", "3v3"];
const ALL_REGIONS: readonly PvpRegion[] = ["na", "eu", "ap"];

const allScopes = (): readonly { mode: PvpMode; region: PvpRegion }[] => {
  const out: { mode: PvpMode; region: PvpRegion }[] = [];
  for (const mode of ALL_MODES) {
    for (const region of ALL_REGIONS) out.push({ mode, region });
  }
  return out;
};

export class PvpMatchmakingService {
  private readonly redis: PvpRedisClient;
  private readonly mysql: PvpMysqlClient | undefined;
  private readonly clock: () => number;
  private readonly bracket: BracketPolicy;
  private readonly tickMs: number;
  private readonly onMatch: ((proposal: MatchProposal) => void | Promise<void>) | undefined;
  private readonly scopes: readonly { mode: PvpMode; region: PvpRegion }[];
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: PvpDeps) {
    this.redis = deps.redis;
    this.mysql = deps.mysql;
    this.clock = deps.clock ?? ((): number => Date.now());
    this.bracket = deps.bracket ?? DEFAULT_BRACKET;
    this.tickMs = deps.tickMs ?? 1500;
    this.onMatch = deps.onMatch;
    this.scopes = deps.scanScopes ?? allScopes();
  }

  // ──────────────────────────────────────────────────────────────────
  // Player-facing operations
  // ──────────────────────────────────────────────────────────────────

  async queue(input: QueueInput): Promise<{ joinedAt: Date; mmr: number }> {
    if (input.mmr < 0) throw AppError.badRequest("mmr must be non-negative");

    // R7: claim the per-user marker via SET NX so two concurrent queue
    // calls can't both succeed. The marker stores the scope so cancel /
    // tick can find the right ZSET to clean up.
    const markerKey = userQueueMarkerKey(input.userId);
    const markerVal = `${input.mode}:${input.region}`;
    const claim = await this.redis.set(
      markerKey,
      markerVal,
      "EX",
      QUEUE_MARKER_TTL_SECONDS,
      "NX",
    );
    if (claim !== "OK") {
      // Read the prior scope from the marker for a precise error.
      const prior = await this.findUserQueue(input.userId);
      throw AppError.conflict("Already queued", {
        mode: prior?.mode ?? null,
        region: prior?.region ?? null,
      });
    }

    const now = this.clock();
    const member = encodeMember(input.userId, now);
    const key = queueKey(input.mode, input.region);
    await this.redis.zadd(key, input.mmr, member);

    await audit.write({
      actor: input.userId,
      action: "pvp.queue",
      targetType: "pvpQueue",
      targetId: input.userId,
      payload: { mode: input.mode, region: input.region, mmr: input.mmr },
      ip: null,
      userAgent: null,
    });

    return { joinedAt: new Date(now), mmr: input.mmr };
  }

  async cancelQueue(input: CancelQueueInput): Promise<{ removed: boolean }> {
    const key = queueKey(input.mode, input.region);
    const member = await this.findMemberInKey(key, input.userId);
    if (!member) {
      // Marker may still be lingering after a server crash; clear it.
      await this.redis.del(userQueueMarkerKey(input.userId));
      return { removed: false };
    }
    const removed = await this.redis.zrem(key, member);
    await this.redis.del(userQueueMarkerKey(input.userId));

    await audit.write({
      actor: input.userId,
      action: "pvp.cancelQueue",
      targetType: "pvpQueue",
      targetId: input.userId,
      payload: { mode: input.mode, region: input.region },
      ip: null,
      userAgent: null,
    });

    return { removed: removed > 0 };
  }

  /** Whichever (mode, region) the user is queued in, if any. O(scopes) network calls. */
  async status(userId: bigint): Promise<QueueStatus> {
    const found = await this.findUserQueue(userId);
    if (!found) {
      return { inQueue: false, mode: null, region: null, mmr: null, joinedAt: null };
    }
    return {
      inQueue: true,
      mode: found.mode,
      region: found.region,
      mmr: found.mmr,
      joinedAt: new Date(found.joinedAtMs),
    };
  }

  /** Default MMR: read from `mmr` table when wired, else `DEFAULT_MMR`. */
  async resolveMmr(userId: bigint, mode: PvpMode): Promise<number> {
    if (!this.mysql) return DEFAULT_MMR;
    const row = await this.mysql.mmr.findUnique({
      where: { userId_mode: { userId, mode } },
      select: { mmr: true },
    });
    return row?.mmr ?? DEFAULT_MMR;
  }

  // ──────────────────────────────────────────────────────────────────
  // Matcher loop
  // ──────────────────────────────────────────────────────────────────

  /**
   * Run one matcher tick across `scanScopes`. For each scope: read all
   * entries, run `proposeMatches`, ZREM matched members, fire `onMatch`.
   */
  async tick(now: number = this.clock()): Promise<readonly MatchProposal[]> {
    const proposals: MatchProposal[] = [];
    for (const scope of this.scopes) {
      const entries = await this.readQueue(scope.mode, scope.region);
      if (entries.length < 2) continue;
      const tickProposals = proposeMatches(entries, now, this.bracket);
      if (tickProposals.length === 0) continue;

      const key = queueKey(scope.mode, scope.region);
      for (const p of tickProposals) {
        await this.redis.zrem(
          key,
          encodeMember(p.a.userId, p.a.joinedAt),
          encodeMember(p.b.userId, p.b.joinedAt),
        );
        // R7: release the per-user markers so the players can re-queue
        // after this match (or after a forfeit).
        await this.redis.del(userQueueMarkerKey(p.a.userId));
        await this.redis.del(userQueueMarkerKey(p.b.userId));
        proposals.push(p);
        if (this.onMatch) await this.onMatch(p);
      }
    }
    return proposals;
  }

  /** Start the periodic loop. Returns an `unsubscribe` to stop it. */
  start(): () => void {
    if (this.timer) return () => undefined;
    const fn = (): void => {
      this.tick().catch(() => {
        // Tick errors must never crash the process; service-level
        // observability should pick them up via the audit log when
        // operations succeed and via stderr otherwise.
      });
    };
    this.timer = setInterval(fn, this.tickMs);
    // Unref so the matcher does not block process exit during tests.
    this.timer.unref();
    return () => {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────

  private async readQueue(mode: PvpMode, region: PvpRegion): Promise<readonly QueueEntry[]> {
    const key = queueKey(mode, region);
    // ZRANGE 0 -1 WITHSCORES → flat [member, score, member, score, …]
    const raw = await this.redis.zrange(key, 0, -1, "WITHSCORES");
    const out: QueueEntry[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const member = raw[i];
      const scoreRaw = raw[i + 1];
      if (member === undefined || scoreRaw === undefined) continue;
      const decoded = decodeMember(member);
      if (!decoded) continue;
      const mmr = Number.parseInt(scoreRaw, 10);
      if (!Number.isFinite(mmr)) continue;
      out.push({
        userId: decoded.userId,
        mode,
        region,
        mmr,
        joinedAt: decoded.joinedAtMs,
      });
    }
    return out;
  }

  private async findUserQueue(
    userId: bigint,
  ): Promise<{ mode: PvpMode; region: PvpRegion; mmr: number; joinedAtMs: number } | null> {
    for (const scope of this.scopes) {
      const key = queueKey(scope.mode, scope.region);
      const member = await this.findMemberInKey(key, userId);
      if (!member) continue;
      const score = await this.redis.zscore(key, member);
      const mmr = score === null ? DEFAULT_MMR : Number.parseInt(score, 10);
      const decoded = decodeMember(member);
      if (!decoded) continue;
      return {
        mode: scope.mode,
        region: scope.region,
        mmr,
        joinedAtMs: decoded.joinedAtMs,
      };
    }
    return null;
  }

  private async findMemberInKey(key: string, userId: bigint): Promise<string | null> {
    const raw = await this.redis.zrange(key, 0, -1);
    const prefix = `${userId.toString()}:`;
    return raw.find((m) => m.startsWith(prefix)) ?? null;
  }

  /** Estimate "current bracket width" for a queued user (UI hint). */
  estimatedBracket(joinedAt: Date, now: number = this.clock()): number {
    return bracketWidth(now - joinedAt.getTime(), this.bracket);
  }
}
