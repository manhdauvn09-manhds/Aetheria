import { describe, expect, it } from "vitest";

import { REDIS_PVP_MATCH_CHANNEL, toMatchStartEvent } from "../publisher.js";
import type { PvpMatchRow } from "../types.js";

const baseRow: PvpMatchRow = {
  matchId: 42n,
  mode: "1v1",
  region: "na",
  status: "active",
  startedAt: new Date("2026-05-05T10:00:00Z"),
  endedAt: null,
  winnerUserId: null,
  players: [
    {
      userId: 100n,
      lineup: [],
      score: 0,
      mmrBefore: 1000,
      mmrAfter: 1000,
      result: "draw",
    },
    {
      userId: 200n,
      lineup: [],
      score: 0,
      mmrBefore: 1010,
      mmrAfter: 1010,
      result: "draw",
    },
  ],
};

describe("REDIS_PVP_MATCH_CHANNEL", () => {
  it("uses the canonical aetheria namespace", () => {
    expect(REDIS_PVP_MATCH_CHANNEL).toBe("aetheria:pvp:match.start");
  });
});

describe("toMatchStartEvent", () => {
  it("stringifies BigInts and ISO-formats dates", () => {
    const evt = toMatchStartEvent(baseRow);
    expect(evt).toEqual({
      matchId: "42",
      mode: "1v1",
      region: "na",
      players: ["100", "200"],
      startedAt: "2026-05-05T10:00:00.000Z",
    });
  });

  it("preserves player order as in row", () => {
    const evt = toMatchStartEvent({
      ...baseRow,
      players: [...baseRow.players].reverse(),
    });
    expect(evt.players).toEqual(["200", "100"]);
  });
});
