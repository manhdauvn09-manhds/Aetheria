// Aetheria — game-flow state.
//
// Tracks the scene the player is currently in, plus light context the
// renderer needs (selected realm, active run). Mirrors the state graph
// in `docs/02_FLOWS.md` §10. Routing is the canonical UI driver — this
// store is for in-page transitions that don't need a URL change (e.g.
// pause overlays).

import { create } from "zustand";

export type Scene =
  | "splash"
  | "main_menu"
  | "realm_picker"
  | "level_picker"
  | "in_game"
  | "pause";

export interface ActiveRun {
  readonly runId: string;
  readonly levelNumber: number;
  readonly slug: string;
  readonly startedAt: number; // epoch ms
}

export interface GameFlowState {
  scene: Scene;
  selectedRealmId: string | null;
  activeRun: ActiveRun | null;
  setScene: (s: Scene) => void;
  setSelectedRealm: (id: string | null) => void;
  setActiveRun: (run: ActiveRun | null) => void;
  reset: () => void;
}

export const useGameFlow = create<GameFlowState>((set) => ({
  scene: "splash",
  selectedRealmId: null,
  activeRun: null,
  setScene: (scene) => {
    set({ scene });
  },
  setSelectedRealm: (id) => {
    set({ selectedRealmId: id });
  },
  setActiveRun: (run) => {
    set({ activeRun: run });
  },
  reset: () => {
    set({ scene: "main_menu", selectedRealmId: null, activeRun: null });
  },
}));
