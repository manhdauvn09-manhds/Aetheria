// Aetheria — TelemetryService.
//
// Stores events as `audit_log` rows with `action = "telemetry.<event>"`
// so we don't need a new table. The audit pipeline already has indexes
// + retention; analytics can scrape it.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";

import { isKnownEvent, isPayloadShallow, MAX_BATCH } from "./rules.js";

export interface TelemetryEvent {
  readonly event: string;
  readonly payload?: Record<string, string | number | boolean | null> | undefined;
  readonly occurredAt?: string | undefined;
}

export interface RecordBatchInput {
  readonly userId: bigint | null;
  readonly events: readonly TelemetryEvent[];
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export class TelemetryService {
  // No DB dep beyond the shared `audit` writer; nothing to inject yet.

  async record(input: RecordBatchInput): Promise<{ accepted: number; dropped: number }> {
    if (input.events.length === 0) return { accepted: 0, dropped: 0 };
    if (input.events.length > MAX_BATCH) {
      throw AppError.badRequest(`Batch too large (max ${MAX_BATCH.toString()})`);
    }
    let accepted = 0;
    let dropped = 0;
    for (const e of input.events) {
      if (!isKnownEvent(e.event)) {
        dropped += 1;
        continue;
      }
      if (!isPayloadShallow(e.payload ?? {})) {
        dropped += 1;
        continue;
      }
      await audit.write({
        actor: input.userId,
        action: `telemetry.${e.event}`,
        targetType: "telemetry",
        targetId: null,
        payload: { ...(e.payload ?? {}), occurredAt: e.occurredAt ?? null },
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      accepted += 1;
    }
    return { accepted, dropped };
  }
}
