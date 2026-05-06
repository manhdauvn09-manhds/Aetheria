// Aetheria — anti-cheat sweep.
//
// Pulls completed runs whose `score` claim is statistically improbable
// (more than `SCORE_OUTLIER_FACTOR`× the median for the same level) and
// writes an `audit_log` row for each suspect run. A real cheat
// adjudicator + replay-based verifier (per 4.26 `combat.replayActions`)
// is a follow-up — this sweep just surfaces candidates so operators can
// triage.

import { audit } from "@aetheria/core";

import { isOutlier, median } from "./stats.js";
import type { JobDefinition } from "./types.js";

const SCORE_OUTLIER_FACTOR = 3;
const SCAN_LOOKBACK_MS = 60 * 60 * 1000;
const PER_LEVEL_LIMIT = 200;

export const antiCheatScanJob: JobDefinition = {
  name: "worker.antiCheatScan",
  intervalMs: 60 * 60 * 1000,
  lockTtlMs: 10 * 60 * 1000,
  run: async (ctx): Promise<void> => {
    const since = new Date(ctx.now.getTime() - SCAN_LOOKBACK_MS);
    const recent = await ctx.mysql.run.findMany({
      where: { status: "completed", endedAt: { gte: since } },
      select: { id: true, userId: true, levelId: true, score: true },
      orderBy: { endedAt: "desc" },
      take: 5_000,
    });
    if (recent.length === 0) {
      ctx.log.debug("antiCheatScan: no recent completions");
      return;
    }

    // Group by level, compute medians, flag outliers.
    const byLevel = new Map<string, number[]>();
    for (const r of recent) {
      const key = r.levelId.toString();
      const arr = byLevel.get(key) ?? [];
      if (arr.length < PER_LEVEL_LIMIT) arr.push(r.score);
      byLevel.set(key, arr);
    }
    const medianMap = new Map<string, number>();
    for (const [levelKey, scores] of byLevel) {
      medianMap.set(levelKey, median(scores));
    }

    let flagged = 0;
    for (const r of recent) {
      const m = medianMap.get(r.levelId.toString()) ?? 0;
      if (isOutlier(r.score, m, SCORE_OUTLIER_FACTOR)) {
        flagged += 1;
        await audit.write({
          actor: r.userId,
          action: "antiCheat.scoreOutlier",
          targetType: "run",
          targetId: r.id,
          payload: {
            score: r.score,
            levelMedian: m,
            factor: r.score / m,
          },
          ip: null,
          userAgent: null,
        });
      }
    }
    ctx.log.info({ scanned: recent.length, flagged }, "antiCheatScan complete");
  },
};
