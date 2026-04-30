// Aetheria — SaveService.
//
// Per-user SQLite holds 4 slots (PK 0..3): slot 0 = autosave, slots 1..3
// = manual saves. Each row carries an opaque JSON `payload`, an integer
// `schema_version`, and a `dirty` flag the sync engine drains.
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
import type { SqliteClient } from "@aetheria/schema-db";
import { applyInitSchema, sqliteFor } from "@aetheria/schema-db";

export const MAX_SLOT = 3;
export const AUTOSAVE_SLOT = 0;
/** Default throttle for `autosaveTick`. Override per-deps for tests. */
export const DEFAULT_AUTOSAVE_THROTTLE_MS = 5_000;
/** Hard cap on payload size, applied after JSON-stringify. 256 KiB. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

export interface SaveDeps {
  /** Override the per-user SQLite resolver. Tests stub this. */
  readonly sqliteFor?: (userId: bigint) => Promise<SqliteClient>;
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
  private readonly openSqlite: (userId: bigint) => Promise<SqliteClient>;
  private readonly throttleMs: number;
  private readonly schemaApplied = new Set<string>();
  /** userId → epoch ms of the last accepted autosave write. */
  private readonly lastAutosaveAt = new Map<string, number>();

  constructor(deps: SaveDeps = {}) {
    this.openSqlite = deps.sqliteFor ?? ((id) => sqliteFor(id));
    this.throttleMs = deps.autosaveThrottleMs ?? DEFAULT_AUTOSAVE_THROTTLE_MS;
  }

  // ── Public API ─────────────────────────────────────────────────────

  async snapshot(input: SnapshotInput): Promise<SaveSlotSummary> {
    assertSlot(input.slot);
    const db = await this.openUserDb(input.userId);
    const row = await this.upsertSlot(db, input.slot, input.payload, input.schemaVersion);
    await audit.write({
      actor: input.userId,
      action: "save.snapshot",
      targetType: "save_state",
      targetId: BigInt(input.slot),
      payload: { slot: input.slot, schemaVersion: row.schemaVersion },
    });
    return row;
  }

  async autosaveTick(input: AutosaveTickInput): Promise<SaveSlotSummary | { skipped: true; nextEligibleAt: string }> {
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

    const db = await this.openUserDb(input.userId);
    const row = await this.upsertSlot(db, AUTOSAVE_SLOT, input.payload, input.schemaVersion);
    return row;
  }

  async list(userId: bigint): Promise<readonly SaveSlotSummary[]> {
    const db = await this.openUserDb(userId);
    const rows = await db.$queryRawUnsafe<RawSummary[]>(
      `SELECT slot, schema_version, updated_at, length(payload) AS payload_bytes
         FROM save_states
        ORDER BY slot ASC`,
    );
    return rows.map((r) => ({
      slot: Number(r.slot),
      schemaVersion: Number(r.schema_version),
      updatedAt: r.updated_at,
      payloadBytes: Number(r.payload_bytes),
    }));
  }

  async load(input: LoadInput): Promise<SaveSlotFull> {
    assertSlot(input.slot);
    const db = await this.openUserDb(input.userId);
    const row = await this.fetchSlot(db, input.slot);
    if (!row) throw AppError.notFound("save_state", input.slot);
    return row;
  }

  async delete(input: DeleteInput): Promise<{ ok: true }> {
    assertSlot(input.slot);
    const db = await this.openUserDb(input.userId);
    const affected = await db.$executeRawUnsafe(
      `DELETE FROM save_states WHERE slot = ?`,
      input.slot,
    );
    if (affected === 0) throw AppError.notFound("save_state", input.slot);
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
    const db = await this.openUserDb(input.userId);
    const current = await this.fetchSlot(db, input.slot);
    if (current && current.schemaVersion !== input.expectedVersion) {
      return { status: "stale", slot: input.slot, server: current };
    }
    const next = (current?.schemaVersion ?? 0) + 1;
    const row = await this.upsertSlot(db, input.slot, input.payload, next);
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

  private async openUserDb(userId: bigint): Promise<SqliteClient> {
    const db = await this.openSqlite(userId);
    const key = userId.toString();
    if (!this.schemaApplied.has(key)) {
      await applyInitSchema(db);
      this.schemaApplied.add(key);
    }
    return db;
  }

  private async upsertSlot(
    db: SqliteClient,
    slot: number,
    payload: Readonly<Record<string, unknown>>,
    explicitVersion: number | undefined,
  ): Promise<SaveSlotSummary> {
    const json = JSON.stringify(payload);
    if (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES) {
      throw AppError.badRequest("Save payload exceeds 256 KiB", { field: "payload" });
    }
    const updatedAt = new Date().toISOString();

    let nextVersion = explicitVersion;
    if (nextVersion === undefined) {
      const existing = await db.$queryRawUnsafe<{ schema_version: number | bigint }[]>(
        `SELECT schema_version FROM save_states WHERE slot = ? LIMIT 1`,
        slot,
      );
      const prev = existing[0]?.schema_version ?? 0;
      nextVersion = Number(prev) + 1;
    }

    await db.$executeRawUnsafe(
      `INSERT INTO save_states (slot, payload, schema_version, updated_at, dirty)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(slot) DO UPDATE SET
         payload        = excluded.payload,
         schema_version = excluded.schema_version,
         updated_at     = excluded.updated_at,
         dirty          = 1`,
      slot,
      json,
      nextVersion,
      updatedAt,
    );
    return {
      slot,
      schemaVersion: nextVersion,
      updatedAt,
      payloadBytes: Buffer.byteLength(json, "utf8"),
    };
  }

  private async fetchSlot(db: SqliteClient, slot: number): Promise<SaveSlotFull | null> {
    const rows = await db.$queryRawUnsafe<RawFull[]>(
      `SELECT slot, payload, schema_version, updated_at FROM save_states WHERE slot = ? LIMIT 1`,
      slot,
    );
    const row = rows[0];
    if (!row) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      throw AppError.internal("Save payload is corrupted JSON");
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw AppError.internal("Save payload is not an object");
    }
    return {
      slot: Number(row.slot),
      schemaVersion: Number(row.schema_version),
      updatedAt: row.updated_at,
      payload: parsed as Readonly<Record<string, unknown>>,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

const assertSlot = (slot: number): void => {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) {
    throw AppError.badRequest("Invalid save slot", { slot, min: 0, max: MAX_SLOT });
  }
};

interface RawSummary {
  slot: number | bigint;
  schema_version: number | bigint;
  updated_at: string;
  payload_bytes: number | bigint;
}

interface RawFull {
  slot: number | bigint;
  payload: string;
  schema_version: number | bigint;
  updated_at: string;
}
