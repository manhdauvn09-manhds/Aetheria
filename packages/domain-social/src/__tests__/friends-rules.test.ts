import { describe, expect, it } from "vitest";

import { buildFriendList, toFriendStatus } from "../friends/rules.js";

const t = (s: string): Date => new Date(`2026-05-05T0${s}:00:00Z`);

describe("toFriendStatus", () => {
  it("recognises accepted/blocked, defaults pending", () => {
    expect(toFriendStatus("accepted")).toBe("accepted");
    expect(toFriendStatus("blocked")).toBe("blocked");
    expect(toFriendStatus("pending")).toBe("pending");
    expect(toFriendStatus("garbage")).toBe("pending");
  });
});

describe("buildFriendList", () => {
  const viewer = 100n;
  const a = 200n;
  const b = 300n;
  const c = 400n;

  it("classifies outgoing-pending vs incoming-pending vs accepted", () => {
    const rows = [
      { userId: viewer, friendId: a, status: "pending", createdAt: t("1") },
      { userId: b, friendId: viewer, status: "pending", createdAt: t("2") },
      { userId: viewer, friendId: c, status: "accepted", createdAt: t("3") },
    ];
    const out = buildFriendList(viewer, rows);
    expect(out.outgoingPending.map((e) => e.otherUserId)).toEqual([a]);
    expect(out.incomingPending.map((e) => e.otherUserId)).toEqual([b]);
    expect(out.accepted.map((e) => e.otherUserId)).toEqual([c]);
    expect(out.blocked).toEqual([]);
  });

  it("merges accepted regardless of who initiated", () => {
    const rows = [
      { userId: a, friendId: viewer, status: "accepted", createdAt: t("1") },
      { userId: viewer, friendId: b, status: "accepted", createdAt: t("2") },
    ];
    const out = buildFriendList(viewer, rows);
    expect(out.accepted.map((e) => e.otherUserId).sort()).toEqual([a, b].sort());
    expect(out.accepted.every((e) => e.direction === "accepted")).toBe(true);
  });

  it("only surfaces blocks the viewer initiated", () => {
    const rows = [
      // viewer → a: blocked (visible)
      { userId: viewer, friendId: a, status: "blocked", createdAt: t("1") },
      // b → viewer: blocked (hidden)
      { userId: b, friendId: viewer, status: "blocked", createdAt: t("2") },
    ];
    const out = buildFriendList(viewer, rows);
    expect(out.blocked.map((e) => e.otherUserId)).toEqual([a]);
    expect(out.accepted).toEqual([]);
    expect(out.outgoingPending).toEqual([]);
    expect(out.incomingPending).toEqual([]);
  });

  it("returns empty bins when no rows match", () => {
    const out = buildFriendList(viewer, []);
    expect(out.accepted).toEqual([]);
    expect(out.outgoingPending).toEqual([]);
    expect(out.incomingPending).toEqual([]);
    expect(out.blocked).toEqual([]);
  });
});
