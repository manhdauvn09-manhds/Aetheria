// Aetheria — weekly quest reset.

import type { JobDefinition } from "./types.js";

export const weeklyResetJob: JobDefinition = {
  name: "cron.weeklyReset",
  intervalMs: 7 * 24 * 60 * 60 * 1000,
  lockTtlMs: 5 * 60 * 1000,
  run: async (ctx): Promise<void> => {
    const result = await ctx.mysql.userQuest.updateMany({
      where: { quest: { type: "weekly" } },
      data: {
        progress: {} as never,
        status: "active",
        claimedAt: null,
      },
    });
    ctx.log.info({ resetCount: result.count }, "weeklyReset complete");
  },
};
