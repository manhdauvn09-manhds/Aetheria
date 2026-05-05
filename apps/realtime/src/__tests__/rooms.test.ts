import { describe, expect, it } from "vitest";

import { broadcastTargets, channelRoom, userRoomsForWhisper } from "../rooms.js";

describe("channelRoom", () => {
  it("returns the canonical name for global / guild / party", () => {
    expect(channelRoom("global", null)).toBe("channel:global");
    expect(channelRoom("guild", "42")).toBe("channel:guild:42");
    expect(channelRoom("party", "9")).toBe("channel:party:9");
  });

  it("returns null for whisper (handled via user rooms)", () => {
    expect(channelRoom("whisper", "1")).toBeNull();
  });

  it("returns null when guild/party channelId is missing", () => {
    expect(channelRoom("guild", null)).toBeNull();
    expect(channelRoom("party", null)).toBeNull();
  });
});

describe("userRoomsForWhisper", () => {
  it("returns both endpoints when channelId present", () => {
    expect(userRoomsForWhisper("100", "200")).toEqual(["user:100", "user:200"]);
  });

  it("returns empty when channelId missing", () => {
    expect(userRoomsForWhisper("100", null)).toEqual([]);
  });
});

describe("broadcastTargets", () => {
  it("global → one room", () => {
    expect(
      broadcastTargets({ channelType: "global", channelId: null, senderId: "1" }),
    ).toEqual(["channel:global"]);
  });

  it("guild → one room with id", () => {
    expect(
      broadcastTargets({ channelType: "guild", channelId: "42", senderId: "1" }),
    ).toEqual(["channel:guild:42"]);
  });

  it("party → one room with id", () => {
    expect(
      broadcastTargets({ channelType: "party", channelId: "9", senderId: "1" }),
    ).toEqual(["channel:party:9"]);
  });

  it("whisper → both endpoints", () => {
    expect(
      broadcastTargets({ channelType: "whisper", channelId: "200", senderId: "100" }),
    ).toEqual(["user:100", "user:200"]);
  });

  it("missing channelId on guild → no targets", () => {
    expect(
      broadcastTargets({ channelType: "guild", channelId: null, senderId: "1" }),
    ).toEqual([]);
  });
});
