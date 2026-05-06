// Aetheria — MmrService.
//
// Reads + writes the `mmr` table for a (userId, mode) pair. Holds the
// canonical Glicko-2 state (rating + rd + volatility). `applyMatchResult`
// is called from `MatchService.complete` to compute deltas and persist
// `mmrAfter` on each `pvp_match_players` row in the same transaction.

import { audit } from "@aetheria/core";
import type { MysqlClient } from "@aetheria/schema-db/mysql";

import { DEFAULT_RATING, glicko2Single, type GlickoRating } from "./glicko.js";
import type { PvpMatchResult, PvpMode } from "./types.js";

export type MmrMysqlClient = Pick<MysqlClient, "mmr" | "pvpMatchPlayer" | "$transaction">;

export interface MmrDeps {
  readonly mysql: MmrMysqlClient;
}

export interface MmrSnapshot extends GlickoRating {
  readonly userId: bigint;
  readonly mode: PvpMode;
  readonly peakMmr: number;
  readonly seasonGames: number;
  readonly seasonWins: number;
  readonly updatedAt: Date;
}

export interface MmrDelta {
  readonly userId: bigint;
  readonly before: GlickoRating;
  readonly after: GlickoRating;
  readonly result: PvpMatchResult;
}

const toMode = (raw: string): PvpMode => (raw === "3v3" ? "3v3" : "1v1");

export class MmrService {
  private readonly mysql: MmrMysqlClient;

  constructor(deps: MmrDeps) {
    this.mysql = deps.mysql;
  }

  /** Read or seed the rating row for `(userId, mode)`. */
  async get(userId: bigint, mode: PvpMode): Promise<MmrSnapshot> {
    const row = await this.mysql.mmr.findUnique({
      where: { userId_mode: { userId, mode } },
    });
    if (row) {
      return {
        userId: row.userId,
        mode: toMode(row.mode),
        rating: row.mmr,
        rd: row.rd,
        volatility: row.volatility,
        peakMmr: row.peakMmr,
        seasonGames: row.seasonGames,
        seasonWins: row.seasonWins,
        updatedAt: row.updatedAt,
      };
    }
    return {
      userId,
      mode,
      rating: DEFAULT_RATING.rating,
      rd: DEFAULT_RATING.rd,
      volatility: DEFAULT_RATING.volatility,
      peakMmr: DEFAULT_RATING.rating,
      seasonGames: 0,
      seasonWins: 0,
      updatedAt: new Date(),
    };
  }

  /**
   * 1v1 result writer. Computes Glicko-2 updates for both sides and
   * persists into both `mmr` (per-mode) and `pvp_match_players.mmrAfter`
   * inside a single transaction. `winnerUserId === null` is treated as a
   * draw. Returns the per-player deltas for downstream broadcasting.
   */
  async applyMatchResult(params: {
    readonly matchId: bigint;
    readonly mode: PvpMode;
    readonly playerA: bigint;
    readonly playerB: bigint;
    readonly winnerUserId: bigint | null;
  }): Promise<readonly MmrDelta[]> {
    const [a, b] = await Promise.all([
      this.get(params.playerA, params.mode),
      this.get(params.playerB, params.mode),
    ]);

    const scoreA: 0 | 0.5 | 1 =
      params.winnerUserId === null ? 0.5 : params.winnerUserId === params.playerA ? 1 : 0;
    const scoreB: 0 | 0.5 | 1 =
      params.winnerUserId === null ? 0.5 : params.winnerUserId === params.playerB ? 1 : 0;

    const aAfter = glicko2Single(a, b, scoreA);
    const bAfter = glicko2Single(b, a, scoreB);

    const resultA: PvpMatchResult = scoreA === 1 ? "win" : scoreA === 0 ? "loss" : "draw";
    const resultB: PvpMatchResult = scoreB === 1 ? "win" : scoreB === 0 ? "loss" : "draw";

    await this.mysql.$transaction(async (tx) => {
      for (const [snap, after, result] of [
        [a, aAfter, resultA] as const,
        [b, bAfter, resultB] as const,
      ]) {
        const peak = Math.max(snap.peakMmr, after.rating);
        const games = snap.seasonGames + 1;
        const wins = snap.seasonWins + (result === "win" ? 1 : 0);
        await tx.mmr.upsert({
          where: { userId_mode: { userId: snap.userId, mode: snap.mode } },
          create: {
            userId: snap.userId,
            mode: snap.mode,
            mmr: after.rating,
            rd: after.rd,
            volatility: after.volatility,
            peakMmr: peak,
            seasonGames: games,
            seasonWins: wins,
          },
          update: {
            mmr: after.rating,
            rd: after.rd,
            volatility: after.volatility,
            peakMmr: peak,
            seasonGames: games,
            seasonWins: wins,
          },
        });
        await tx.pvpMatchPlayer.update({
          where: { matchId_userId: { matchId: params.matchId, userId: snap.userId } },
          data: { mmrAfter: after.rating },
        });
      }
    });

    await audit.write({
      actor: params.winnerUserId ?? params.playerA,
      action: "pvp.mmr.update",
      targetType: "pvpMatch",
      targetId: params.matchId,
      payload: {
        a: { userId: params.playerA.toString(), before: a.rating, after: aAfter.rating },
        b: { userId: params.playerB.toString(), before: b.rating, after: bAfter.rating },
      },
      ip: null,
      userAgent: null,
    });

    return [
      { userId: params.playerA, before: a, after: aAfter, result: resultA },
      { userId: params.playerB, before: b, after: bAfter, result: resultB },
    ];
  }
}
