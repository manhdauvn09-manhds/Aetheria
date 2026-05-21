"use client";

// Aetheria — combat end-of-battle modal.
//
// Triggered when BattleState.phase becomes "victory" | "defeat" | "draw".
// Shows the outcome banner, the surviving party + HP summary, an
// estimated reward block (calibrated from the level's reward data
// returned by world.startLevel), and two CTAs:
//   - Next Level (victory) → router.push(/play/<levelNumber+1>)
//   - Retry (defeat/draw)   → window.location.reload()
//   - Realms                → router.push(/realms) (always available)
//
// The modal is purely presentational — XP/gold/loot are awarded by the
// server when the run row's status flips to "completed"; we just
// surface what the level promised so the player has a closing beat.

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { Actor, BattleState } from "@aetheria/domain-combat";

import { sfxLoss, sfxVictory } from "@/lib/audio/sfx";

interface VictoryScreenProps {
  readonly state: BattleState;
  readonly levelNumber: number;
  readonly rewards?: {
    readonly xp?: number;
    readonly gold?: number;
    readonly items?: ReadonlyArray<{ itemId: number; qty: number }>;
  } | null;
  /** Set this to false to hide (e.g. when user manually closes). */
  readonly visible: boolean;
  readonly onClose?: () => void;
}

export const VictoryScreen = ({
  state,
  levelNumber,
  rewards,
  visible,
  onClose,
}: VictoryScreenProps): JSX.Element | null => {
  const router = useRouter();
  const outcome = state.phase as "victory" | "defeat" | "draw" | string;

  // Fade-in keyframe: nothing fancy, just block escape until DOM mount.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  // Play outcome jingle exactly once when the modal opens.
  const playedRef = useRef(false);
  useEffect(() => {
    if (!visible || playedRef.current) return;
    playedRef.current = true;
    if (outcome === "victory") sfxVictory();
    else if (outcome === "defeat" || outcome === "draw") sfxLoss();
  }, [visible, outcome]);

  if (!visible) return null;
  if (outcome !== "victory" && outcome !== "defeat" && outcome !== "draw") return null;

  const players = state.actors.filter((a) => a.side === "player");
  const survivors = players.filter((a) => !a.defeated);
  const enemies = state.actors.filter((a) => a.side === "enemy");

  const banner =
    outcome === "victory" ? { title: "VICTORY", tone: "emerald" } :
    outcome === "defeat"  ? { title: "DEFEAT",  tone: "rose"    } :
                            { title: "DRAW",    tone: "amber"   };

  const toneClass: Record<string, string> = {
    emerald: "from-emerald-700/40 to-emerald-950/80 border-emerald-700 text-emerald-200",
    rose:    "from-rose-700/40 to-rose-950/80 border-rose-700 text-rose-200",
    amber:   "from-amber-700/40 to-amber-950/80 border-amber-700 text-amber-200",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Battle ${outcome}`}
    >
      <div
        className={`mx-4 w-full max-w-md rounded-lg border bg-gradient-to-b ${toneClass[banner.tone]} p-6 shadow-2xl`}
      >
        <h2 className="mb-1 text-center font-display text-4xl font-bold tracking-widest">
          {banner.title}
        </h2>
        <p className="mb-5 text-center text-xs uppercase tracking-wider opacity-80">
          Level {levelNumber.toString()} · turn {state.turn.toString()}
        </p>

        <section className="mb-4 space-y-2">
          <h3 className="text-xs uppercase tracking-wider opacity-70">Party</h3>
          {players.map((p) => (
            <ActorRow key={p.id} actor={p} />
          ))}
          <p className="pt-1 text-xs opacity-60">
            {survivors.length.toString()} of {players.length.toString()} hero
            {players.length === 1 ? "" : "es"} standing · {enemies.filter((e) => e.defeated).length.toString()}/{enemies.length.toString()} enemies defeated
          </p>
        </section>

        {outcome === "victory" && rewards ? (
          <section className="mb-4 rounded-md border border-current/20 bg-black/30 p-3">
            <h3 className="mb-2 text-xs uppercase tracking-wider opacity-70">Rewards</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="font-mono">
                <span className="opacity-60">XP </span>
                <span className="font-semibold">+{(rewards.xp ?? 0).toString()}</span>
              </div>
              <div className="font-mono">
                <span className="opacity-60">Gold </span>
                <span className="font-semibold">+{(rewards.gold ?? 0).toString()}</span>
              </div>
              {(rewards.items ?? []).length > 0 ? (
                <div className="col-span-2 text-xs">
                  <span className="opacity-60">Items: </span>
                  {(rewards.items ?? []).map((it, i) => (
                    <span key={i} className="font-mono">
                      #{it.itemId.toString()}×{it.qty.toString()}
                      {i < (rewards.items ?? []).length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/realms")}
            className="rounded-md border border-zinc-600 bg-zinc-900 px-4 py-2 text-zinc-200 hover:bg-zinc-800"
          >
            ← Realms
          </button>
          {outcome === "victory" && levelNumber < 100 ? (
            <button
              type="button"
              onClick={() => router.push(`/play/${(levelNumber + 1).toString()}` as never)}
              className="rounded-md border border-emerald-600 bg-emerald-700/40 px-4 py-2 text-emerald-100 hover:bg-emerald-700/60"
            >
              Next Level →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-amber-600 bg-amber-700/40 px-4 py-2 text-amber-100 hover:bg-amber-700/60"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ActorRow = ({ actor }: { actor: Actor }): JSX.Element => {
  const ratio = actor.stats.maxHp > 0 ? actor.stats.hp / actor.stats.maxHp : 0;
  const barColor =
    actor.defeated ? "bg-zinc-700"
      : ratio > 0.6 ? "bg-emerald-500"
        : ratio > 0.3 ? "bg-amber-500"
          : "bg-rose-500";
  return (
    <div className="flex items-center gap-3 rounded-md border border-current/20 bg-black/20 p-2 text-sm">
      <div className="flex-1">
        <div className="font-semibold">
          {actor.unit || actor.id}
          {actor.defeated ? <span className="ml-2 text-xs opacity-60">(defeated)</span> : null}
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-black/40">
          <div className={`h-full ${barColor}`} style={{ width: `${(ratio * 100).toString()}%` }} />
        </div>
      </div>
      <div className="text-right font-mono text-xs opacity-80">
        {actor.stats.hp.toString()}/{actor.stats.maxHp.toString()}
      </div>
    </div>
  );
};
