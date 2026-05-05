"use client";

// Aetheria — Chat panel.
//
// Tabs across global / guild / whisper. History seeded from REST
// (`trpc.chat.history`) and live-appended via Socket.IO `chat:message`
// events from apps/realtime. Sending posts to `trpc.chat.send` and
// optimistically appends locally; the realtime echo is filtered by
// `messageId` to avoid duplicates.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";
import {
  useChatSocket,
  type ChannelType,
  type ChatBusMessage,
  type JoinSpec,
} from "@/lib/realtime/useChatSocket";

const ChatInner = (): JSX.Element => {
  const [tab, setTab] = useState<ChannelType>("global");
  const [guildId, setGuildId] = useState("");
  const [whisperId, setWhisperId] = useState("");

  const active: JoinSpec = useMemo(() => {
    if (tab === "guild") return { channelType: "guild", channelId: guildId || null };
    if (tab === "whisper") return { channelType: "whisper", channelId: whisperId || null };
    return { channelType: "global", channelId: null };
  }, [tab, guildId, whisperId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">Chat</h1>
          <p className="text-xs text-zinc-500">Global / guild / whisper.</p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      <nav className="flex gap-2">
        {(["global", "guild", "whisper"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded border px-3 py-1 text-xs uppercase tracking-wider ${
              tab === t
                ? "border-realm-aetheric text-realm-aetheric"
                : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            }`}
            onClick={() => {
              setTab(t);
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "guild" ? (
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Guild id"
          value={guildId}
          onChange={(e) => {
            setGuildId(e.target.value);
          }}
        />
      ) : null}
      {tab === "whisper" ? (
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Other user id"
          value={whisperId}
          onChange={(e) => {
            setWhisperId(e.target.value);
          }}
        />
      ) : null}

      <ChatPanel active={active} />
    </main>
  );
};

const ChatPanel = ({ active }: { readonly active: JoinSpec }): JSX.Element => {
  const enabled =
    active.channelType === "global" ||
    (active.channelId !== null && active.channelId !== undefined && active.channelId.length > 0);

  const history = trpc.chat.history.useQuery(
    {
      channelType: active.channelType,
      channelId: enabled && active.channelId ? active.channelId : undefined,
      limit: 50,
    },
    { enabled },
  );
  const send = trpc.chat.send.useMutation();
  const { connected, messages, replace, append } = useChatSocket(active);

  // Seed feed from REST history (newest-first → reverse to chronological).
  useEffect(() => {
    if (!history.data) return;
    const chronological = [...history.data].reverse().map(
      (m): ChatBusMessage => ({
        messageId: m.messageId.toString(),
        channelType: m.channelType,
        channelId: m.channelId === null ? null : m.channelId.toString(),
        senderId: m.senderId.toString(),
        content: m.content,
        flagged: m.flagged,
        createdAt: m.createdAt.toISOString(),
      }),
    );
    replace(chronological);
  }, [history.data, replace]);

  const seen = useMemo(() => new Set(messages.map((m) => m.messageId)), [messages]);

  const [draft, setDraft] = useState("");

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
        <span>{connected ? "● live" : "○ offline"}</span>
        {history.isLoading ? <span>Loading…</span> : null}
        {history.isError ? <span className="text-rose-400">{history.error.message}</span> : null}
      </div>

      <ul className="h-80 space-y-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-2 text-sm">
        {messages.map((m) => (
          <li key={m.messageId} className="flex gap-2">
            <span className="font-mono text-zinc-500">#{m.senderId}</span>
            <span className={m.flagged ? "text-rose-300" : "text-zinc-200"}>{m.content}</span>
          </li>
        ))}
        {messages.length === 0 && !history.isLoading ? (
          <li className="text-zinc-500">No messages yet.</li>
        ) : null}
      </ul>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!enabled || draft.trim().length === 0) return;
          send.mutate(
            {
              channelType: active.channelType,
              channelId:
                active.channelType === "global" ? undefined : active.channelId ?? undefined,
              content: draft,
            },
            {
              onSuccess: (msg) => {
                // Optimistically append unless the bus already delivered it.
                if (seen.has(msg.messageId.toString())) return;
                append({
                  messageId: msg.messageId.toString(),
                  channelType: msg.channelType,
                  channelId: msg.channelId === null ? null : msg.channelId.toString(),
                  senderId: msg.senderId.toString(),
                  content: msg.content,
                  flagged: msg.flagged,
                  createdAt: msg.createdAt.toISOString(),
                });
              },
            },
          );
          setDraft("");
        }}
      >
        <input
          className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder={enabled ? "Say something…" : "Pick a channel id first"}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          disabled={!enabled || send.isLoading}
        />
        <button
          type="submit"
          disabled={!enabled || send.isLoading}
          className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {send.isError ? (
        <p className="mt-2 text-xs text-rose-400">Send: {send.error.message}</p>
      ) : null}
    </section>
  );
};

const ChatPage = (): JSX.Element => (
  <RequireAuth>
    <ChatInner />
  </RequireAuth>
);

export default ChatPage;
