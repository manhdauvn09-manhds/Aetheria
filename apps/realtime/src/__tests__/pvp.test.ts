import { describe, expect, it } from "vitest";

import {
  buildInitialState,
  evaluateAction,
  MAX_TURNS,
  onDeadlineMiss,
  parseMatchStart,
  parsePvpAction,
  TURN_TIMEOUT_MS,
} from "../pvp.js";

const startEvt = {
  matchId: "42",
  mode: "1v1" as const,
  region: "na" as const,
  players: ["100", "200"] as const,
  startedAt: "2026-05-05T00:00:00.000Z",
};

describe("parseMatchStart", () => {
  it("accepts valid payload", () => {
    expect(parseMatchStart(startEvt)).not.toBeNull();
  });

  it("rejects bad mode/region/types", () => {
    expect(parseMatchStart({ ...startEvt, mode: "5v5" })).toBeNull();
    expect(parseMatchStart({ ...startEvt, region: "sa" })).toBeNull();
    expect(parseMatchStart({ ...startEvt, players: "x" })).toBeNull();
    expect(parseMatchStart(null)).toBeNull();
    expect(parseMatchStart("garbage")).toBeNull();
  });
});

describe("parsePvpAction", () => {
  it("accepts each kind", () => {
    expect(parsePvpAction({ matchId: "1", kind: "move" })).not.toBeNull();
    expect(parsePvpAction({ matchId: "1", kind: "ability", payload: { id: "x" } })).not.toBeNull();
    expect(parsePvpAction({ matchId: "1", kind: "surrender" })).not.toBeNull();
    expect(parsePvpAction({ matchId: "1", kind: "heartbeat" })).not.toBeNull();
  });

  it("rejects bad shapes", () => {
    expect(parsePvpAction({ kind: "move" })).toBeNull();
    expect(parsePvpAction({ matchId: "1", kind: "weird" })).toBeNull();
    expect(parsePvpAction({ matchId: "1", kind: "move", payload: 5 })).toBeNull();
    expect(parsePvpAction(null)).toBeNull();
  });
});

describe("buildInitialState", () => {
  it("seeds turnUserId with first player + deadline = now+timeout", () => {
    const s = buildInitialState(startEvt, 1_000);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.turnUserId).toBe("100");
    expect(s.players).toEqual(["100", "200"]);
    expect(s.turnNumber).toBe(1);
    expect(s.turnDeadline).toBe(1_000 + TURN_TIMEOUT_MS);
    expect(s.status).toBe("active");
  });
});

describe("evaluateAction", () => {
  const base = buildInitialState(startEvt, 0);

  it("rejects non-participant", () => {
    if (!base) throw new Error("base");
    expect(
      evaluateAction(base, "999", { matchId: "42", kind: "move" }, 1).ok,
    ).toBe(false);
  });

  it("rejects when not your turn", () => {
    if (!base) throw new Error();
    const r = evaluateAction(base, "200", { matchId: "42", kind: "move" }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_your_turn");
  });

  it("rejects mismatched matchId", () => {
    if (!base) throw new Error();
    const r = evaluateAction(base, "100", { matchId: "x", kind: "move" }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("match_id_mismatch");
  });

  it("alternates turn on a regular move", () => {
    if (!base) throw new Error();
    const r = evaluateAction(base, "100", { matchId: "42", kind: "move" }, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextState.turnUserId).toBe("200");
    expect(r.nextState.turnNumber).toBe(2);
    expect(r.nextState.turnDeadline).toBe(100 + TURN_TIMEOUT_MS);
    expect(r.ended).toBeNull();
  });

  it("heartbeat passes without changing state", () => {
    if (!base) throw new Error();
    const r = evaluateAction(base, "200", { matchId: "42", kind: "heartbeat" }, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nextState).toBe(base);
  });

  it("surrender ends with opponent as winner", () => {
    if (!base) throw new Error();
    const r = evaluateAction(base, "100", { matchId: "42", kind: "surrender" }, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ended?.reason).toBe("forfeit");
    expect(r.ended?.winnerUserId).toBe("200");
    expect(r.nextState.status).toBe("ended");
  });

  it("ends as draw when MAX_TURNS exceeded", () => {
    if (!base) throw new Error();
    const s = { ...base, turnNumber: MAX_TURNS };
    const r = evaluateAction(s, s.turnUserId, { matchId: "42", kind: "move" }, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ended).toEqual({ winnerUserId: null, reason: "completed" });
  });

  it("rejects actions on ended matches", () => {
    if (!base) throw new Error();
    const ended = { ...base, status: "ended" as const };
    const r = evaluateAction(ended, "100", { matchId: "42", kind: "move" }, 1);
    expect(r.ok).toBe(false);
  });
});

describe("onDeadlineMiss", () => {
  it("forfeits the current turn-holder", () => {
    const s = buildInitialState(startEvt, 0);
    if (!s) throw new Error();
    expect(onDeadlineMiss(s)).toEqual({ winnerUserId: "200", loserUserId: "100" });
  });
});
