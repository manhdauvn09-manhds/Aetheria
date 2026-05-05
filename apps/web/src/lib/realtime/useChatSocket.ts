"use client";

// Aetheria — Socket.IO chat hook.
//
// Connects to apps/realtime with the current access token, joins the
// requested rooms, and exposes `messages` (live-appended) plus a
// `replace(initial)` setter so the page can seed it from REST history.

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { env } from "@/lib/env";
import { useSession } from "@/store/session";

export type ChannelType = "global" | "guild" | "party" | "whisper";

export interface ChatBusMessage {
  readonly messageId: string;
  readonly channelType: ChannelType;
  readonly channelId: string | null;
  readonly senderId: string;
  readonly content: string;
  readonly flagged: boolean;
  readonly createdAt: string;
}

export interface JoinSpec {
  readonly channelType: ChannelType;
  readonly channelId?: string | null;
}

const matchesActive = (msg: ChatBusMessage, active: JoinSpec, viewer: string): boolean => {
  if (msg.channelType !== active.channelType) return false;
  switch (active.channelType) {
    case "global":
      return true;
    case "guild":
    case "party":
      return msg.channelId === (active.channelId ?? null);
    case "whisper":
      // The active channelId is the *other* user. Match the pair regardless
      // of who spoke.
      return (
        (msg.senderId === viewer && msg.channelId === (active.channelId ?? null)) ||
        (msg.senderId === (active.channelId ?? null) && msg.channelId === viewer)
      );
  }
};

interface Result {
  readonly connected: boolean;
  readonly messages: readonly ChatBusMessage[];
  readonly replace: (next: readonly ChatBusMessage[]) => void;
  readonly append: (msg: ChatBusMessage) => void;
}

export const useChatSocket = (active: JoinSpec): Result => {
  const access = useSession((s) => s.access);
  const userId = useSession((s) => s.user?.id ?? null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<readonly ChatBusMessage[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!access?.value) return;
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
    socket.on("chat:message", (msg: ChatBusMessage) => {
      if (!userId) return;
      if (!matchesActive(msg, active, userId)) return;
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [access?.value, userId, active.channelType, active.channelId]);

  // Re-emit join when `active` changes (skip for whisper — uses user rooms).
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || active.channelType === "whisper" || active.channelType === "global") return;
    if (!active.channelId) return;
    socket.emit("chat:join", { channelType: active.channelType, channelId: active.channelId });
    const joined = { channelType: active.channelType, channelId: active.channelId };
    return () => {
      socket.emit("chat:leave", joined);
    };
  }, [active.channelType, active.channelId]);

  return {
    connected,
    messages,
    replace: (next) => {
      setMessages(next);
    },
    append: (msg) => {
      setMessages((prev) => [...prev, msg]);
    },
  };
};
