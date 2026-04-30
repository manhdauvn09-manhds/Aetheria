// Aetheria — health/ping router. Smoke-tests the whole tRPC stack
// (transformer, error formatter, context wiring) without depending on the DB.

import { z } from "zod";

import { publicProcedure, router } from "../trpc.js";

export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true as const,
    serverTime: new Date().toISOString(),
  })),

  echo: publicProcedure
    .input(z.object({ message: z.string().min(1).max(280) }))
    .query(({ input }) => ({ echoed: input.message })),

  whoami: publicProcedure.query(({ ctx }) => ({
    authenticated: ctx.auth !== null,
    userId: ctx.auth?.userId ?? null,
    requestId: ctx.request.requestId,
  })),
});
