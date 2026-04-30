"use client";

// Aetheria — InGame scene.
//
// Calls `world.startLevel` on mount, renders the hex map, and exposes
// Pause / Abandon / back-to-Realms transitions. The state machine in
// `docs/02_FLOWS.md` §10 lives in the gameFlow store; this page just
// emits the right transitions on user actions.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { LevelMap } from "@aetheria/game-assets";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { HexMapRenderer } from "@/components/game/HexMapRenderer";
import { trpc } from "@/lib/trpc/client";
import { useGameFlow } from "@/store/gameFlow";

interface SelectedTile {
  q: number;
  r: number;
}

const InGameInner = (): JSX.Element => {
  const params = useParams<{ levelNumber: string }>();
  const router = useRouter();
  const levelNumber = Number.parseInt(params?.levelNumber ?? "", 10);
  const validNumber = Number.isInteger(levelNumber) && levelNumber > 0;

  const setActiveRun = useGameFlow((s) => s.setActiveRun);
  const setScene = useGameFlow((s) => s.setScene);
  const activeRun = useGameFlow((s) => s.activeRun);

  const startLevel = trpc.world.startLevel.useMutation();
  const abandonRun = trpc.world.abandonRun.useMutation();

  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<SelectedTile | null>(null);

  // Kick off `startLevel` once when we land on a fresh level. If we
  // already have an active run for this level, skip — supports a
  // fast-path "Continue".
  useEffect(() => {
    if (!validNumber) return;
    if (activeRun?.levelNumber === levelNumber) {
      setScene("in_game");
      return;
    }
    setScene("in_game");
    startLevel.mutate(
      { levelNumber },
      {
        onSuccess: (res) => {
          setActiveRun({
            runId: res.run.id,
            levelNumber: res.level.levelNumber,
            slug: res.level.slug,
            startedAt: Date.now(),
          });
        },
      },
    );
    // Intentionally fires once per level change; pulling startLevel/setScene/
    // setActiveRun into the dep array would re-fire on every render.
  }, [levelNumber, validNumber]);

  const onAbandon = (): void => {
    if (!activeRun) {
      router.push("/realms");
      return;
    }
    abandonRun.mutate(
      { runId: activeRun.runId },
      {
        onSettled: () => {
          setActiveRun(null);
          setScene("main_menu");
          router.push("/realms");
        },
      },
    );
  };

  const map = useMemo<LevelMap | null>(() => {
    const data = startLevel.data;
    if (!data) return null;
    return data.level.map as LevelMap;
  }, [startLevel.data]);

  if (!validNumber) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 py-16">
        <p className="text-sm text-rose-400">Invalid level number.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Level {levelNumber.toString()}
            {startLevel.data ? ` · ${startLevel.data.level.type}` : ""}
          </div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            {startLevel.data?.level.name ?? "Loading…"}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setPaused((p) => !p);
              setScene(paused ? "in_game" : "pause");
            }}
            className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={onAbandon}
            disabled={abandonRun.isLoading}
            className="rounded-md border border-rose-700/50 px-3 py-1 text-rose-300 hover:bg-rose-950/40 disabled:opacity-60"
          >
            {abandonRun.isLoading ? "Abandoning…" : "Abandon"}
          </button>
          <Link
            href="/realms"
            className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
          >
            ← Realms
          </Link>
        </div>
      </header>

      {startLevel.isLoading ? (
        <p className="text-sm text-zinc-400">Starting run…</p>
      ) : null}
      {startLevel.isError ? (
        <p className="text-sm text-rose-400">
          Couldn&apos;t start the level: {startLevel.error.message}
        </p>
      ) : null}

      {map ? (
        <section className="relative">
          <HexMapRenderer
            map={map}
            hexSize={28}
            width={840}
            height={500}
            onTileClick={(t) => {
              setSelected(t);
            }}
          />
          {paused ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-zinc-950/80">
              <div className="space-y-3 rounded-md border border-zinc-700 bg-zinc-900 p-6 text-center">
                <h2 className="font-display text-xl text-zinc-100">Paused</h2>
                <p className="text-xs text-zinc-400">Run state autosaves on exit (4.17).</p>
                <button
                  type="button"
                  onClick={() => {
                    setPaused(false);
                    setScene("in_game");
                  }}
                  className="rounded-md border border-realm-aetheric bg-realm-aetheric/20 px-3 py-1 text-sm text-zinc-100 hover:bg-realm-aetheric/30"
                >
                  Resume
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {startLevel.data ? (
        <section className="grid grid-cols-2 gap-4 text-xs text-zinc-400 md:grid-cols-4">
          <Card label="Run ID" value={startLevel.data.run.id} />
          <Card
            label="Tiles"
            value={(startLevel.data.level.map as LevelMap).tiles.length.toString()}
          />
          <Card
            label="Waves"
            value={
              (startLevel.data.level.encounter as { waves?: unknown[] }).waves?.length?.toString() ?? "0"
            }
          />
          <Card
            label="Selected tile"
            value={selected ? `q=${selected.q.toString()}, r=${selected.r.toString()}` : "—"}
          />
        </section>
      ) : null}
    </main>
  );
};

const Card = ({ label, value }: { label: string; value: string }): JSX.Element => (
  <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
    <div className="mb-1 font-semibold uppercase tracking-wider text-zinc-300">{label}</div>
    <div className="font-mono text-zinc-100">{value}</div>
  </div>
);

const InGamePage = (): JSX.Element => (
  <RequireAuth>
    <InGameInner />
  </RequireAuth>
);

export default InGamePage;
