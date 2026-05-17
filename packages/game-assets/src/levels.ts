// Aetheria — sample-level loader.
//
// JSON files are imported statically so the bundle/transpile pipeline
// can treat them as data, no runtime `readFileSync`. Validation against
// `levelSchema` runs once on module load — invalid content fails the
// process loudly at startup.

import { type Level, levelSchema } from "./level-schema.js";

import lv01 from "../levels/01-verdant-forest-trail.json" with { type: "json" };
import lv02 from "../levels/02-ashen-cinder-pass.json" with { type: "json" };
import lv03 from "../levels/03-aetheric-cloudbridge.json" with { type: "json" };
import lv04 from "../levels/04-sunken-tideglass-reef.json" with { type: "json" };
import lv05 from "../levels/05-hollow-voidstep-atrium.json" with { type: "json" };
import lv06 from "../levels/06-verdant-hidden-glade.json" with { type: "json" };
import lv07 from "../levels/07-aetheric-spire-trial.json" with { type: "json" };
import lv08 from "../levels/08-hollow-mirror-rift.json" with { type: "json" };

const RAW_LEVELS: readonly unknown[] = [
  lv01, lv02, lv03, lv04, lv05, lv06, lv07, lv08,
];

// Procedural fill: the game guideline targets 100 levels across 5 realms.
// We ship 8 hand-authored levels (lv01..lv08); the rest (9..MAX_LEVEL_NUMBER)
// are generated from a template so progression is playable end-to-end while
// the level-designer pipeline catches up.
const MAX_LEVEL_NUMBER = 100;

let cached: readonly Level[] | null = null;

const ensureLoaded = (): readonly Level[] => {
  if (cached) return cached;
  const parsed: Level[] = [];
  for (const raw of RAW_LEVELS) {
    const result = levelSchema.safeParse(raw);
    if (!result.success) {
      const summary = result.error.issues
        .slice(0, 5)
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(`[game-assets] invalid level JSON:\n${summary}`);
    }
    parsed.push(result.data);
  }

  // Fill gaps procedurally so any levelNumber in 1..MAX_LEVEL_NUMBER resolves.
  const have = new Set(parsed.map((l) => l.levelNumber));
  for (let n = 1; n <= MAX_LEVEL_NUMBER; n++) {
    if (have.has(n)) continue;
    parsed.push(synthesiseLevel(n));
  }

  parsed.sort((a, b) => a.levelNumber - b.levelNumber);

  // Cross-cutting sanity: unique levelNumber + slug.
  const numbers = new Set<number>();
  const slugs = new Set<string>();
  for (const lv of parsed) {
    if (numbers.has(lv.levelNumber)) {
      throw new Error(`[game-assets] duplicate levelNumber ${String(lv.levelNumber)}`);
    }
    numbers.add(lv.levelNumber);
    if (slugs.has(lv.slug)) {
      throw new Error(`[game-assets] duplicate slug "${lv.slug}"`);
    }
    slugs.add(lv.slug);
  }

  cached = Object.freeze(parsed);
  return cached;
};

// Realm assignment: 1-20 → realm 1, 21-40 → realm 2, ... 81-100 → realm 5.
const realmForLevel = (n: number): number =>
  Math.min(5, Math.max(1, Math.ceil(n / 20)));

const REALM_THEMES: ReadonlyArray<{
  readonly realmId: number;
  readonly name: string;
  readonly terrains: ReadonlyArray<"grass" | "forest" | "stone" | "water" | "ruins">;
  readonly enemyUnit: string;
}> = [
  { realmId: 1, name: "Verdant Reach",  terrains: ["grass", "forest", "stone", "water"], enemyUnit: "dire_wolf" },
  { realmId: 2, name: "Ember Wastes",   terrains: ["stone", "ruins", "stone", "grass"],  enemyUnit: "ash_husk"  },
  { realmId: 3, name: "Frostspire",     terrains: ["stone", "stone", "water", "ruins"],  enemyUnit: "ice_wight" },
  { realmId: 4, name: "Tideglass",      terrains: ["water", "stone", "ruins", "grass"],  enemyUnit: "deep_leviath" },
  { realmId: 5, name: "Voidmaw",        terrains: ["ruins", "stone", "ruins", "stone"],  enemyUnit: "void_thrall" },
];

const synthesiseLevel = (n: number): Level => {
  const realmId = realmForLevel(n);
  const theme = REALM_THEMES[realmId - 1]!;
  const localIdx = ((n - 1) % 20) + 1; // 1..20 within realm
  const isBoss = localIdx === 20;
  const isElite = localIdx % 5 === 0 && !isBoss;
  const type = isBoss ? "boss" : (localIdx % 4 === 0 ? "combat" : "story");
  const difficulty = Math.max(1, Math.min(10, Math.ceil(n / 10)));
  const minAccountLevel = Math.max(1, n - 4);

  // 6x4 grid with terrains rotating by row from the realm's palette.
  // Build raw input shape and run it through levelSchema later so all
  // optional defaults (elev=0, gems=0, etc.) are populated correctly.
  const tiles: Array<{ q: number; r: number; terrain: string; tag?: string }> = [];
  for (let r = 0; r < 4; r++) {
    for (let q = 0; q < 6; q++) {
      const terrain = theme.terrains[r % theme.terrains.length]!;
      const tile: { q: number; r: number; terrain: string; tag?: string } = {
        q, r, terrain,
      };
      if (q === 5 && r === 0) tile.tag = "exit";
      tiles.push(tile);
    }
  }
  const spawns = [
    { kind: "player" as const, slot: 1, q: 0, r: 1 },
    { kind: "player" as const, slot: 2, q: 0, r: 2 },
    { kind: "enemy" as const, ref: `${theme.enemyUnit}-a`, slot: 1, q: 4, r: 1 },
    { kind: "enemy" as const, ref: `${theme.enemyUnit}-b`, slot: 1, q: 4, r: 2 },
  ];
  if (isBoss || isElite) {
    spawns.push({ kind: "enemy" as const, ref: `${theme.enemyUnit}-boss`, slot: 1, q: 5, r: 1 });
  }
  const exits = [{ q: 5, r: 0, to: "next" as const }];

  const slug = `realm-${String(realmId)}-${type}-${String(n).padStart(3, "0")}`;
  const name = isBoss
    ? `${theme.name} — Final Trial ${String(realmId)}`
    : `${theme.name} ${String(localIdx).padStart(2, "0")}`;

  // Build a raw level shape and run it through the schema parser so all
  // optional defaults (elev=0, gems=0, etc.) get populated and the
  // output matches the Level output type contract exactly.
  const raw = {
    slug,
    realmId,
    levelNumber: n,
    name,
    type,
    difficulty,
    minAccountLevel,
    version: 1,
    map: { width: 6, height: 4, tiles, spawns, exits },
    encounter: {
      waves: [
        {
          index: 1,
          enemies: spawns
            .filter((s) => s.kind === "enemy")
            .map((s, i) => ({
              id: (s as { ref?: string }).ref ?? `enemy-${String(i)}`,
              unit: theme.enemyUnit,
              level: difficulty,
              ai: isBoss ? "aggressive" : "patrol",
            })),
        },
      ],
      scripts: [],
    },
    rewards: {
      xp: 40 + n * 10,
      gold: 15 + n * 4,
      items: [],
      firstClearBonus: {
        xp: 20 + n * 4,
        gold: 8 + n * 2,
        items: [],
      },
    },
  };
  const parsed = levelSchema.safeParse(raw);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`[game-assets] synthesised level ${String(n)} failed validation:\n${summary}`);
  }
  return parsed.data;
};

/** Read every bundled level, validate, and return them sorted by `levelNumber`. */
export const loadAllLevels = (): readonly Level[] => ensureLoaded();

/** Look up a single level by levelNumber. */
export const findLevelByNumber = (levelNumber: number): Level | undefined =>
  ensureLoaded().find((l) => l.levelNumber === levelNumber);

/** Look up by slug — the human-readable id used in editors / URLs. */
export const findLevelBySlug = (slug: string): Level | undefined =>
  ensureLoaded().find((l) => l.slug === slug);

/** Filter by realm (1..5 in the seed). */
export const levelsForRealm = (realmId: number): readonly Level[] =>
  ensureLoaded().filter((l) => l.realmId === realmId);
