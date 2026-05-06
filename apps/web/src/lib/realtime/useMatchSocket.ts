"use client";

// Aetheria — Socket.IO match hook.
//
// Wraps the realtime gateway for an active PvP match: subscribes to
// `pvp:start`/`pvp:state`/`pvp:end` events for the targeted matchId,
// exposes the running turn pointer + an `action(...)` emitter that
// returns the server's ack reason on failure.

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { env } from "@/lib/env";
import { useSession } from "@/store/session";

export interface MatchStartFrame {
  readonly matchId: string;
  readonly players: readonly [string, string];
  readonly turnUserId: string;
  readonly turnNumber: number;
  readonly turnDeadline: number;
  readonly mode: "1v1" | "3v3";
  readonly region: "na" | "eu" | "ap";
}

export interface MatchStateFrame {
  readonly matchId: string;
  readonly turnUserId: string;
  readonly turnNumber: number;
  readonly turnDeadline: number;
  readonly actorUserId: string;
  readonly action: { readonly kind: string; readonly payload?: unknown };
}

export interface MatchEndFrame {
  readonly matchId: string;
  readonly reason: "completed" | "forfeit" | "timeout";
  readonly winnerUserId: string | null;
  readonly loserUserId: string | null;
}

type ActionAck = { ok: true } | { ok: false; reason: string };

export interface UseMatchSocketResult {
  readonly connected: boolean;
  readonly start: MatchStartFrame | null;
  readonly turn: { turnUserId: string; turnNumber: number; turnDeadline: number } | null;
  readonly history: readonly MatchStateFrame[];
  readonly end: MatchEndFrame | null;
  readonly action: (kind: "move" | "ability" | "surrender" | "heartbeat") => Promise<ActionAck>;
}

export const useMatchSocket = (matchId: string | null): UseMatchSocketResult => {
  const access = useSession((s) => s.access);
  const [connected, setConnected] = useState(false);
  const [start, setStart] = useState<MatchStartFrame | null>(null);
  const [turn, setTurn] = useState<UseMatchSocketResult["turn"]>(null);
  const [history, setHistory] = useState<readonly MatchStateFrame[]>([]);
  const [end, setEnd] = useState<MatchEndFrame | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!access?.value || !matchId) return;
    setStart(null);
    setTurn(null);
    setHistory([]);
    setEnd(null);
    const socket = io(env.NEXT_PUBLIC_REALTIME_URL, {
      auth: { token: access.value },
      transports: ["websocket"],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });
    socket.on("disconnect", () => {
      setConnected(false);
    });
    socket.on("pvp:start", (frame: MatchStartFrame) => {
      if (frame.matchId !== matchId) return;
      setStart(frame);
      setTurn({
        turnUserId: frame.turnUserId,
        turnNumber: frame.turnNumber,
        turnDeadline: frame.turnDeadline,
      });
    });
    socket.on("pvp:state", (frame: MatchStateFrame) => {
      if (frame.matchId !== matchId) return;
      setHistory((prev) => [...prev, frame]);
      setTurn({
        turnUserId: frame.turnUserId,
        turnNumber: frame.turnNumber,
        turnDeadline: frame.turnDeadline,
      });
    });
    socket.on("pvp:end", (frame: MatchEndFrame) => {
      if (frame.matchId !== matchId) return;
      setEnd(frame);
      setTurn(null);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [access?.value, matchId]);

  const action = useCallback<UseMatchSocketResult["action"]>(
    (kind) =>
      new Promise<ActionAck>((resolve) => {
        const socket = socketRef.current;
        if (!socket || !matchId) {
          resolve({ ok: false, reason: "not_connected" });
          return;
        }
        socket.emit("pvp:action", { matchId, kind }, (ack: ActionAck | undefined) => {
          resolve(ack ?? { ok: false, reason: "no_ack" });
        });
      }),
    [matchId],
  );

  return { connected, start, turn, history, end, action };
};
