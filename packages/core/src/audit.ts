// Aetheria — audit log writer.
//
// Every privileged op (currency change, ban, role change, admin action,
// shop purchase, …) writes one row to MySQL `audit_log`. Errors are swallowed
// after being logged to stderr — auditing must never fail the originating
// request, but a missed audit must be visible in operator logs.

import { mysql, type MysqlPrisma } from "@aetheria/schema-db/mysql";
import type { UserId } from "@aetheria/shared-types";

export interface AuditWriteInput {
  /** Acting user. Omit for system-issued events (cron, worker). */
  readonly actor?: UserId | bigint | null;
  /** Verb, e.g. "user.banned", "shop.purchase". snake_case.dot.separated. */
  readonly action: string;
  /** Type of the affected entity, e.g. "user", "guild", "shop_item". */
  readonly targetType: string;
  /** Affected entity id, when applicable. */
  readonly targetId?: bigint | null;
  /** Free-form structured payload (request inputs, before/after diff, etc.). */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Caller IP, when available (Fastify request.ip). */
  readonly ip?: string | null;
  /** Caller User-Agent, when available. */
  readonly userAgent?: string | null;
}

const toBigIntOrNull = (v: bigint | null | undefined): bigint | null => v ?? null;

export const audit = {
  async write(input: AuditWriteInput): Promise<void> {
    try {
      await mysql.auditLog.create({
        data: {
          actorUserId: toBigIntOrNull(input.actor ?? null),
          action: input.action,
          targetType: input.targetType,
          targetId: toBigIntOrNull(input.targetId),
          payload: input.payload as MysqlPrisma.Prisma.InputJsonValue,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (e) {
      console.error("[audit] write failed", { action: input.action, error: e });
    }
  },
};
