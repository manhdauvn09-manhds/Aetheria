// Aetheria — chat room naming + broadcast routing.
//
// Pure helpers. The realtime gateway uses these on every `chat:join` /
// `chat:leave` event and on every bus message coming off Redis.

export type ChannelType = "global" | "guild" | "party" | "whisper";

/**
 * Canonical Socket.IO room name for a channel. Whisper channels are
 * client-side conversations between two users — fan-out happens via the
 * per-user `user:<id>` rooms instead, so this returns null and callers
 * fall back to `userRoomsForWhisper`.
 */
export const channelRoom = (
  channelType: ChannelType,
  channelId: string | null,
): string | null => {
  switch (channelType) {
    case "global":
      return "channel:global";
    case "guild":
      return channelId ? `channel:guild:${channelId}` : null;
    case "party":
      return channelId ? `channel:party:${channelId}` : null;
    case "whisper":
      return null;
  }
};

/** Both endpoints of a whisper conversation. */
export const userRoomsForWhisper = (
  senderId: string,
  channelId: string | null,
): readonly string[] => (channelId ? [`user:${senderId}`, `user:${channelId}`] : []);

/**
 * Resolve the rooms a single bus message should be broadcast to. For
 * non-whisper channels this is one room; for whisper it's both endpoints.
 */
export const broadcastTargets = (params: {
  readonly channelType: ChannelType;
  readonly channelId: string | null;
  readonly senderId: string;
}): readonly string[] => {
  if (params.channelType === "whisper") {
    return userRoomsForWhisper(params.senderId, params.channelId);
  }
  const room = channelRoom(params.channelType, params.channelId);
  return room ? [room] : [];
};
