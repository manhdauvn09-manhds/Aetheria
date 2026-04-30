// Aetheria — level content schema.
//
// One source of truth for the JSON files in `packages/game-assets/levels/`,
// the MySQL `levels` row (map / encounter / rewards JSON columns), and the
// hex map renderer in apps/web (Step 4.19). Zod handles parse + validation
// + TypeScript inference all at once.
//
// Coordinate system: axial hex coordinates (q, r). The renderer converts to
// pixel positions; we just store grid indices here.

import { z } from "zod";

// ── Map ───────────────────────────────────────────────────────────────

export const TerrainKinds = [
  "grass",
  "forest",
  "stone",
  "sand",
  "ash",
  "water",
  "ice",
  "lava",
  "void",
  "ruins",
  "shrine",
  "wall",
] as const;
export type TerrainKind = (typeof TerrainKinds)[number];

export const TileFx = [
  "fog",
  "rain",
  "snow",
  "embers",
  "wind",
  "shimmer",
  "miasma",
] as const;
export type TileFx = (typeof TileFx)[number];

export const tileSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
  terrain: z.enum(TerrainKinds),
  /** Elevation in half-tiles. -2..+3 in our sample levels. */
  elev: z.number().int().min(-4).max(8).default(0),
  /** Optional ambient effect for the renderer. */
  fx: z.enum(TileFx).optional(),
  /** Movement cost multiplier (default 1). water/ice/lava override. */
  cost: z.number().min(0).max(99).optional(),
  /** Free-form tag, e.g. "key_door", "switch_a". */
  tag: z.string().min(1).max(32).optional(),
});
export type Tile = z.output<typeof tileSchema>;

export const spawnSchema = z.object({
  /** Either "player" (party slot 1..4) or "enemy" (encounter ref) or "npc". */
  kind: z.enum(["player", "enemy", "npc"]),
  /** Required for `enemy` — refers to encounter.waves[*].enemies[*].id. */
  ref: z.string().min(1).max(64).optional(),
  /** Party slot (player) or wave ordinal (enemy). */
  slot: z.number().int().min(1).max(16).optional(),
  q: z.number().int(),
  r: z.number().int(),
  facing: z.number().int().min(0).max(5).optional(),
});
export type Spawn = z.output<typeof spawnSchema>;

export const exitSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Where this exit leads. `next` ⇒ next level in realm. */
  to: z.union([
    z.literal("next"),
    z.literal("realm_hub"),
    z.object({ levelNumber: z.number().int().min(1) }),
  ]),
  /** If set, requires the run to satisfy this condition (e.g. "boss_dead"). */
  requires: z.string().min(1).max(64).optional(),
});
export type Exit = z.output<typeof exitSchema>;

export const mapSchema = z.object({
  width: z.number().int().min(1).max(64),
  height: z.number().int().min(1).max(64),
  tiles: z.array(tileSchema).min(1),
  spawns: z.array(spawnSchema).min(1),
  exits: z.array(exitSchema).min(1),
});
export type LevelMap = z.output<typeof mapSchema>;

// ── Encounter ─────────────────────────────────────────────────────────

export const enemyRefSchema = z.object({
  id: z.string().min(1).max(64),
  /** Catalog key from `characters.codename` or a free-form unit kind. */
  unit: z.string().min(1).max(64),
  level: z.number().int().min(1).max(120).default(1),
  /** Optional behaviour tag the AI dispatcher reads. */
  ai: z.enum(["aggressive", "defensive", "ranged", "support", "patrol"]).optional(),
});
export type EnemyRef = z.output<typeof enemyRefSchema>;

export const waveSchema = z.object({
  /** Wave 1 spawns at run start; subsequent waves spawn on triggers. */
  index: z.number().int().min(1),
  enemies: z.array(enemyRefSchema).min(1),
  /** Trigger condition: turn-count or "wave_n_clear". Wave 1 has no trigger. */
  trigger: z
    .union([
      z.object({ kind: z.literal("turn"), value: z.number().int().min(1) }),
      z.object({ kind: z.literal("clear"), wave: z.number().int().min(1) }),
    ])
    .optional(),
});
export type Wave = z.output<typeof waveSchema>;

export const bossSchema = z.object({
  id: z.string().min(1).max(64),
  unit: z.string().min(1).max(64),
  level: z.number().int().min(1).max(120),
  hpMultiplier: z.number().min(0.1).max(20).default(1),
  /** Optional script tag — e.g. "phase_at_50". */
  script: z.string().min(1).max(64).optional(),
});
export type Boss = z.output<typeof bossSchema>;

export const encounterSchema = z.object({
  waves: z.array(waveSchema).min(1),
  boss: bossSchema.optional(),
  /** Free-form scripts: e.g. ["intro_dialog","tutorial_arrows"]. */
  scripts: z.array(z.string().min(1).max(64)).optional(),
});
export type Encounter = z.output<typeof encounterSchema>;

// ── Rewards ───────────────────────────────────────────────────────────

export const itemRewardSchema = z.object({
  itemId: z.number().int().min(1),
  qty: z.number().int().min(1).max(999),
});
export type ItemReward = z.output<typeof itemRewardSchema>;

export const rewardsSchema = z.object({
  xp: z.number().int().min(0),
  gold: z.number().int().min(0),
  items: z.array(itemRewardSchema).default([]),
  /** Bonus granted only on the first clear ever. */
  firstClearBonus: z
    .object({
      xp: z.number().int().min(0).default(0),
      gold: z.number().int().min(0).default(0),
      items: z.array(itemRewardSchema).default([]),
      gems: z.number().int().min(0).default(0),
    })
    .optional(),
});
export type Rewards = z.output<typeof rewardsSchema>;

// ── Discovery secrets ─────────────────────────────────────────────────

export const discoverySecretsSchema = z.object({
  hidden: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        q: z.number().int(),
        r: z.number().int(),
        reveal: z.enum(["walk", "search", "key"]),
        reward: z
          .object({
            xp: z.number().int().min(0).default(0),
            gold: z.number().int().min(0).default(0),
            items: z.array(itemRewardSchema).default([]),
          })
          .optional(),
      }),
    )
    .min(1),
});
export type DiscoverySecrets = z.output<typeof discoverySecretsSchema>;

// ── Top-level Level ───────────────────────────────────────────────────

export const LevelTypes = [
  "story",
  "combat",
  "puzzle",
  "treasure",
  "boss",
  "hidden",
  "rift",
] as const;
export type LevelType = (typeof LevelTypes)[number];

export const levelSchema = z.object({
  /** Stable string id used by content tooling. The DB uses an autoincrement BIGINT. */
  slug: z.string().regex(/^[a-z0-9-]{3,48}$/),
  realmId: z.number().int().min(1).max(99),
  levelNumber: z.number().int().min(1).max(9999),
  name: z.string().min(1).max(128),
  type: z.enum(LevelTypes),
  difficulty: z.number().int().min(1).max(10).default(1),
  minAccountLevel: z.number().int().min(1).max(100).default(1),
  version: z.number().int().min(1).default(1),
  map: mapSchema,
  encounter: encounterSchema,
  rewards: rewardsSchema,
  discoverySecrets: discoverySecretsSchema.optional(),
});
export type Level = z.output<typeof levelSchema>;

/** Validate + parse a single level payload. Throws on invalid shapes. */
export const parseLevel = (raw: unknown): Level => levelSchema.parse(raw);

/** Safe variant — returns the Zod result so callers can render errors. */
export const safeParseLevel = (raw: unknown): z.SafeParseReturnType<unknown, Level> =>
  levelSchema.safeParse(raw);
