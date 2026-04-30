// Aetheria — root tRPC router.
//
// Phases 4-B onward will mount real sub-routers here (auth, account, world,
// save, combat, roster, inventory, quests, social, pvp, lb, shop, admin).
// For now only `health` is mounted so the api can boot and the web client
// can verify the round trip.

import { router } from "./trpc.js";
import { healthRouter } from "./routers/health.js";

export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
