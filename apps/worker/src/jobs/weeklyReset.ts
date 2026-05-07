// Aetheria — weekly quest reset.

import { audit } from "@aetheria/core";

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
    // B14: audit destructive cron ops with a system actor (null).
    await audit.write({
      actor: null,
      action: "cron.weeklyReset",
      targetType: "user_quest",
      payload: { resetCount: result.count, kind: "weekly" },
    });
  },
};
