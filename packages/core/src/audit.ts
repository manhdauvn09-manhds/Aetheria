// Aetheria — audit log writer.
//
// Every privileged op (currency change, ban, role change, admin action,
// shop purchase, …) writes one row to MySQL `audit_log`. A failed write
// is retried with exponential backoff before the entry is dropped to
// stderr in a structured form ops can scrape.
//
// Auditing must never fail the originating request, but evidence loss is
// itself a finding — silent swallow has been replaced with a bounded
// retry queue + alert hook.

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

/**
 * Pluggable alert sink for audit-write failures that exhaust their
 * retries. Default is a structured stderr line; production should swap
 * in a Sentry / OpenTelemetry hook so dropped audits page the on-call.
 */
export type AuditAlertHook = (entry: {
  readonly action: string;
  readonly attempts: number;
  readonly error: unknown;
  readonly payload: Readonly<Record<string, unknown>>;
}) => void;

const defaultAlert: AuditAlertHook = (e) => {
  console.error("[audit] dropped after retries", {
    action: e.action,
    attempts: e.attempts,
    error: e.error instanceof Error ? e.error.message : String(e.error),
  });
};

let alertHook: AuditAlertHook = defaultAlert;
export const setAuditAlertHook = (hook: AuditAlertHook): void => {
  alertHook = hook;
};

const toBigIntOrNull = (v: bigint | null | undefined): bigint | null => v ?? null;

const MAX_ATTEMPTS = 4;
// Exponential backoff: 50ms, 200ms, 800ms, 3.2s.
const backoffMs = (attempt: number): number => 50 * 4 ** (attempt - 1);

/**
 * Cap on background retries currently in flight. Without a ceiling a
 * sustained MySQL outage would queue one retry per privileged op until
 * the heap blows up; once we hit the cap we drop new failures with the
 * alert hook so ops still notice. Override via AETHERIA_AUDIT_MAX_INFLIGHT.
 */
const MAX_INFLIGHT_RETRIES = Number(
  process.env["AETHERIA_AUDIT_MAX_INFLIGHT"] ?? "100",
);

let inflightRetries = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t === "object" && t !== null && "unref" in t && typeof t.unref === "function") {
      t.unref();
    }
  });

const writeOnce = async (input: AuditWriteInput): Promise<void> => {
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
};

/** Background retry loop. `firstError` is the rejection from attempt #1. */
const retryAfterFirstFail = async (
  input: AuditWriteInput,
  firstError: unknown,
): Promise<void> => {
  let lastErr: unknown = firstError;
  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(backoffMs(attempt - 1));
    try {
      await writeOnce(input);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  alertHook({
    action: input.action,
    attempts: MAX_ATTEMPTS,
    error: lastErr,
    payload: input.payload,
  });
};

export const audit = {
  /**
   * Fire-and-forget audit write. Returns once the first attempt resolves
   * or rejects; subsequent retries run on the background queue so the
   * caller never waits past the first attempt's latency budget. Failures
   * after exhaustion route through the alert hook.
   */
  async write(input: AuditWriteInput): Promise<void> {
    try {
      await writeOnce(input);
    } catch (firstError) {
      // First attempt failed. Kick off background retries unless the
      // queue is already saturated — under a sustained outage we shed
      // load here rather than building an unbounded backlog.
      if (inflightRetries >= MAX_INFLIGHT_RETRIES) {
        alertHook({
          action: input.action,
          attempts: 1,
          error: new Error(
            `audit retry queue saturated (>=${String(MAX_INFLIGHT_RETRIES)} in flight); dropping`,
          ),
          payload: input.payload,
        });
        return;
      }
      inflightRetries++;
      void retryAfterFirstFail(input, firstError)
        .catch(() => {
          // retryAfterFirstFail already routes its own failures to alertHook;
          // suppress any leaked rejection so the unhandled-rejection guard
          // doesn't fire.
        })
        .finally(() => {
          inflightRetries--;
        });
    }
  },
};
