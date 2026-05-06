// Aetheria — pure helpers for the realtime PvP runtime.
//
// Match-state lives in apps/realtime as plain objects keyed by matchId;
// these helpers stay side-effect-free so they're cheap to test.

export interface MatchState {
  readonly matchId: string;
  readonly players: readonly [string, string];
  readonly mode: "1v1" | "3v3";
  readonly region: "na" | "eu" | "ap";
  readonly startedAt: number;
  readonly turnDeadline: number;
  /** userId currently expected to move. */
  readonly turnUserId: string;
  readonly turnNumber: number;
  readonly status: "active" | "ended";
}

/** Minimum action shape accepted by the runtime. Body is opaque. */
export interface PvpAction {
  readonly matchId: string;
  readonly kind: "move" | "ability" | "surrender" | "heartbeat";
  readonly payload?: Record<string, unknown>;
}

export const TURN_TIMEOUT_MS = 30_000;
export const MAX_TURNS = 30;

export const parseMatchStart = (raw: unknown):
  | {
      matchId: string;
      mode: "1v1" | "3v3";
      region: "na" | "eu" | "ap";
      players: readonly string[];
      startedAt: string;
    }
  | null => {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.matchId !== "string") return null;
  if (r.mode !== "1v1" && r.mode !== "3v3") return null;
  if (r.region !== "na" && r.region !== "eu" && r.region !== "ap") return null;
  if (!Array.isArray(r.players) || r.players.some((p) => typeof p !== "string")) {
    return null;
  }
  if (typeof r.startedAt !== "string") return null;
  return r as never;
};

export const parsePvpAction = (raw: unknown): PvpAction | null => {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.matchId !== "string") return null;
  if (
    r.kind !== "move" &&
    r.kind !== "ability" &&
    r.kind !== "surrender" &&
    r.kind !== "heartbeat"
  ) {
    return null;
  }
  if (r.payload !== undefined && (r.payload === null || typeof r.payload !== "object")) {
    return null;
  }
  return r as never;
};

/** Build the initial state from a parsed match-start payload. */
export const buildInitialState = (
  parsed: { matchId: string; mode: "1v1" | "3v3"; region: "na" | "eu" | "ap"; players: readonly string[]; startedAt: string },
  now: number,
): MatchState | null => {
  if (parsed.players.length < 2) return null;
  const [a, b] = parsed.players;
  if (a === undefined || b === undefined) return null;
  return {
    matchId: parsed.matchId,
    players: [a, b],
    mode: parsed.mode,
    region: parsed.region,
    startedAt: Date.parse(parsed.startedAt),
    turnDeadline: now + TURN_TIMEOUT_MS,
    turnUserId: a,
    turnNumber: 1,
    status: "active",
  };
};

/** Validate an action against the current state. Pure — never throws. */
export const evaluateAction = (
  state: MatchState,
  actorUserId: string,
  action: PvpAction,
  now: number,
):
  | { ok: false; reason: "not_participant" | "not_your_turn" | "match_ended" | "match_id_mismatch" }
  | { ok: true; nextState: MatchState; ended: { winnerUserId: string | null; reason: "completed" | "forfeit" } | null } => {
  if (state.status === "ended") return { ok: false, reason: "match_ended" };
  if (action.matchId !== state.matchId) return { ok: false, reason: "match_id_mismatch" };
  const isParticipant = state.players.includes(actorUserId);
  if (!isParticipant) return { ok: false, reason: "not_participant" };
  if (action.kind === "heartbeat") {
    return { ok: true, nextState: state, ended: null };
  }
  if (state.turnUserId !== actorUserId) return { ok: false, reason: "not_your_turn" };

  if (action.kind === "surrender") {
    const opponent = state.players.find((p) => p !== actorUserId) ?? null;
    return {
      ok: true,
      nextState: { ...state, status: "ended" },
      ended: { winnerUserId: opponent, reason: "forfeit" },
    };
  }

  // move | ability — alternate turn, bump number, refresh deadline.
  const opponent = state.players.find((p) => p !== actorUserId);
  if (opponent === undefined) return { ok: false, reason: "not_participant" };
  const next: MatchState = {
    ...state,
    turnUserId: opponent,
    turnNumber: state.turnNumber + 1,
    turnDeadline: now + TURN_TIMEOUT_MS,
  };
  if (next.turnNumber > MAX_TURNS) {
    return {
      ok: true,
      nextState: { ...next, status: "ended" },
      // Tie-break by score is 4.46 — for now flag draw on time-up.
      ended: { winnerUserId: null, reason: "completed" },
    };
  }
  return { ok: true, nextState: next, ended: null };
};

/** Forfeit the current turn-holder when their deadline elapses. */
export const onDeadlineMiss = (
  state: MatchState,
): { winnerUserId: string | null; loserUserId: string } => {
  const loser = state.turnUserId;
  const winner = state.players.find((p) => p !== loser) ?? null;
  return { winnerUserId: winner, loserUserId: loser };
};
