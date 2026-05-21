"use client";

// Aetheria — InGame scene.
//
// Calls `world.startLevel` on mount, renders the hex map, and exposes
// Pause / Abandon / back-to-Realms transitions. The state machine in
// `docs/02_FLOWS.md` §10 lives in the gameFlow store; this page just
// emits the right transitions on user actions.
//
// Step 4.28 added a "Combat" mode: once a run is active the player can
// click *Engage* to call `combat.start`, swap the level overview for a
// `CombatScene`, and submit actions. Each action is applied optimistically
// against the local engine and reconciled with the server's response.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import type { Action, Coord } from "@aetheria/domain-combat";
import type { LevelMap } from "@aetheria/game-assets";

import { AdComponent, type AdsConfig } from "@/components/ads/AdComponent";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CombatHelp } from "@/components/game/CombatHelp";
import { CombatHud } from "@/components/game/CombatHud";
import { CombatTutorial } from "@/components/game/CombatTutorial";
import { HexMapRenderer } from "@/components/game/HexMapRenderer";
import { VictoryScreen } from "@/components/game/VictoryScreen";
import { findHexPath } from "@/lib/hex/pathfind";
import { trpc } from "@/lib/trpc/client";
import { useCombat } from "@/store/combat";
import { useGameFlow } from "@/store/gameFlow";

// Lazy-load CombatScene so pixi.js bundle is not included in main chunk.
// Only loads when combatMode is true. Wrapped in Suspense with fallback.
const CombatScene = lazy(() => import("@/components/game/CombatScene").then((m) => ({ default: m.CombatScene })));

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
  const startCombat = trpc.combat.start.useMutation();
  const submitCombat = trpc.combat.submitAction.useMutation();

  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<SelectedTile | null>(null);
  const [combatMode, setCombatMode] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Coord | null>(null);
  const [combatError, setCombatError] = useState<string | null>(null);
  const [showAds, setShowAds] = useState(false);
  const [adsConfig] = useState<AdsConfig | null>(null);
  const [endScreenDismissed, setEndScreenDismissed] = useState(false);

  const setCombatState = useCombat((s) => s.setState);
  const applyOptimistic = useCombat((s) => s.applyOptimistic);
  const commitServer = useCombat((s) => s.commitServer);
  const rejectPending = useCombat((s) => s.rejectPending);
  const resetCombat = useCombat((s) => s.reset);

  // Kick off `startLevel` once when we land on a fresh level.
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
    // Fires once per level change; pulling startLevel/setScene/setActiveRun into
    // the dep array would re-fire on every render.
  }, [levelNumber, validNumber]);

  // Drop combat state when leaving the page.
  useEffect(
    () => () => {
      resetCombat();
    },
    [resetCombat],
  );

  // Check feature flag for ads on mount (disabled by default).
  useEffect(() => {
    // TODO: Replace with actual feature flag fetch from admin API
    // For now, feature flag is disabled by default (showAds = false)
    // When enabled via admin panel, it will return:
    // { enabled: true, provider: "admob", placementId: "...", durationSec: 15 }
    const fetchAdsConfig = async (): Promise<void> => {
      try {
        // Placeholder: fetch from admin.cacheMetrics or new admin.getFeatureFlag endpoint
        // const config = await trpc.admin.getFeatureFlag.query({ key: "ads.enabled" });
        // if (config?.enabled) {
        //   setAdsConfig(config);
        // }
      } catch {
        // Silently fail if ads config unavailable
      }
    };
    fetchAdsConfig();
  }, []);

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
          setCombatMode(false);
          resetCombat();
          setScene("main_menu");
          router.push("/realms");
        },
      },
    );
  };

  const onEngage = useCallback(() => {
    if (!activeRun || combatMode) return;
    setCombatError(null);
    startCombat.mutate(
      { runId: activeRun.runId },
      {
        onSuccess: (res) => {
          setCombatState(res.state);
          setCombatMode(true);
          setTargetId(null);
          setHighlight(null);
        },
        onError: (e) => {
          setCombatError(e.message);
        },
      },
    );
  }, [activeRun, combatMode, startCombat, setCombatState]);

  const onSubmitAction = useCallback(
    (action: Action) => {
      if (!activeRun) return;
      setCombatError(null);
      const optimistic = applyOptimistic(action);
      if (!optimistic.ok) {
        setCombatError(`${optimistic.code}: ${optimistic.message}`);
        return;
      }
      submitCombat.mutate(
        { runId: activeRun.runId, action: toWireAction(action) },
        {
          onSuccess: (res) => {
            commitServer(res.state, res.events);
            // Clear move highlight + target after a successful action.
            setHighlight(null);
            if (action.kind === "attack") setTargetId(null);
          },
          onError: (e) => {
            rejectPending(e.message);
            setCombatError(e.message);
          },
        },
      );
    },
    [activeRun, applyOptimistic, submitCombat, commitServer, rejectPending],
  );

  const onActorClick = useCallback((actorId: string) => {
    setTargetId(actorId);
  }, []);

  const onCombatTileClick = useCallback(
    (coord: Coord) => {
      const cur = useCombat.getState().state;
      if (!cur?.activeActorId) return;
      const active = cur.actors.find((a) => a.id === cur.activeActorId);
      if (active?.side !== "player") return;
      // Compute a multi-step adjacent path so clicking far tiles works
      // (engine validates step adjacency; we honour AP+move budget too).
      const path = findHexPath(cur, active, coord);
      if (!path || path.length === 0) {
        // Unreachable — flash the highlight then bail so the user knows
        // the click registered but nothing happened.
        setHighlight(coord);
        setCombatError("Tile not reachable this turn");
        return;
      }
      setHighlight(coord);
      onSubmitAction({ kind: "move", actorId: active.id, path });
    },
    [onSubmitAction],
  );

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
      <CombatTutorial />
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
          <CombatHelp />
          {!combatMode && activeRun ? (
            <button
              type="button"
              onClick={onEngage}
              disabled={startCombat.isLoading}
              className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-1 text-amber-200 hover:bg-amber-900/60 disabled:opacity-60"
            >
              {startCombat.isLoading ? "Engaging…" : "Engage combat"}
            </button>
          ) : null}
          {combatMode ? (
            <button
              type="button"
              onClick={() => {
                setCombatMode(false);
                resetCombat();
                setHighlight(null);
                setTargetId(null);
              }}
              className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
            >
              Exit combat
            </button>
          ) : null}
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
      {combatError ? (
        <p className="rounded-md border border-rose-700/40 bg-rose-950/20 p-2 text-sm text-rose-200">
          {combatError}
        </p>
      ) : null}

      {combatMode ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
          <Suspense fallback={<div className="rounded-md bg-zinc-900/40 p-4 text-sm text-zinc-400">Loading combat scene…</div>}>
            <CombatScene
              onActorClick={onActorClick}
              onTileClick={onCombatTileClick}
              highlightTile={highlight}
            />
          </Suspense>
          <CombatHud
            onSubmit={onSubmitAction}
            busy={submitCombat.isLoading}
            selectedTargetId={targetId}
            onClearTarget={() => {
              setTargetId(null);
            }}
          />
        </section>
      ) : map ? (
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

      {!combatMode && startLevel.data ? (
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

      {showAds && adsConfig ? (
        <AdComponent
          config={adsConfig}
          onClose={() => setShowAds(false)}
        />
      ) : null}

      {/* Victory / Defeat / Draw overlay — driven by engine phase. */}
      <CombatEndOverlay
        levelNumber={levelNumber}
        rewards={startLevel.data?.level.rewards as never}
        dismissed={endScreenDismissed}
        onDismiss={() => setEndScreenDismissed(true)}
      />
    </main>
  );
};

/** Reads the combat phase from the store and renders VictoryScreen when terminal. */
const CombatEndOverlay = ({
  levelNumber,
  rewards,
  dismissed,
  onDismiss,
}: {
  levelNumber: number;
  rewards: { xp?: number; gold?: number; items?: ReadonlyArray<{ itemId: number; qty: number }> } | null | undefined;
  dismissed: boolean;
  onDismiss: () => void;
}): JSX.Element | null => {
  const state = useCombat((s) => s.state);
  if (!state) return null;
  const terminal = state.phase === "victory" || state.phase === "defeat" || state.phase === "draw";
  if (!terminal) return null;
  return (
    <VictoryScreen
      state={state}
      levelNumber={levelNumber}
      rewards={rewards ?? null}
      visible={!dismissed}
      onClose={onDismiss}
    />
  );
};

// tRPC's zod-derived input types are mutable (`Coord[]`), but the engine
// declares `readonly Coord[]`. Build a fresh, mutable shape per kind.
const toWireAction = (a: Action) => {
  switch (a.kind) {
    case "move":
      return {
        kind: "move" as const,
        actorId: a.actorId,
        path: a.path.map((c) => ({ q: c.q, r: c.r })),
      };
    case "attack":
      return { kind: "attack" as const, actorId: a.actorId, targetId: a.targetId };
    case "use_skill":
      if (a.target === undefined) {
        return { kind: "use_skill" as const, actorId: a.actorId, skillId: a.skillId };
      }
      return typeof a.target === "string"
        ? {
            kind: "use_skill" as const,
            actorId: a.actorId,
            skillId: a.skillId,
            target: a.target,
          }
        : {
            kind: "use_skill" as const,
            actorId: a.actorId,
            skillId: a.skillId,
            target: { q: a.target.q, r: a.target.r },
          };
    case "defend":
      return { kind: "defend" as const, actorId: a.actorId };
    case "end_turn":
      return { kind: "end_turn" as const, actorId: a.actorId };
    default:
      return ((_: never) => _)(a);
  }
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
