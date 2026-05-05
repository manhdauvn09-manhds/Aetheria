// Aetheria — combat scene store.
//
// Holds the live `BattleState` plus a queue of engine `Event`s the
// renderer hasn't yet animated. Two write paths:
//
//   - `applyOptimistic(action)` — runs the pure engine locally so the
//     UI updates the moment the user clicks. Saves the pre-action
//     `BattleState` so a server rejection can roll back cleanly.
//   - `commitServer(state)` — replaces the local state with the
//     authoritative one returned by `combat.submitAction`. If the
//     server's hash matches the optimistic prediction we just absorb
//     the events; otherwise we mark `reconciledAt` so the renderer
//     can flash a "desync" hint.
//
// The store is intentionally light: the renderer (CombatScene.tsx)
// pulls events off `eventQueue` one by one and animates them, then
// calls `consumeEvent` to advance.

import {
  applyAction,
  hashState,
  type Action,
  type BattleState,
  type Event,
} from "@aetheria/domain-combat";
import { create } from "zustand";

export interface PendingAction {
  readonly action: Action;
  /** Snapshot taken *before* the optimistic apply, so we can roll back. */
  readonly preState: BattleState;
  readonly predictedHash: string;
  readonly submittedAt: number;
}

export interface CombatStoreState {
  state: BattleState | null;
  /** Latest server-confirmed state hash. Used to detect drift. */
  serverHash: string | null;
  /** Queue of events not yet animated by the renderer. */
  eventQueue: readonly Event[];
  /** Currently in-flight optimistic action, if any. */
  pending: PendingAction | null;
  /** Last reconcile note for HUD ("ok" | "rolled_back" | "drift"). */
  lastReconcile:
    | { kind: "ok" | "rolled_back" | "drift"; at: number; message?: string }
    | null;

  setState: (state: BattleState, serverHash?: string) => void;
  enqueueEvents: (events: readonly Event[]) => void;
  consumeEvent: () => Event | null;
  applyOptimistic: (action: Action) => OptimisticResult;
  commitServer: (state: BattleState, events: readonly Event[]) => void;
  rejectPending: (message: string) => void;
  reset: () => void;
}

export type OptimisticResult =
  | { ok: true; state: BattleState; events: readonly Event[]; hash: string }
  | { ok: false; code: string; message: string };

export const useCombat = create<CombatStoreState>((set, get) => ({
  state: null,
  serverHash: null,
  eventQueue: [],
  pending: null,
  lastReconcile: null,

  setState: (state, serverHash) => {
    set({
      state,
      serverHash: serverHash ?? hashState(state),
      eventQueue: [],
      pending: null,
      lastReconcile: null,
    });
  },

  enqueueEvents: (events) => {
    if (events.length === 0) return;
    set({ eventQueue: [...get().eventQueue, ...events] });
  },

  consumeEvent: () => {
    const q = get().eventQueue;
    if (q.length === 0) return null;
    const head = q[0];
    set({ eventQueue: q.slice(1) });
    return head ?? null;
  },

  applyOptimistic: (action) => {
    const current = get().state;
    if (!current) return { ok: false, code: "NO_STATE", message: "Combat not started" };
    if (get().pending) {
      return { ok: false, code: "BUSY", message: "Another action is in flight" };
    }
    try {
      const result = applyAction(current, action);
      const hash = hashState(result.state);
      set({
        state: result.state,
        eventQueue: [...get().eventQueue, ...result.events],
        pending: {
          action,
          preState: current,
          predictedHash: hash,
          submittedAt: Date.now(),
        },
      });
      return { ok: true, state: result.state, events: result.events, hash };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code =
        e !== null && typeof e === "object" && "code" in e
          ? String((e).code)
          : "ENGINE_ERROR";
      return { ok: false, code, message };
    }
  },

  commitServer: (state, events) => {
    const pending = get().pending;
    const serverHash = hashState(state);
    if (pending?.predictedHash === serverHash) {
      // Optimistic prediction matched → events already animated; just
      // bump the canonical state + clear pending.
      set({
        state,
        serverHash,
        pending: null,
        lastReconcile: { kind: "ok", at: Date.now() },
      });
      return;
    }
    // Drift or a no-pending refresh. Replace the state and re-emit any
    // server events the renderer hasn't seen yet.
    const known = new Set(get().eventQueue.map(eventKey));
    const fresh = events.filter((e) => !known.has(eventKey(e)));
    set({
      state,
      serverHash,
      eventQueue: [...get().eventQueue, ...fresh],
      pending: null,
      lastReconcile: pending
        ? { kind: "drift", at: Date.now(), message: "Reconciled to server state" }
        : { kind: "ok", at: Date.now() },
    });
  },

  rejectPending: (message) => {
    const pending = get().pending;
    if (!pending) return;
    set({
      state: pending.preState,
      eventQueue: [],
      pending: null,
      lastReconcile: { kind: "rolled_back", at: Date.now(), message },
    });
  },

  reset: () => {
    set({
      state: null,
      serverHash: null,
      eventQueue: [],
      pending: null,
      lastReconcile: null,
    });
  },
}));

const eventKey = (e: Event): string => `${String(e.t)}:${e.type}`;
