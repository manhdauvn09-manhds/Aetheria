"use client";

// Aetheria — combat HUD.
//
// Reads from the combat store to surface the active actor, AP/HP,
// available actions, and a tail of engine events for legibility. The
// HUD is dumb about networking — `onSubmit(action)` is the single
// outward seam. The page composes optimistic apply + tRPC submission.

import { useMemo } from "react";

import {
  hexDistance,
  type Action,
  type Actor,
  type BattleState,
  type Event,
} from "@aetheria/domain-combat";

import { useCombat } from "@/store/combat";

interface CombatHudProps {
  readonly onSubmit: (action: Action) => void;
  readonly busy?: boolean;
  readonly selectedTargetId?: string | null;
  readonly onClearTarget?: () => void;
}

export const CombatHud = ({
  onSubmit,
  busy = false,
  selectedTargetId = null,
  onClearTarget,
}: CombatHudProps): JSX.Element => {
  const state = useCombat((s) => s.state);
  const reconcile = useCombat((s) => s.lastReconcile);
  const pending = useCombat((s) => s.pending);

  const active = useMemo<Actor | null>(() => findActive(state), [state]);
  const target = useMemo<Actor | null>(() => {
    if (!state || !selectedTargetId) return null;
    return state.actors.find((a) => a.id === selectedTargetId) ?? null;
  }, [state, selectedTargetId]);

  if (!state) {
    return (
      <aside className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        Combat not started.
      </aside>
    );
  }

  const phaseLabel = phaseToLabel(state.phase);
  const canAct = active !== null && state.phase === "player_turn" && active.side === "player";
  const meleeReady =
    canAct && target !== null && target.side !== active.side && !target.defeated
      && hexDistance(active.pos, target.pos) === 1;

  const submitDisabled = busy || pending !== null || !canAct;

  return (
    <aside className="space-y-3 rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-zinc-300">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Phase · </span>
          <span className="font-mono">{phaseLabel}</span>
        </div>
        <div className="text-xs text-zinc-500">turn {state.turn}</div>
      </header>

      {active ? (
        <ActorRow label="Active" actor={active} />
      ) : (
        <div className="text-xs text-zinc-500">No active actor.</div>
      )}
      {target ? (
        <div className="space-y-1">
          <ActorRow label="Target" actor={target} />
          <button
            type="button"
            onClick={onClearTarget}
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Clear target
          </button>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">
          Click an enemy on the board to select a target.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitDisabled || !meleeReady}
          onClick={() => {
            if (!active || !target) return;
            onSubmit({ kind: "attack", actorId: active.id, targetId: target.id });
          }}
          className="rounded-md border border-rose-700/60 bg-rose-950/40 px-3 py-1 text-rose-200 hover:bg-rose-900/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Attack
        </button>
        <button
          type="button"
          disabled={submitDisabled}
          onClick={() => {
            if (!active) return;
            onSubmit({ kind: "defend", actorId: active.id });
          }}
          className="rounded-md border border-sky-700/60 bg-sky-950/40 px-3 py-1 text-sky-200 hover:bg-sky-900/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Defend
        </button>
        <button
          type="button"
          disabled={submitDisabled}
          onClick={() => {
            if (!active) return;
            onSubmit({ kind: "end_turn", actorId: active.id });
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          End turn
        </button>
      </div>

      {pending ? (
        <div className="rounded-md border border-amber-700/40 bg-amber-950/20 p-2 text-xs text-amber-200">
          Awaiting server confirmation for{" "}
          <span className="font-mono">{pending.action.kind}</span>…
        </div>
      ) : null}
      {reconcile ? <ReconcileLine reconcile={reconcile} /> : null}

      <EventLog log={state.log.slice(-6)} />
    </aside>
  );
};

const ReconcileLine = ({
  reconcile,
}: {
  reconcile: NonNullable<ReturnType<typeof useCombat.getState>["lastReconcile"]>;
}): JSX.Element => {
  const tone =
    reconcile.kind === "ok"
      ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-200"
      : reconcile.kind === "drift"
        ? "border-amber-700/40 bg-amber-950/20 text-amber-200"
        : "border-rose-700/40 bg-rose-950/20 text-rose-200";
  const label =
    reconcile.kind === "ok"
      ? "Synced with server"
      : reconcile.kind === "drift"
        ? "Server drift — reconciled"
        : "Action rejected — rolled back";
  return (
    <div className={`rounded-md border ${tone} p-2 text-xs`}>
      {label}
      {reconcile.message ? <div className="mt-0.5 font-mono">{reconcile.message}</div> : null}
    </div>
  );
};

const ActorRow = ({ label, actor }: { label: string; actor: Actor }): JSX.Element => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-zinc-100">
        <span className="font-semibold">{actor.unit || actor.id}</span>{" "}
        <span className="text-zinc-500">· {actor.side}</span>
      </div>
      <div className="text-xs text-zinc-400">
        {actor.element} · q{actor.pos.q.toString()},r{actor.pos.r.toString()}
      </div>
    </div>
    <div className="text-right text-xs">
      <div>
        HP <span className="font-mono text-zinc-100">
          {actor.stats.hp.toString()}/{actor.stats.maxHp.toString()}
        </span>
      </div>
      <div>
        AP <span className="font-mono text-zinc-100">{actor.stats.ap.toString()}</span>
      </div>
    </div>
  </div>
);

const EventLog = ({ log }: { log: readonly Event[] }): JSX.Element => {
  if (log.length === 0) {
    return <div className="text-xs text-zinc-500">No events yet.</div>;
  }
  return (
    <ol className="space-y-1 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
      {log.map((e, i) => (
        <li key={`${String(e.t)}-${String(i)}`} className="font-mono">
          <span className="text-zinc-500">#{e.t.toString()}</span> {summariseEvent(e)}
        </li>
      ))}
    </ol>
  );
};

const summariseEvent = (e: Event): string => {
  switch (e.type) {
    case "actor_moved":
      return `move ${e.actorId} → q${e.to.q.toString()},r${e.to.r.toString()}`;
    case "damage_dealt":
      return `${e.attackerId} → ${e.targetId} −${e.amount.toString()}${e.crit ? " crit" : ""}`;
    case "healed":
      return `heal ${e.targetId} +${e.amount.toString()}`;
    case "status_applied":
      return `${e.targetId} ${e.status} (${e.turns.toString()}t)`;
    case "status_expired":
      return `${e.targetId} ${e.status} expired`;
    case "actor_defeated":
      return `${e.actorId} defeated`;
    case "resonance_triggered":
      return `resonance × ${e.bonusMultiplier.toString()}`;
    case "turn_started":
      return `turn ${e.turn.toString()} → ${e.actorId} (${e.side})`;
    case "turn_ended":
      return `${e.actorId} ended turn`;
    case "battle_ended":
      return `battle ${e.outcome}`;
    default:
      return ((_: never): string => "?")(e);
  }
};

const phaseToLabel = (phase: BattleState["phase"]): string => {
  switch (phase) {
    case "player_turn":
      return "player turn";
    case "enemy_turn":
      return "enemy turn";
    case "victory":
      return "victory";
    case "defeat":
      return "defeat";
    case "draw":
      return "draw";
    case "resolving":
      return "resolving";
    case "setup":
      return "setup";
    default:
      return phase;
  }
};

const findActive = (state: BattleState | null): Actor | null => {
  if (!state?.activeActorId) return null;
  return state.actors.find((a) => a.id === state.activeActorId) ?? null;
};
