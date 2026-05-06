import { describe, expect, it, vi } from "vitest";

import { acquire, lockKey, release, runLocked } from "../lock.js";

const fakeRedis = (initial: { ok?: boolean; releaseValue?: number } = {}) => {
  let value: string | null = initial.ok === false ? "someone-else" : null;
  return {
    set: vi.fn((_key: string, token: string, ..._rest: unknown[]): Promise<string | null> => {
      if (initial.ok === false) return Promise.resolve(null);
      value = token;
      return Promise.resolve("OK");
    }),
    eval: vi.fn((_script: string, _keyc: number, _key: string, token: string): Promise<number> => {
      if (initial.releaseValue !== undefined) return Promise.resolve(initial.releaseValue);
      if (value === token) {
        value = null;
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }),
  };
};

describe("lockKey", () => {
  it("namespaces", () => {
    expect(lockKey("dailyReset")).toBe("aetheria:worker:lock:dailyReset");
  });
});

describe("acquire / release", () => {
  it("acquires when free, releases CAS-safely", async () => {
    const r = fakeRedis();
    const lock = await acquire(r as never, "j", 1_000);
    expect(lock).not.toBeNull();
    if (!lock) return;
    expect(r.set).toHaveBeenCalledOnce();
    expect(await release(r as never, lock)).toBe(true);
  });

  it("returns null on contention", async () => {
    const r = fakeRedis({ ok: false });
    expect(await acquire(r as never, "j", 1_000)).toBeNull();
  });

  it("release returns false when token mismatches", async () => {
    const r = fakeRedis({ releaseValue: 0 });
    expect(await release(r as never, { key: "k", token: "t" })).toBe(false);
  });
});

describe("runLocked", () => {
  it("runs fn when lock acquired and reports result", async () => {
    const r = fakeRedis();
    const fn = vi.fn(() => Promise.resolve(42));
    const out = await runLocked(r as never, "j", 1_000, fn);
    expect(out).toEqual({ ran: true, result: 42 });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("skips fn on contention", async () => {
    const r = fakeRedis({ ok: false });
    const fn = vi.fn();
    const out = await runLocked(r as never, "j", 1_000, fn);
    expect(out).toEqual({ ran: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("releases lock even if fn throws", async () => {
    const r = fakeRedis();
    const fn = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(runLocked(r as never, "j", 1_000, fn)).rejects.toThrow("boom");
    expect(r.eval).toHaveBeenCalledOnce();
  });
});
