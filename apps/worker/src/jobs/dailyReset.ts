// Aetheria — daily quest reset.
//
// Wipes progress + status on every `daily`-kind UserQuest row so the
// next day starts fresh. Idempotent: reapplying the same reset over an
// already-zeroed row is a no-op (`status="active"` and `progress={count:0}`).
//
// Schedule: every 24 h (cron-aligned firing is a follow-up; this runs
// on `interval` semantics per the 4.53 scheduler).

import type { JobDefinition } from "./types.js";

export const dailyResetJob: JobDefinition = {
  name: "cron.dailyReset",
  intervalMs: 24 * 60 * 60 * 1000,
  lockTtlMs: 5 * 60 * 1000,
  run: async (ctx): Promise<void> => {
    const result = await ctx.mysql.userQuest.updateMany({
      where: { quest: { type: "daily" } },
      data: {
        progress: {} as never,
        status: "active",
        claimedAt: null,
      },
    });
    ctx.log.info({ resetCount: result.count }, "dailyReset complete");
  },
};
