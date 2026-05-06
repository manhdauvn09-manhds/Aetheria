// Aetheria — scene-transition validator.
//
// Pure helper. Mirrors the state graph in `docs/02_FLOWS.md` §10 so the
// store / routing layer can refuse illegal jumps. Used by the gameFlow
// store's `setScene` (callers can wrap it with `assertCanTransition`).

import type { Scene } from "@/store/gameFlow";

/** Adjacency list: from → set of legal next scenes. */
const GRAPH: Readonly<Record<Scene, readonly Scene[]>> = {
  splash: ["main_menu"],
  main_menu: ["realm_picker", "level_picker", "in_game"],
  realm_picker: ["main_menu", "level_picker"],
  level_picker: ["main_menu", "realm_picker", "in_game"],
  in_game: ["pause", "main_menu", "level_picker"],
  pause: ["in_game", "main_menu"],
};

export const canTransition = (from: Scene, to: Scene): boolean => {
  if (from === to) return true;
  return (GRAPH[from] ?? []).includes(to);
};

/** Throws when illegal so the store can refuse the update. */
export const assertCanTransition = (from: Scene, to: Scene): void => {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal scene transition: ${from} → ${to}`);
  }
};
