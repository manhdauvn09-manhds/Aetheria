// Aetheria — PvpMatchService.
//
// Handles match lifecycle on top of `pvp_matches` + `pvp_match_players`:
//   • createFromProposal — atomic INSERT of one match row + N player
//     rows with mmrBefore snapshotted from the `mmr` table; emits a
//     realtime event so apps/realtime can spawn the match room.
//   • activeMatchFor — returns the requester's current `active` match
//     (player must be a participant).
//   • get — full detail for a match the actor participates in.
//
// Result/score writes live in 4.45/4.46.

import { randomBytes } from "node:crypto";

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import type { MmrService } from "./mmr.js";
import type { MatchPublisher } from "./publisher.js";
import { toMatchStartEvent } from "./publisher.js";
import { isPvpMode, isPvpRegion } from "./rules.js";
import { DEFAULT_MMR } from "./service.js";
import type {
  MatchProposal,
  PvpMatchPlayerRow,
  PvpMatchResult,
  PvpMatchRow,
  PvpMatchStatus,
  PvpMode,
  PvpRegion,
} from "./types.js";

export type MatchMysqlClient = Pick<
  MysqlClient,
  "pvpMatch" | "pvpMatchPlayer" | "mmr" | "$transaction"
>;

export interface MatchDeps {
  readonly mysql: MatchMysqlClient;
  /** Optional realtime hook fired after the match row is committed. */
  readonly publisher?: MatchPublisher;
  /** Optional override for `randomBytes` (deterministic in tests). */
  readonly seedFactory?: () => Buffer;
  /** When set, `complete` runs Glicko-2 updates before returning. */
  readonly mmrService?: MmrService;
}

const toStatus = (raw: string): PvpMatchStatus => {
  if (raw === "completed" || raw === "abandoned") return raw;
  return "active";
};

const toResult = (raw: string): PvpMatchResult => {
  if (raw === "win" || raw === "loss") return raw;
  return "draw";
};

const toMode = (raw: string): PvpMode => (isPvpMode(raw) ? raw : "1v1");

const toRegion = (raw: string): PvpRegion => (isPvpRegion(raw) ? raw : "na");

const parseLineup = (raw: unknown): readonly string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
};

export class PvpMatchService {
  private readonly mysql: MatchMysqlClient;
  private readonly publisher: MatchPublisher | undefined;
  private readonly seedFactory: () => Buffer;

  private readonly mmrService: MmrService | undefined;

  constructor(deps: MatchDeps) {
    this.mysql = deps.mysql;
    this.publisher = deps.publisher;
    this.seedFactory = deps.seedFactory ?? ((): Buffer => randomBytes(64));
    this.mmrService = deps.mmrService;
  }

  /**
   * Persist a match from a `MatchProposal`. Atomic: one `pvp_matches`
   * row + two `pvp_match_players` rows, mmrBefore snapshotted from the
   * proposal (which already reflects the queue's score).
   */
  async createFromProposal(proposal: MatchProposal): Promise<PvpMatchRow> {
    const seed = this.seedFactory();
    const created = await this.mysql.$transaction(async (tx) => {
      const match = await tx.pvpMatch.create({
        data: {
          mode: proposal.mode,
          status: "active",
          region: proposal.region,
          serverSeed: seed,
        },
      });
      for (const e of [proposal.a, proposal.b]) {
        await tx.pvpMatchPlayer.create({
          data: {
            matchId: match.id,
            userId: e.userId,
            lineup: [],
            score: 0,
            mmrBefore: e.mmr,
            mmrAfter: e.mmr,
            result: "draw",
          },
        });
      }
      return match;
    });

    await audit.write({
      actor: proposal.a.userId,
      action: "pvp.match.start",
      targetType: "pvpMatch",
      targetId: created.id,
      payload: {
        mode: proposal.mode,
        region: proposal.region,
        opponent: proposal.b.userId.toString(),
        waitedMs: proposal.waitedMs,
      },
      ip: null,
      userAgent: null,
    });

    const row = await this.get(created.id, proposal.a.userId);

    if (this.publisher) {
      await this.publisher.publish(toMatchStartEvent(row));
    }

    return row;
  }

  /**
   * Mark a match as `completed` with `winnerUserId`. Updates `pvpMatch`
   * + each `pvpMatchPlayer.result`. mmrAfter is left untouched here —
   * 4.46 (Glicko-2) is responsible for that.
   */
  async complete(
    matchId: bigint,
    winnerUserId: bigint | null,
    reason: "completed" | "forfeit" | "timeout" = "completed",
  ): Promise<PvpMatchRow> {
    const m = await this.mysql.pvpMatch.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    if (!m) throw AppError.notFound("pvpMatch", matchId);
    if (m.status !== "active") {
      throw AppError.conflict("Match already finalised", { status: m.status });
    }

    const endedAt = new Date();
    await this.mysql.$transaction(async (tx) => {
      await tx.pvpMatch.update({
        where: { id: matchId },
        data: {
          status: reason === "forfeit" ? "abandoned" : "completed",
          endedAt,
          winnerUserId,
        },
      });
      for (const p of m.players) {
        const result: PvpMatchResult =
          winnerUserId === null
            ? "draw"
            : p.userId === winnerUserId
              ? "win"
              : "loss";
        await tx.pvpMatchPlayer.update({
          where: { matchId_userId: { matchId, userId: p.userId } },
          data: { result },
        });
      }
    });

    await audit.write({
      actor: winnerUserId ?? m.players[0]?.userId ?? 0n,
      action: `pvp.match.${reason}`,
      targetType: "pvpMatch",
      targetId: matchId,
      payload: {
        winnerUserId: winnerUserId === null ? null : winnerUserId.toString(),
        reason,
      },
      ip: null,
      userAgent: null,
    });

    // Glicko-2 update (1v1 only for now). Errors here are surfaced —
    // MMR is part of the match contract.
    if (this.mmrService && m.players.length === 2 && m.mode === "1v1") {
      const [pa, pb] = m.players;
      if (pa && pb) {
        await this.mmrService.applyMatchResult({
          matchId,
          mode: "1v1",
          playerA: pa.userId,
          playerB: pb.userId,
          winnerUserId,
        });
      }
    }

    return this.get(matchId, m.players[0]?.userId ?? 0n);
  }

  /** Forfeit shorthand. The non-forfeiter wins. */
  async forfeit(matchId: bigint, forfeiterUserId: bigint): Promise<PvpMatchRow> {
    const m = await this.mysql.pvpMatch.findUnique({
      where: { id: matchId },
      include: { players: { select: { userId: true } } },
    });
    if (!m) throw AppError.notFound("pvpMatch", matchId);
    const winner = m.players.find((p) => p.userId !== forfeiterUserId)?.userId ?? null;
    return this.complete(matchId, winner, "forfeit");
  }

  /** Active match for `userId`, or null when not currently in one. */
  async activeMatchFor(userId: bigint): Promise<PvpMatchRow | null> {
    const player = await this.mysql.pvpMatchPlayer.findFirst({
      where: { userId, match: { status: "active" } },
      orderBy: { matchId: "desc" },
      select: { matchId: true },
    });
    if (!player) return null;
    return this.get(player.matchId, userId);
  }

  /** Full detail. Requester must be a participant. */
  async get(matchId: bigint, requesterUserId: bigint): Promise<PvpMatchRow> {
    const m = await this.mysql.pvpMatch.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    if (!m) throw AppError.notFound("pvpMatch", matchId);

    const isParticipant = m.players.some((p) => p.userId === requesterUserId);
    if (!isParticipant) {
      throw AppError.forbidden("Not a participant of this match");
    }

    const players: PvpMatchPlayerRow[] = m.players.map((p) => ({
      userId: p.userId,
      lineup: parseLineup(p.lineup),
      score: p.score,
      mmrBefore: p.mmrBefore,
      mmrAfter: p.mmrAfter,
      result: toResult(p.result),
    }));

    return {
      matchId: m.id,
      mode: toMode(m.mode),
      region: toRegion(m.region),
      status: toStatus(m.status),
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      winnerUserId: m.winnerUserId,
      players,
    };
  }
}

// Re-export for convenience.
export { DEFAULT_MMR };
