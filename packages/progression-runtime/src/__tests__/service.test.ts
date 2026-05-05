import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventBus, type LeveledUpEvent } from "@aetheria/domain-events";
import { AppError } from "@aetheria/schema-api";

import {
  applyAccountXp,
  grantAccountXp,
  type ProgressionMysqlClient,
} from "../service.js";

// ── Fakes ──────────────────────────────────────────────────────────────
//
// The runtime helper only touches `tx.profile.{findUnique,update}` and
// `mysql.$transaction`. A hand-rolled fake keeps the suite free of
// Prisma at runtime and makes the test surface obvious.

interface FakeProfile {
  accountXp: number;
}

const makeTx = (initial: number | null) => {
  const state: { profile: FakeProfile | null } = {
    profile: initial == null ? null : { accountXp: initial },
  };
  const tx = {
    profile: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          state.profile == null ? null : { accountXp: state.profile.accountXp },
        ),
      ),
      update: vi.fn(
        (args: { data: { accountLevel: number; accountXp: number } }) => {
          if (!state.profile) return Promise.reject(new Error("no profile"));
          state.profile.accountXp = args.data.accountXp;
          return Promise.resolve({ accountXp: state.profile.accountXp });
        },
      ),
    },
  };
  return { tx, state };
};

const makeMysql = (initial: number | null): ProgressionMysqlClient => {
  const { tx } = makeTx(initial);
  return {
    profile: tx.profile,
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
  } as unknown as ProgressionMysqlClient;
};

vi.mock("@aetheria/core", () => ({
  audit: { write: vi.fn(() => Promise.resolve()) },
}));

describe("applyAccountXp", () => {
  it("rejects non-positive amounts before reading the profile", async () => {
    const { tx } = makeTx(0);
    await expect(
      applyAccountXp(tx as never, 1n, 0),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      applyAccountXp(tx as never, 1n, -5),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      applyAccountXp(tx as never, 1n, 1.5),
    ).rejects.toBeInstanceOf(AppError);
    expect(tx.profile.findUnique).not.toHaveBeenCalled();
  });

  it("throws notFound when the profile is missing", async () => {
    const { tx } = makeTx(null);
    await expect(
      applyAccountXp(tx as never, 99n, 50),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes back accountLevel + accountXp and returns no level-ups for sub-level grants", async () => {
    const { tx, state } = makeTx(0);
    const result = await applyAccountXp(tx as never, 1n, 49);
    expect(result.totalXp).toBe(49);
    expect(result.level).toBe(1);
    expect(result.leveledUp).toEqual([]);
    expect(state.profile?.accountXp).toBe(49);
    expect(tx.profile.update).toHaveBeenCalledWith({
      where: { userId: 1n },
      data: { accountLevel: 1, accountXp: 49 },
    });
  });

  it("emits one level-up entry per crossed level when a single grant spans multiple levels", async () => {
    const { tx } = makeTx(0);
    // The XP curve at L1 needs 100 (XP_BASE). 250 XP must cross at least 1
    // level. Don't assert the exact span — just that we got events with
    // contiguous from/to and the final write reflects the engine result.
    const result = await applyAccountXp(tx as never, 1n, 250);
    expect(result.totalXp).toBe(250);
    expect(result.leveledUp.length).toBeGreaterThanOrEqual(1);
    for (const ev of result.leveledUp) {
      expect(ev.to).toBe(ev.from + 1);
      expect(Array.isArray(ev.milestoneIds)).toBe(true);
    }
  });
});

describe("grantAccountXp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a transaction, applies the grant, then emits LeveledUp on the bus per crossed level", async () => {
    const mysql = makeMysql(0);
    const bus = new EventBus();
    const seen: LeveledUpEvent[] = [];
    bus.subscribe("LeveledUp", (e) => {
      seen.push(e);
    });

    const result = await grantAccountXp(
      { mysql, bus },
      { userId: 7n, amount: 250, source: "quest" },
    );

    expect(result.totalXp).toBe(250);
    expect(seen.length).toBe(result.leveledUp.length);
    for (const ev of seen) {
      expect(ev.userId).toBe("7");
      expect(ev.to).toBe(ev.from + 1);
      expect(Array.isArray(ev.milestoneIds)).toBe(true);
    }
  });

  it("does not emit when no level was crossed", async () => {
    const mysql = makeMysql(0);
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("LeveledUp", handler);

    await grantAccountXp(
      { mysql, bus },
      { userId: 1n, amount: 10, source: "admin" },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("propagates notFound from the inner helper without writing audit/emitting", async () => {
    const mysql = makeMysql(null);
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("LeveledUp", handler);

    await expect(
      grantAccountXp(
        { mysql, bus },
        { userId: 99n, amount: 50, source: "admin" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(handler).not.toHaveBeenCalled();
  });
});
