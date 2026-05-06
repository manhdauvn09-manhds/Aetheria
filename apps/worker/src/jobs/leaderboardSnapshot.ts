// Aetheria — hourly leaderboard snapshot.
//
// Reads the live Redis ZSET (`aetheria:lb:{mode}:{seasonId}`, score=MMR,
// member=userId) for each (mode, seasonId) pair and upserts the top-N
// rows into the durable `leaderboards` table. Idempotent: each row is
// keyed `(mode, seasonId, userId)` and overwrites prior snapshots.
//
// Without Redis: the job logs a warning and returns; durable rows from
// the previous snapshot remain visible.

import type { JobDefinition } from "./types.js";

const MODES = ["1v1", "3v3"] as const;
const SNAPSHOT_TOP_N = 100;

const seasonId = (): string => process.env.PVP_SEASON_ID ?? "1";

export const leaderboardSnapshotJob: JobDefinition = {
  name: "worker.leaderboardSnapshot",
  intervalMs: 60 * 60 * 1000,
  lockTtlMs: 5 * 60 * 1000,
  run: async (ctx): Promise<void> => {
    if (!ctx.redis) {
      ctx.log.warn("leaderboardSnapshot: REDIS_URL unset, skipping");
      return;
    }
    const season = seasonId();
    let totalUpserts = 0;
    for (const mode of MODES) {
      const key = `aetheria:lb:${mode}:${season}`;
      const raw = await ctx.redis.zrevrange(key, 0, SNAPSHOT_TOP_N - 1, "WITHSCORES");
      if (raw.length === 0) continue;

      const seasonBigInt = (() => {
        try {
          return BigInt(season);
        } catch {
          return 0n;
        }
      })();

      let rank = 0;
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const member = raw[i];
        const scoreRaw = raw[i + 1];
        if (member === undefined || scoreRaw === undefined) continue;
        const score = Number.parseInt(scoreRaw, 10);
        if (!Number.isFinite(score)) continue;
        let userId: bigint;
        try {
          userId = BigInt(member);
        } catch {
          continue;
        }
        rank += 1;
        await ctx.mysql.leaderboard.upsert({
          where: {
            mode_seasonId_userId: { mode, seasonId: seasonBigInt, userId },
          },
          create: { mode, seasonId: seasonBigInt, userId, rank, score },
          update: { rank, score, snapshotAt: ctx.now },
        });
        totalUpserts += 1;
      }
    }
    ctx.log.info({ totalUpserts }, "leaderboardSnapshot complete");
  },
};
