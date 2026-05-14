// Aetheria — PvP season reset.
//
// Marks the end of the current MMR season by zeroing the per-mode
// `seasonGames` + `seasonWins` counters. The rating itself is **not**
// touched here — Glicko-2 carries over with RD inflation handled by
// the no-games branch in `glicko2Update`.
//
// Tick cadence: every 30 days. The actual end-date is data-driven —
// production should run this from a `BattlePassSeason.endsAt < now`
// trigger, but for the MVP we fire on a fixed cadence.

import { audit } from "@aetheria/core";

import type { JobDefinition } from "./types.js";

export const seasonResetJob: JobDefinition = {
  name: "cron.seasonReset",
  intervalMs: 30 * 24 * 60 * 60 * 1000,
  lockTtlMs: 5 * 60 * 1000,
  timeoutMs: 4 * 60 * 1000,
  run: async (ctx): Promise<void> => {
    const result = await ctx.mysql.mmr.updateMany({
      where: {},
      data: { seasonGames: 0, seasonWins: 0 },
    });
    ctx.log.info({ resetRows: result.count }, "seasonReset complete");
    // B14: audit destructive cron ops with a system actor (null).
    await audit.write({
      actor: null,
      action: "cron.seasonReset",
      targetType: "mmr",
      payload: { resetRows: result.count },
    });
  },
};
