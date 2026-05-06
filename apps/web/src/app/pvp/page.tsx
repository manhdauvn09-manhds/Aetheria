"use client";

// Aetheria — PvP screen.
//
// Three states keyed off `pvp.activeMatch`:
//   • no match   → queue / cancel / status panel.
//   • match live → in-match HUD wired to apps/realtime.
//   • match ended → post-match summary with mmr deltas.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";
import { useMatchSocket } from "@/lib/realtime/useMatchSocket";
import { useSession } from "@/store/session";

type Mode = "1v1" | "3v3";
type Region = "na" | "eu" | "ap";

const PvpInner = (): JSX.Element => {
  const active = trpc.pvp.activeMatch.useQuery(undefined, { refetchInterval: 4_000 });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">PvP</h1>
          <p className="text-xs text-zinc-500">Glicko-2 ranked. 1v1 + 3v3.</p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      {active.isLoading ? <p className="text-sm text-zinc-400">Loading…</p> : null}
      {active.isError ? (
        <p className="text-sm text-rose-400">{active.error.message}</p>
      ) : null}

      {active.data ? (
        <MatchHud matchId={active.data.matchId.toString()} />
      ) : (
        <QueuePanel />
      )}
    </main>
  );
};

const QueuePanel = (): JSX.Element => {
  const status = trpc.pvp.status.useQuery(undefined, { refetchInterval: 2_000 });
  const utils = trpc.useUtils();
  const invalidate = (): void => {
    void utils.pvp.status.invalidate();
    void utils.pvp.activeMatch.invalidate();
  };
  const queue = trpc.pvp.queue.useMutation({ onSuccess: invalidate });
  const cancel = trpc.pvp.cancelQueue.useMutation({ onSuccess: invalidate });

  const [mode, setMode] = useState<Mode>("1v1");
  const [region, setRegion] = useState<Region>("na");

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="font-display text-lg text-zinc-200">Matchmaking</h2>
      {status.data?.inQueue ? (
        <div className="mt-3 space-y-2 text-sm">
          <div className="text-zinc-300">
            Queued{" "}
            <span className="font-mono text-realm-aetheric">{status.data.mode}</span>
            {" · "}
            <span className="font-mono">{status.data.region}</span>
            {" · MMR "}
            <span className="font-mono">{status.data.mmr?.toString() ?? "?"}</span>
          </div>
          {"bracketWidth" in status.data ? (
            <div className="text-xs text-zinc-500">
              Bracket ±{status.data.bracketWidth?.toString() ?? "?"} MMR
            </div>
          ) : null}
          <button
            type="button"
            disabled={cancel.isLoading || !status.data.mode || !status.data.region}
            onClick={() => {
              if (!status.data?.mode || !status.data.region) return;
              cancel.mutate({ mode: status.data.mode, region: status.data.region });
            }}
            className="rounded border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel queue
          </button>
        </div>
      ) : (
        <form
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[120px_120px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            queue.mutate({ mode, region });
          }}
        >
          <select
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
            }}
          >
            <option value="1v1">1v1</option>
            <option value="3v3">3v3</option>
          </select>
          <select
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value as Region);
            }}
          >
            <option value="na">NA</option>
            <option value="eu">EU</option>
            <option value="ap">AP</option>
          </select>
          <button
            type="submit"
            disabled={queue.isLoading}
            className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            {queue.isLoading ? "Joining…" : "Find match"}
          </button>
        </form>
      )}
      {queue.isError ? (
        <p className="mt-2 text-xs text-rose-400">{queue.error.message}</p>
      ) : null}
      {cancel.isError ? (
        <p className="mt-2 text-xs text-rose-400">{cancel.error.message}</p>
      ) : null}
    </section>
  );
};

const MatchHud = ({ matchId }: { readonly matchId: string }): JSX.Element => {
  const userId = useSession((s) => s.user?.id ?? null);
  const { connected, start, turn, history, end, action } = useMatchSocket(matchId);

  // Re-fetch active match when realtime announces an end so we exit the HUD.
  const utils = trpc.useUtils();
  useEffect(() => {
    if (end) {
      const t = setTimeout(() => {
        void utils.pvp.activeMatch.invalidate();
      }, 4_000);
      return () => {
        clearTimeout(t);
      };
    }
  }, [end, utils]);

  const myTurn = userId !== null && turn?.turnUserId === userId;
  const remainingMs = useDeadlineCountdown(turn?.turnDeadline ?? null);

  if (end) return <PostMatchSummary matchId={matchId} end={end} />;

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <header className="flex items-baseline justify-between">
        <div className="font-display text-lg text-zinc-200">
          Match #{matchId} · {start?.mode ?? "?"}
        </div>
        <span className="text-xs text-zinc-500">{connected ? "● live" : "○ offline"}</span>
      </header>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Turn</div>
          <div className="font-mono text-realm-aetheric">
            #{turn?.turnNumber.toString() ?? "?"}
          </div>
          <div className="text-xs text-zinc-400">
            {myTurn ? "Your move" : `Waiting for #${turn?.turnUserId ?? "?"}`}
          </div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Deadline</div>
          <div className="font-mono text-zinc-200">
            {remainingMs === null ? "—" : `${Math.max(0, Math.ceil(remainingMs / 1000)).toString()}s`}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!myTurn}
          onClick={() => {
            void action("move");
          }}
          className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          Move
        </button>
        <button
          type="button"
          disabled={!myTurn}
          onClick={() => {
            void action("ability");
          }}
          className="rounded border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          Ability
        </button>
        <button
          type="button"
          onClick={() => {
            void action("surrender");
          }}
          className="rounded border border-rose-800 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950"
        >
          Surrender
        </button>
      </div>

      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs">
        {history.map((h, i) => (
          <li key={`${h.turnNumber.toString()}-${i.toString()}`} className="flex gap-2">
            <span className="font-mono text-zinc-500">#{h.turnNumber}</span>
            <span className="text-zinc-300">
              {h.actorUserId === userId ? "You" : `#${h.actorUserId}`} → {h.action.kind}
            </span>
          </li>
        ))}
        {history.length === 0 ? <li className="text-zinc-500">No moves yet.</li> : null}
      </ul>
    </section>
  );
};

const useDeadlineCountdown = (deadline: number | null): number | null => {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      clearInterval(t);
    };
  }, [deadline]);
  return deadline === null ? null : deadline - now;
};

const PostMatchSummary = ({
  matchId,
  end,
}: {
  readonly matchId: string;
  readonly end: { reason: string; winnerUserId: string | null; loserUserId: string | null };
}): JSX.Element => {
  const detail = trpc.pvp.match.useQuery({ matchId }, { refetchInterval: 2_000 });
  const userId = useSession((s) => s.user?.id ?? null);

  const youWon = userId !== null && end.winnerUserId === userId;
  const youLost = userId !== null && end.loserUserId === userId;

  const yourPlayer = useMemo(
    () => detail.data?.players.find((p) => p.userId.toString() === userId) ?? null,
    [detail.data, userId],
  );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="font-display text-lg text-zinc-200">
        Match #{matchId} · {end.reason}
      </h2>
      <p
        className={
          youWon
            ? "mt-2 text-realm-aetheric"
            : youLost
              ? "mt-2 text-rose-400"
              : "mt-2 text-zinc-300"
        }
      >
        {youWon ? "Victory" : youLost ? "Defeat" : "Draw"}
      </p>
      {yourPlayer ? (
        <div className="mt-3 text-sm text-zinc-300">
          <div>
            Result: <span className="font-mono">{yourPlayer.result}</span>
          </div>
          <div>
            MMR: <span className="font-mono">{yourPlayer.mmrBefore.toString()}</span> →{" "}
            <span className="font-mono">{yourPlayer.mmrAfter.toString()}</span>{" "}
            <span
              className={
                yourPlayer.mmrAfter > yourPlayer.mmrBefore
                  ? "text-realm-aetheric"
                  : yourPlayer.mmrAfter < yourPlayer.mmrBefore
                    ? "text-rose-400"
                    : "text-zinc-500"
              }
            >
              ({yourPlayer.mmrAfter - yourPlayer.mmrBefore >= 0 ? "+" : ""}
              {(yourPlayer.mmrAfter - yourPlayer.mmrBefore).toString()})
            </span>
          </div>
        </div>
      ) : null}
      <Link
        href="/pvp"
        className="mt-4 inline-block rounded border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
      >
        Back to queue
      </Link>
    </section>
  );
};

const PvpPage = (): JSX.Element => (
  <RequireAuth>
    <PvpInner />
  </RequireAuth>
);

export default PvpPage;
