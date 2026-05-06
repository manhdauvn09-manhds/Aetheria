import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aetheria/core", () => ({
  audit: { write: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@aetheria/schema-db", () => ({
  applyInitSchema: vi.fn().mockResolvedValue(undefined),
  sqliteFor:       vi.fn(),
}));

import { stringifyState } from "@aetheria/domain-combat";

import { CombatRunService } from "../service.js";

// ── helpers ───────────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>;

const LEVEL_ROW = { id: 1, level_number: 1, name: "Tutorial" };

/** Minimal in-progress run row with no snapshot yet. */
const PENDING_RUN: DbRow = {
  id:         1,
  level_id:   1,
  status:     "in_progress",
  action_log: "[]",
  snapshot:   null,
};

function makeDb(rows: { runs?: DbRow[]; levels?: DbRow[] } = {}) {
  const runRows   = rows.runs   ?? [PENDING_RUN];
  const levelRows = rows.levels ?? [LEVEL_ROW];
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRawUnsafe:   vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM runs"))   return Promise.resolve(runRows);
      if (sql.includes("FROM levels")) return Promise.resolve(levelRows);
      return Promise.resolve([]);
    }),
  };
}

// ── CombatRunService.start ────────────────────────────────────────────────

describe("CombatRunService.start", () => {
  it("creates a battle state and persists snapshot", async () => {
    const db  = makeDb();
    const svc = new CombatRunService({ sqliteFor: () => Promise.resolve(db as never) });
    const result = await svc.start({ userId: 1n, runId: 1n });

    expect(result.state.battleId).toBe("run-1");
    expect(result.state.phase).toMatch(/player_turn|enemy_turn/);
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE runs"),
      expect.any(String),
      1,
    );
  });

  it("throws invalidAction when run is not in_progress", async () => {
    const db = makeDb({ runs: [{ ...PENDING_RUN, status: "completed", snapshot: '{"x":1}' }] });
    const svc = new CombatRunService({ sqliteFor: () => Promise.resolve(db as never) });
    await expect(svc.start({ userId: 1n, runId: 1n })).rejects.toThrow("in progress");
  });

  it("throws not-found when run row is missing", async () => {
    const db = makeDb({ runs: [] });
    const svc = new CombatRunService({ sqliteFor: () => Promise.resolve(db as never) });
    await expect(svc.start({ userId: 1n, runId: 99n })).rejects.toThrow();
  });
});

// ── CombatRunService.submitAction ─────────────────────────────────────────

describe("CombatRunService.submitAction", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: CombatRunService;

  beforeEach(async () => {
    db  = makeDb();
    svc = new CombatRunService({ sqliteFor: () => Promise.resolve(db as never) });
    // Seed a real snapshot by calling start() first.
    const { state } = await svc.start({ userId: 1n, runId: 1n });
    const snapshot   = stringifyState(state);
    // Update the db mock so subsequent queries return the seeded snapshot.
    db.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("FROM runs"))
        return Promise.resolve([{ ...PENDING_RUN, snapshot, action_log: "[]" }]);
      if (sql.includes("FROM levels"))
        return Promise.resolve([LEVEL_ROW]);
      return Promise.resolve([]);
    });
  });

  it("applies end_turn and returns updated state", async () => {
    const result = await svc.submitAction({ userId: 1n, runId: 1n }, {
      kind:    "end_turn",
      actorId: "hero",
    });
    expect(result.state).toBeDefined();
    expect(["in_progress", "completed", "failed"]).toContain(result.runStatus);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2); // start + submit
  });

  it("appends action to log on each submit", async () => {
    await svc.submitAction({ userId: 1n, runId: 1n }, { kind: "end_turn", actorId: "hero" });
    const call = db.$executeRawUnsafe.mock.calls.at(-1);
    const logArg: unknown = call?.[2];
    const log = JSON.parse(String(logArg)) as unknown[];
    expect(log).toHaveLength(1);
    expect((log[0] as { kind: string }).kind).toBe("end_turn");
  });

  it("throws invalidAction when run is not in_progress", async () => {
    db.$queryRawUnsafe.mockResolvedValue([{ ...PENDING_RUN, status: "completed", snapshot: null }]);
    await expect(
      svc.submitAction({ userId: 1n, runId: 1n }, { kind: "end_turn", actorId: "hero" }),
    ).rejects.toThrow("in progress");
  });

  it("throws invalidAction for an illegal move (no snapshot)", async () => {
    db.$queryRawUnsafe.mockResolvedValue([{ ...PENDING_RUN, snapshot: null }]);
    await expect(
      svc.submitAction({ userId: 1n, runId: 1n }, { kind: "end_turn", actorId: "hero" }),
    ).rejects.toThrow();
  });
});

// ── CombatRunService.replay ───────────────────────────────────────────────

describe("CombatRunService.replay", () => {
  it("returns ok=true when snapshot matches replay", async () => {
    const db  = makeDb();
    const svc = new CombatRunService({ sqliteFor: () => Promise.resolve(db as never) });
    // Start builds a snapshot from scratch.
    const { state } = await svc.start({ userId: 1n, runId: 1n });
    const snapshot   = stringifyState(state);

    db.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("FROM runs"))
        return Promise.resolve([{ ...PENDING_RUN, snapshot, action_log: "[]" }]);
      if (sql.includes("FROM levels"))
        return Promise.resolve([LEVEL_ROW]);
      return Promise.resolve([]);
    });

    const result = await svc.replay({ userId: 1n, runId: 1n });
    expect(result.ok).toBe(true);
    expect(result.expected).toBe(result.actual);
  });

  it("returns ok=false when snapshot is tampered", async () => {
    const db  = makeDb();
    const svc = new CombatRunService({ sqliteFor: () => Promise.resolve(db as never) });
    const { state } = await svc.start({ userId: 1n, runId: 1n });
    // Tamper: mutate hp inside the serialized envelope.
    const serial  = JSON.parse(stringifyState(state)) as { schemaVersion: number; state: { actors: { stats: { hp: number } }[] } };
    if (serial.state.actors[0]) serial.state.actors[0].stats.hp = 9999;
    const snapshot = JSON.stringify(serial);

    db.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("FROM runs"))
        return Promise.resolve([{ ...PENDING_RUN, snapshot, action_log: "[]" }]);
      if (sql.includes("FROM levels"))
        return Promise.resolve([LEVEL_ROW]);
      return Promise.resolve([]);
    });

    const result = await svc.replay({ userId: 1n, runId: 1n });
    expect(result.ok).toBe(false);
    expect(result.expected).not.toBe(result.actual);
  });
});
