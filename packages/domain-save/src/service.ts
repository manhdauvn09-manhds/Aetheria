// Aetheria — SaveService.
//
// 4 slots per user (slot 0 = autosave, 1..3 = manual). Each row carries an
// opaque JSON `payload` and an integer `schema_version` for optimistic
// concurrency. Storage is the shared MySQL `save_states` table keyed by
// (userId, slot) — previously per-user SQLite, consolidated in the 1-DB
// migration so the dual-DB sync infrastructure could be removed.
//
// API surface:
//   - snapshot({slot, payload, schemaVersion})   write any slot (manual save)
//   - autosaveTick({payload, schemaVersion})     write slot 0 with throttle
//   - list()                                     summaries (no payloads)
//   - load({slot})                               full payload
//   - delete({slot})                             remove a slot
//   - reconcile({slot, expectedVersion, payload}) optimistic concurrency
//
// Optimistic concurrency: snapshot bumps `schema_version` on every write.
// Clients that hold a stale version call `reconcile` with the version they
// last saw; if the server's row has moved on, the call returns
// `STALE_VERSION` and the client must refetch + re-merge.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

export const MAX_SLOT = 3;
export const AUTOSAVE_SLOT = 0;
/** Default throttle for `autosaveTick`. Override per-deps for tests. */
export const DEFAULT_AUTOSAVE_THROTTLE_MS = 5_000;
/** Hard cap on payload size, applied after JSON-stringify. 256 KiB. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

export type SaveMysqlClient = Pick<MysqlClient, "saveState">;

export interface SaveDeps {
  readonly mysql: SaveMysqlClient;
  /** Override the autosave throttle window. */
  readonly autosaveThrottleMs?: number;
}

export interface SaveSlotSummary {
  readonly slot: number;
  readonly schemaVersion: number;
  readonly updatedAt: string; // ISO
  readonly payloadBytes: number;
}

export interface SaveSlotFull {
  readonly slot: number;
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SnapshotInput {
  readonly userId: bigint;
  readonly slot: number;
  readonly payload: Readonly<Record<string, unknown>>;
  /** If unset, the new row's `schema_version` is `prev + 1` (or 1). */
  readonly schemaVersion?: number;
}

export interface AutosaveTickInput {
  readonly userId: bigint;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly schemaVersion?: number;
}

export interface LoadInput {
  readonly userId: bigint;
  readonly slot: number;
}

export interface DeleteInput {
  readonly userId: bigint;
  readonly slot: number;
}

export interface ReconcileInput {
  readonly userId: bigint;
  readonly slot: number;
  /** The schema_version the client last observed. */
  readonly expectedVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ReconcileOk {
  readonly status: "ok";
  readonly slot: number;
  readonly schemaVersion: number;
  readonly updatedAt: string;
}

export interface ReconcileStale {
  readonly status: "stale";
  readonly slot: number;
  readonly server: SaveSlotFull;
}

export type ReconcileResult = ReconcileOk | ReconcileStale;

export class SaveService {
  private readonly throttleMs: number;
  /** userId → epoch ms of the last accepted autosave write. */
  private readonly lastAutosaveAt = new Map<string, number>();

  constructor(private readonly deps: SaveDeps) {
    this.throttleMs = deps.autosaveThrottleMs ?? DEFAULT_AUTOSAVE_THROTTLE_MS;
  }

  // ── Public API ─────────────────────────────────────────────────────

  async snapshot(input: SnapshotInput): Promise<SaveSlotSummary> {
    assertSlot(input.slot);
    const row = await this.upsertSlot(input.userId, input.slot, input.payload, input.schemaVersion);
    await audit.write({
      actor: input.userId,
      action: "save.snapshot",
      targetType: "save_state",
      targetId: BigInt(input.slot),
      payload: { slot: input.slot, schemaVersion: row.schemaVersion },
    });
    return row;
  }

  async autosaveTick(
    input: AutosaveTickInput,
  ): Promise<SaveSlotSummary | { skipped: true; nextEligibleAt: string }> {
    const key = input.userId.toString();
    const now = Date.now();
    const last = this.lastAutosaveAt.get(key) ?? 0;
    const elapsed = now - last;
    if (elapsed < this.throttleMs) {
      return {
        skipped: true,
        nextEligibleAt: new Date(last + this.throttleMs).toISOString(),
      };
    }
    this.lastAutosaveAt.set(key, now);

    const row = await this.upsertSlot(input.userId, AUTOSAVE_SLOT, input.payload, input.schemaVersion);
    return row;
  }

  async list(userId: bigint): Promise<readonly SaveSlotSummary[]> {
    const rows = await this.deps.mysql.saveState.findMany({
      where: { userId },
      orderBy: { slot: "asc" },
      select: {
        slot: true,
        schemaVersion: true,
        updatedAt: true,
        payload: true,
      },
    });
    return rows.map((r) => {
      const json = JSON.stringify(r.payload ?? {});
      return {
        slot: r.slot,
        schemaVersion: r.schemaVersion,
        updatedAt: r.updatedAt.toISOString(),
        payloadBytes: Buffer.byteLength(json, "utf8"),
      };
    });
  }

  async load(input: LoadInput): Promise<SaveSlotFull> {
    assertSlot(input.slot);
    const row = await this.fetchSlot(input.userId, input.slot);
    if (!row) throw AppError.notFound("save_state", input.slot);
    return row;
  }

  async delete(input: DeleteInput): Promise<{ ok: true }> {
    assertSlot(input.slot);
    const result = await this.deps.mysql.saveState.deleteMany({
      where: { userId: input.userId, slot: input.slot },
    });
    if (result.count === 0) throw AppError.notFound("save_state", input.slot);
    await audit.write({
      actor: input.userId,
      action: "save.delete",
      targetType: "save_state",
      targetId: BigInt(input.slot),
      payload: { slot: input.slot },
    });
    return { ok: true };
  }

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    assertSlot(input.slot);
    const current = await this.fetchSlot(input.userId, input.slot);
    if (current && current.schemaVersion !== input.expectedVersion) {
      return { status: "stale", slot: input.slot, server: current };
    }
    const next = (current?.schemaVersion ?? 0) + 1;
    const row = await this.upsertSlot(input.userId, input.slot, input.payload, next);
    await audit.write({
      actor: input.userId,
      action: "save.reconcile",
      targetType: "save_state",
      targetId: BigInt(input.slot),
      payload: {
        slot: input.slot,
        expected: input.expectedVersion,
        next,
      },
    });
    return {
      status: "ok",
      slot: row.slot,
      schemaVersion: row.schemaVersion,
      updatedAt: row.updatedAt,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async upsertSlot(
    userId: bigint,
    slot: number,
    payload: Readonly<Record<string, unknown>>,
    explicitVersion: number | undefined,
  ): Promise<SaveSlotSummary> {
    // Size check uses JSON byte length — the same value we'll report back
    // as `payloadBytes`. Prisma stores the column natively as JSON, but the
    // wire size is what we cap so a misbehaving client can't write 4 MiB.
    const json = JSON.stringify(payload);
    const bytes = Buffer.byteLength(json, "utf8");
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw AppError.badRequest("Save payload exceeds 256 KiB", { field: "payload" });
    }

    let nextVersion = explicitVersion;
    if (nextVersion === undefined) {
      const existing = await this.deps.mysql.saveState.findUnique({
        where: { userId_slot: { userId, slot } },
        select: { schemaVersion: true },
      });
      nextVersion = (existing?.schemaVersion ?? 0) + 1;
    }

    const row = await this.deps.mysql.saveState.upsert({
      where: { userId_slot: { userId, slot } },
      create: {
        userId,
        slot,
        payload: payload as MysqlPrisma.Prisma.InputJsonValue,
        schemaVersion: nextVersion,
      },
      update: {
        payload: payload as MysqlPrisma.Prisma.InputJsonValue,
        schemaVersion: nextVersion,
      },
      select: { slot: true, schemaVersion: true, updatedAt: true },
    });

    return {
      slot: row.slot,
      schemaVersion: row.schemaVersion,
      updatedAt: row.updatedAt.toISOString(),
      payloadBytes: bytes,
    };
  }

  private async fetchSlot(userId: bigint, slot: number): Promise<SaveSlotFull | null> {
    const row = await this.deps.mysql.saveState.findUnique({
      where: { userId_slot: { userId, slot } },
      select: { slot: true, payload: true, schemaVersion: true, updatedAt: true },
    });
    if (!row) return null;
    const payload = row.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw AppError.internal("Save payload is not an object");
    }
    return {
      slot: row.slot,
      schemaVersion: row.schemaVersion,
      updatedAt: row.updatedAt.toISOString(),
      payload: payload as Readonly<Record<string, unknown>>,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

const assertSlot = (slot: number): void => {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) {
    throw AppError.badRequest("Invalid save slot", { slot, min: 0, max: MAX_SLOT });
  }
};
