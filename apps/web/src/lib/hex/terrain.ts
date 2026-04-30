// Aetheria — terrain palette + fx tints for the hex renderer.
//
// Colors deliberately read as 0xRRGGBB so they can be passed directly
// to Pixi's `Graphics.fill({ color: … })`. The realm-themed colors in
// the Tailwind preset apply to UI chrome; tile fills use these.

import type { TerrainKind, TileFx } from "@aetheria/game-assets";

export const TERRAIN_FILL: Record<TerrainKind, number> = {
  grass: 0x3d8b40,
  forest: 0x1f5926,
  stone: 0x8a8e96,
  sand: 0xd9c27a,
  ash: 0x5a4a44,
  water: 0x1f6f8b,
  ice: 0xa8d5e2,
  lava: 0xc94a1f,
  void: 0x1c1a2c,
  ruins: 0x6e6757,
  shrine: 0x7a5fb0,
  wall: 0x2a2a30,
};

export const TERRAIN_OUTLINE: Record<TerrainKind, number> = {
  grass: 0x2a6a2e,
  forest: 0x143818,
  stone: 0x5e6168,
  sand: 0xb39e58,
  ash: 0x352a26,
  water: 0x144c61,
  ice: 0x7eb1c1,
  lava: 0x8e3110,
  void: 0x0d0c18,
  ruins: 0x4a443a,
  shrine: 0x534182,
  wall: 0x14141a,
};

/** Soft overlay tint (alpha applied at draw time) for ambient fx layers. */
export const FX_TINT: Record<TileFx, number> = {
  fog: 0xf0f0f0,
  rain: 0x6f88a8,
  snow: 0xffffff,
  embers: 0xff7842,
  wind: 0xc0e0ff,
  shimmer: 0xfff5b0,
  miasma: 0x7e3b9a,
};

export const SPAWN_FILL = {
  player: 0x3aa0ff,
  enemy: 0xd6463f,
  npc: 0xf2c14e,
} as const;

export const EXIT_FILL = 0xfff5b0;
