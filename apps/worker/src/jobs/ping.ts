// Aetheria — placeholder ping job.
//
// Smoke-test wiring for 4.53. Logs a heartbeat every 60 s. Real jobs
// (dailyReset, lbSnapshot, anti-cheat, guildRaidScheduler) land in
// 4.54–4.57 and replace / sit alongside this entry.

import type { JobDefinition } from "./types.js";

export const pingJob: JobDefinition = {
  name: "ping",
  intervalMs: 60_000,
  lockTtlMs: 30_000,
  // eslint-disable-next-line @typescript-eslint/require-await
  run: async (ctx): Promise<void> => {
    ctx.log.info({ now: ctx.now.toISOString() }, "ping job heartbeat");
  },
};
