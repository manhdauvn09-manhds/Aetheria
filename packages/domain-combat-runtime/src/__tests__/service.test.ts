import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aetheria/core", () => ({
  audit: { write: vi.fn().mockResolvedValue(undefined) },
}));

import { stringifyState } from "@aetheria/domain-combat";

import { CombatRunService } from "../service.js";

// ── helpers ───────────────────────────────────────────────────────────────

interface RunRow {
  id: bigint;
  levelId: bigint;
  status: string;
  actionLog: unknown;
  snapshot: unknown;
  level: { levelNumber: number; name: string };
}

const LEVEL = { levelNumber: 1, name: "Tutorial" };

const pendingRun = (overrides: Partial<RunRow> = {}): RunRow => ({
  id: 1n,
  levelId: 1n,
  status: "in_progress",
  actionLog: [],
  snapshot: null,
  level: LEVEL,
  ...overrides,
});

/** Minimal Prisma-shaped mock — only the `run.findFirst` + `run.update` paths the service exercises. */
const makeMysql = (initial: RunRow | null = pendingRun()) => {
  let row: RunRow | null = initial;
  const findFirst = vi.fn().mockImplementation(() => Promise.resolve(row));
  const update = vi.fn().mockImplementation(({ data }: { data: Partial<RunRow> }) => {
    if (row) row = { ...row, ...data };
    return Promise.resolve(row);
  });
  return {
    run: { findFirst, update },
    /** Direct setter — tests use this to seed snapshots between flow stages. */
    _set(next: RunRow | null): void {
      row = next;
    },
    _row(): RunRow | null {
      return row;
    },
  };
};

// ── CombatRunService.start ────────────────────────────────────────────────

describe("CombatRunService.start", () => {
  it("creates a battle state and persists snapshot", async () => {
    const mysql = makeMysql();
    const svc = new CombatRunService({ mysql: mysql as never });
    const result = await svc.start({ userId: 1n, runId: 1n });

    expect(result.state.battleId).toBe("run-1");
    expect(result.state.phase).toMatch(/player_turn|enemy_turn/);
    expect(mysql.run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1n },
        data: expect.objectContaining({ snapshot: expect.any(Object), actionLog: [] }),
      }),
    );
  });

  it("throws invalidAction when run is not in_progress", async () => {
    const mysql = makeMysql(pendingRun({ status: "completed", snapshot: { x: 1 } }));
    const svc = new CombatRunService({ mysql: mysql as never });
    await expect(svc.start({ userId: 1n, runId: 1n })).rejects.toThrow("in progress");
  });

  it("throws not-found when run row is missing", async () => {
    const mysql = makeMysql(null);
    const svc = new CombatRunService({ mysql: mysql as never });
    await expect(svc.start({ userId: 1n, runId: 99n })).rejects.toThrow();
  });
});

// ── CombatRunService.submitAction ─────────────────────────────────────────

describe("CombatRunService.submitAction", () => {
  let mysql: ReturnType<typeof makeMysql>;
  let svc: CombatRunService;

  beforeEach(async () => {
    mysql = makeMysql();
    svc = new CombatRunService({ mysql: mysql as never });
    // Seed a real snapshot by calling start() first.
    const { state } = await svc.start({ userId: 1n, runId: 1n });
    // Replace stored row's snapshot with the fresh BattleState object —
    // MySQL JSON columns return the parsed object, not a string.
    mysql._set(pendingRun({ snapshot: state, actionLog: [] }));
  });

  it("applies end_turn and returns updated state", async () => {
    const result = await svc.submitAction({ userId: 1n, runId: 1n }, {
      kind: "end_turn",
      actorId: "hero",
    });
    expect(result.state).toBeDefined();
    expect(["in_progress", "completed", "failed"]).toContain(result.runStatus);
    expect(mysql.run.update).toHaveBeenCalledTimes(2); // start + submit
  });

  it("appends action to log on each submit", async () => {
    await svc.submitAction({ userId: 1n, runId: 1n }, { kind: "end_turn", actorId: "hero" });
    const lastCall = mysql.run.update.mock.calls.at(-1) as
      | [{ data: { actionLog: readonly { kind: string }[] } }]
      | undefined;
    const log = lastCall?.[0].data.actionLog ?? [];
    expect(log).toHaveLength(1);
    expect(log[0]?.kind).toBe("end_turn");
  });

  it("throws invalidAction when run is not in_progress", async () => {
    mysql._set(pendingRun({ status: "completed", snapshot: null }));
    await expect(
      svc.submitAction({ userId: 1n, runId: 1n }, { kind: "end_turn", actorId: "hero" }),
    ).rejects.toThrow("in progress");
  });

  it("throws invalidAction when there is no snapshot yet", async () => {
    mysql._set(pendingRun({ snapshot: null }));
    await expect(
      svc.submitAction({ userId: 1n, runId: 1n }, { kind: "end_turn", actorId: "hero" }),
    ).rejects.toThrow();
  });
});

// ── CombatRunService.replay ───────────────────────────────────────────────

describe("CombatRunService.replay", () => {
  it("returns ok=true when snapshot matches replay", async () => {
    const mysql = makeMysql();
    const svc = new CombatRunService({ mysql: mysql as never });
    const { state } = await svc.start({ userId: 1n, runId: 1n });
    mysql._set(pendingRun({ snapshot: state, actionLog: [] }));

    const result = await svc.replay({ userId: 1n, runId: 1n });
    expect(result.ok).toBe(true);
    expect(result.expected).toBe(result.actual);
  });

  it("returns ok=false when snapshot is tampered", async () => {
    const mysql = makeMysql();
    const svc = new CombatRunService({ mysql: mysql as never });
    const { state } = await svc.start({ userId: 1n, runId: 1n });
    // Tamper: mutate hp via the stable JSON envelope round-trip.
    const serial = JSON.parse(stringifyState(state)) as {
      schemaVersion: number;
      state: { actors: { stats: { hp: number } }[] };
    };
    if (serial.state.actors[0]) serial.state.actors[0].stats.hp = 9999;
    mysql._set(pendingRun({ snapshot: serial, actionLog: [] }));

    const result = await svc.replay({ userId: 1n, runId: 1n });
    expect(result.ok).toBe(false);
    expect(result.expected).not.toBe(result.actual);
  });
});
