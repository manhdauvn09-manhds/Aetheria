// Aetheria — weekly guild raid scheduler.
//
// MVP scope: write one audit entry per active guild advertising the
// upcoming raid window so admins / clients can hydrate from the trail.
// Real raid lifecycle (boss spawn, damage tracking, rewards) is a
// downstream feature; this job is the scheduling tick that gates it.

import { audit } from "@aetheria/core";

import type { JobDefinition } from "./types.js";

export const guildRaidSchedulerJob: JobDefinition = {
  name: "worker.guildRaidScheduler",
  intervalMs: 7 * 24 * 60 * 60 * 1000,
  lockTtlMs: 10 * 60 * 1000,
  run: async (ctx): Promise<void> => {
    const guilds = await ctx.mysql.guild.findMany({
      select: { id: true, leaderUserId: true },
    });
    let announced = 0;
    const weekStart = new Date(ctx.now);
    weekStart.setUTCHours(0, 0, 0, 0);
    for (const g of guilds) {
      await audit.write({
        actor: g.leaderUserId,
        action: "guild.raid.scheduled",
        targetType: "guild",
        targetId: g.id,
        payload: {
          weekStart: weekStart.toISOString(),
          // 1-week window; downstream raid flow consumes this hint.
          windowMs: 7 * 24 * 60 * 60 * 1000,
        },
        ip: null,
        userAgent: null,
      });
      announced += 1;
    }
    ctx.log.info({ announced }, "guildRaidScheduler complete");
  },
};
