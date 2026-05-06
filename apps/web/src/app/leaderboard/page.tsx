"use client";

// Aetheria — Leaderboard screen.
//
// Tabs over modes (1v1 / 3v3). Top 50 + an "around me" window keyed off
// the live Redis ZSET. The MySQL `leaderboards` snapshot table is owned
// by a worker (Phase 4-I); this page reads only the live source.

import { useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "@/store/session";

type Mode = "1v1" | "3v3";

const LeaderboardInner = (): JSX.Element => {
  const [mode, setMode] = useState<Mode>("1v1");
  const userId = useSession((s) => s.user?.id ?? null);

  const top = trpc.pvp.lbTop.useQuery({ mode, limit: 50 });
  const around = trpc.pvp.lbAroundMe.useQuery({ mode, radius: 5 });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">Leaderboard</h1>
          <p className="text-xs text-zinc-500">Live Glicko-2 ratings.</p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      <nav className="flex gap-2">
        {(["1v1", "3v3"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`rounded border px-3 py-1 text-xs uppercase tracking-wider ${
              mode === m
                ? "border-realm-aetheric text-realm-aetheric"
                : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            }`}
            onClick={() => {
              setMode(m);
            }}
          >
            {m}
          </button>
        ))}
      </nav>

      <Section title="Top 50">
        {top.isLoading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {top.isError ? (
          <p className="text-sm text-rose-400">{top.error.message}</p>
        ) : null}
        {top.data?.length === 0 ? (
          <p className="text-sm text-zinc-500">No entries yet.</p>
        ) : null}
        {top.data ? <LbList rows={top.data} viewerUserId={userId} /> : null}
      </Section>

      <Section
        title={
          around.data?.rank != null
            ? `You — rank ${(around.data.rank + 1).toString()}`
            : "You — unranked"
        }
      >
        {around.isLoading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {around.isError ? (
          <p className="text-sm text-rose-400">{around.error.message}</p>
        ) : null}
        {around.data ? (
          around.data.entries.length === 0 ? (
            <p className="text-sm text-zinc-500">Play a ranked match to appear.</p>
          ) : (
            <LbList rows={around.data.entries} viewerUserId={userId} />
          )
        ) : null}
      </Section>
    </main>
  );
};

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): JSX.Element => (
  <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
    <h2 className="font-display text-lg text-zinc-200">{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

interface LbRow {
  readonly rank: number;
  readonly userId: string;
  readonly mmr: number;
}

const LbList = ({
  rows,
  viewerUserId,
}: {
  readonly rows: readonly LbRow[];
  readonly viewerUserId: string | null;
}): JSX.Element => (
  <ul className="space-y-1 text-sm">
    {rows.map((r) => (
      <li
        key={r.userId}
        className={`flex items-center justify-between rounded border bg-zinc-950/40 px-3 py-2 ${
          r.userId === viewerUserId
            ? "border-realm-aetheric"
            : "border-zinc-800"
        }`}
      >
        <span>
          <span className="font-mono text-zinc-500">#{(r.rank + 1).toString()}</span>{" "}
          <span className="font-mono text-zinc-300">@{r.userId}</span>
        </span>
        <span className="font-mono text-realm-aetheric">{r.mmr.toString()}</span>
      </li>
    ))}
  </ul>
);

const LeaderboardPage = (): JSX.Element => (
  <RequireAuth>
    <LeaderboardInner />
  </RequireAuth>
);

export default LeaderboardPage;
