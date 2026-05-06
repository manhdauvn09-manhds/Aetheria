// Aetheria — telemetry tRPC router.
//
// `event` is `publicProcedure` (signup-funnel events fire before login)
// but the actor is read from `ctx.auth?.userId` when available so authed
// events still link to a user.

import { z } from "zod";

import {
  asTrpcError,
  publicProcedure,
  router,
} from "@aetheria/schema-api/trpc";

import type { TelemetryService } from "./service.js";

const eventSchema = z.object({
  event: z.string().min(1).max(64),
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  occurredAt: z.string().min(1).max(40).optional(),
});

export const createTelemetryRouter = (service: TelemetryService) =>
  router({
    event: publicProcedure
      .input(z.object({ events: z.array(eventSchema).min(1).max(50) }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await service.record({
            userId: ctx.auth?.userId ?? null,
            events: input.events,
            ip: ctx.request.ip ?? null,
            userAgent: ctx.request.userAgent ?? null,
          });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type TelemetryRouter = ReturnType<typeof createTelemetryRouter>;
