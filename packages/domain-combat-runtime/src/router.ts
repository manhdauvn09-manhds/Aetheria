// Aetheria — combat tRPC router (factory).
//
// Three protected procedures:
//   - combat.start         (mutation) build initial BattleState for a run
//   - combat.submitAction  (mutation) one validated action → updated state
//   - combat.replay        (query)    server-authoritative replay-hash check

import { z } from "zod";

import {
  asTrpcError,
  protectedProcedure,
  router,
} from "@aetheria/schema-api/trpc";
import { jsonValue } from "@aetheria/schema-api/zod";

import type { CombatRunService } from "./service.js";

const runIdInput = z.object({
  runId: z
    .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => (typeof v === "bigint" ? v : BigInt(v))),
});

const coordSchema = z.object({ q: z.number().int(), r: z.number().int() });

const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("move"),
    actorId: z.string().min(1).max(64),
    path: z.array(coordSchema).min(1).max(32),
  }),
  z.object({
    kind: z.literal("attack"),
    actorId: z.string().min(1).max(64),
    targetId: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal("use_skill"),
    actorId: z.string().min(1).max(64),
    skillId: z.string().min(1).max(64),
    target: z
      .union([z.string().min(1).max(64), coordSchema])
      .optional(),
  }),
  z.object({
    kind: z.literal("defend"),
    actorId: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal("end_turn"),
    actorId: z.string().min(1).max(64),
  }),
]);

const submitInput = runIdInput.extend({
  action: actionSchema,
});

void jsonValue; // jsonValue is reserved for future skill payloads

export const createCombatRouter = (service: CombatRunService) =>
  router({
    start: protectedProcedure
      .input(runIdInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service.start({ userId: ctx.auth.userId, runId: input.runId });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    submitAction: protectedProcedure
      .input(submitInput)
      .mutation(async ({ ctx, input }) => {
        try {
          // Rebuild action without `target: undefined` so the engine's
          // exactOptionalPropertyTypes-strict UseSkillAction accepts it.
          const a = input.action;
          const action =
            a.kind === "use_skill"
              ? a.target !== undefined
                ? {
                    kind: "use_skill" as const,
                    actorId: a.actorId,
                    skillId: a.skillId,
                    target: a.target,
                  }
                : {
                    kind: "use_skill" as const,
                    actorId: a.actorId,
                    skillId: a.skillId,
                  }
              : a;
          return await service.submitAction(
            { userId: ctx.auth.userId, runId: input.runId },
            action,
          );
        } catch (e) {
          throw asTrpcError(e);
        }
      }),

    replay: protectedProcedure
      .input(runIdInput)
      .query(async ({ ctx, input }) => {
        try {
          return await service.replay({ userId: ctx.auth.userId, runId: input.runId });
        } catch (e) {
          throw asTrpcError(e);
        }
      }),
  });

export type CombatRouter = ReturnType<typeof createCombatRouter>;
