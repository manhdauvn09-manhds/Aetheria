// Aetheria — sample-level loader.
//
// JSON files are imported statically so the bundle/transpile pipeline
// can treat them as data, no runtime `readFileSync`. Validation against
// `levelSchema` runs once on module load — invalid content fails the
// process loudly at startup.

import { type Level, levelSchema } from "./level-schema.js";

import lv001 from "../levels/01-verdant-forest-trail.json" with { type: "json" };
import lv002 from "../levels/02-ashen-cinder-pass.json" with { type: "json" };
import lv003 from "../levels/03-aetheric-cloudbridge.json" with { type: "json" };
import lv004 from "../levels/04-sunken-tideglass-reef.json" with { type: "json" };
import lv005 from "../levels/05-hollow-voidstep-atrium.json" with { type: "json" };
import lv006 from "../levels/06-verdant-hidden-glade.json" with { type: "json" };
import lv007 from "../levels/07-aetheric-spire-trial.json" with { type: "json" };
import lv008 from "../levels/08-hollow-mirror-rift.json" with { type: "json" };
import lv009 from "../levels/09-misty-druid-grove.json" with { type: "json" };
import lv010 from "../levels/10-thornroot-tangle.json" with { type: "json" };
import lv011 from "../levels/11-glowing-firefly-hollow.json" with { type: "json" };
import lv012 from "../levels/12-ironbark-bridge.json" with { type: "json" };
import lv013 from "../levels/13-deepwood-warden.json" with { type: "json" };
import lv014 from "../levels/14-twin-oaks-014.json" with { type: "json" };
import lv015 from "../levels/15-forgotten-watchtower-015.json" with { type: "json" };
import lv016 from "../levels/16-druid-s-reckoning-016.json" with { type: "json" };
import lv017 from "../levels/17-bloodroot-hollow-017.json" with { type: "json" };
import lv018 from "../levels/18-aether-bloom-vale-018.json" with { type: "json" };
import lv019 from "../levels/19-mossy-clearing-019.json" with { type: "json" };
import lv020 from "../levels/20-whispering-reeds-020.json" with { type: "json" };
import lv021 from "../levels/21-magma-veins-021.json" with { type: "json" };
import lv022 from "../levels/22-scorch-plateau-022.json" with { type: "json" };
import lv023 from "../levels/23-glasswind-dunes-023.json" with { type: "json" };
import lv024 from "../levels/24-ember-spires-024.json" with { type: "json" };
import lv025 from "../levels/25-charred-caravan-025.json" with { type: "json" };
import lv026 from "../levels/26-slag-refinery-026.json" with { type: "json" };
import lv027 from "../levels/27-dustdevil-gulch-027.json" with { type: "json" };
import lv028 from "../levels/28-pyre-sanctum-028.json" with { type: "json" };
import lv029 from "../levels/29-lava-bridge-029.json" with { type: "json" };
import lv030 from "../levels/30-obsidian-throne-030.json" with { type: "json" };
import lv031 from "../levels/31-sundered-forge-031.json" with { type: "json" };
import lv032 from "../levels/32-blackrock-pit-032.json" with { type: "json" };
import lv033 from "../levels/33-crucible-of-flame-033.json" with { type: "json" };
import lv034 from "../levels/34-wyrmsong-cradle-034.json" with { type: "json" };
import lv035 from "../levels/35-smoldering-cathedral-035.json" with { type: "json" };
import lv036 from "../levels/36-pyromancer-s-tomb-036.json" with { type: "json" };
import lv037 from "../levels/37-cinder-pass-037.json" with { type: "json" };
import lv038 from "../levels/38-ash-drift-038.json" with { type: "json" };
import lv039 from "../levels/39-magma-veins-039.json" with { type: "json" };
import lv040 from "../levels/40-scorch-plateau-040.json" with { type: "json" };
import lv041 from "../levels/41-snowbound-camp-041.json" with { type: "json" };
import lv042 from "../levels/42-icefang-ridge-042.json" with { type: "json" };
import lv043 from "../levels/43-aurora-span-043.json" with { type: "json" };
import lv044 from "../levels/44-blizzard-mire-044.json" with { type: "json" };
import lv045 from "../levels/45-frost-glass-atrium-045.json" with { type: "json" };
import lv046 from "../levels/46-whitehorn-pass-046.json" with { type: "json" };
import lv047 from "../levels/47-howl-cavern-047.json" with { type: "json" };
import lv048 from "../levels/48-rimebound-spire-048.json" with { type: "json" };
import lv049 from "../levels/49-shattered-throne-049.json" with { type: "json" };
import lv050 from "../levels/50-pale-saint-s-altar-050.json" with { type: "json" };
import lv051 from "../levels/51-cold-iron-bastion-051.json" with { type: "json" };
import lv052 from "../levels/52-glacial-choir-052.json" with { type: "json" };
import lv053 from "../levels/53-the-final-drift-053.json" with { type: "json" };
import lv054 from "../levels/54-spire-of-first-snow-054.json" with { type: "json" };
import lv055 from "../levels/55-frozen-causeway-055.json" with { type: "json" };
import lv056 from "../levels/56-glacier-maw-056.json" with { type: "json" };
import lv057 from "../levels/57-wraithwall-057.json" with { type: "json" };
import lv058 from "../levels/58-cryolite-vault-058.json" with { type: "json" };
import lv059 from "../levels/59-snowbound-camp-059.json" with { type: "json" };
import lv060 from "../levels/60-icefang-ridge-060.json" with { type: "json" };
import lv061 from "../levels/61-drowning-choir-061.json" with { type: "json" };
import lv062 from "../levels/62-pearl-cathedral-062.json" with { type: "json" };
import lv063 from "../levels/63-stormbreak-quay-063.json" with { type: "json" };
import lv064 from "../levels/64-maelstrom-spire-064.json" with { type: "json" };
import lv065 from "../levels/65-anchor-s-doom-065.json" with { type: "json" };
import lv066 from "../levels/66-reefborn-atoll-066.json" with { type: "json" };
import lv067 from "../levels/67-glassmaker-s-forge-067.json" with { type: "json" };
import lv068 from "../levels/68-deepwatch-tower-068.json" with { type: "json" };
import lv069 from "../levels/69-coralbone-reckoning-069.json" with { type: "json" };
import lv070 from "../levels/70-sunken-armory-070.json" with { type: "json" };
import lv071 from "../levels/71-the-whisper-vault-071.json" with { type: "json" };
import lv072 from "../levels/72-tide-glass-sanctum-072.json" with { type: "json" };
import lv073 from "../levels/73-coral-drift-073.json" with { type: "json" };
import lv074 from "../levels/74-sunken-causeway-074.json" with { type: "json" };
import lv075 from "../levels/75-tidehollow-reef-075.json" with { type: "json" };
import lv076 from "../levels/76-brine-halls-076.json" with { type: "json" };
import lv077 from "../levels/77-leviathan-s-rest-077.json" with { type: "json" };
import lv078 from "../levels/78-salt-pier-078.json" with { type: "json" };
import lv079 from "../levels/79-drowning-choir-079.json" with { type: "json" };
import lv080 from "../levels/80-pearl-cathedral-080.json" with { type: "json" };
import lv081 from "../levels/81-aether-tomb-081.json" with { type: "json" };
import lv082 from "../levels/82-twisted-spire-082.json" with { type: "json" };
import lv083 from "../levels/83-whisper-gallery-083.json" with { type: "json" };
import lv084 from "../levels/84-forgotten-sigil-084.json" with { type: "json" };
import lv085 from "../levels/85-cradle-of-nothing-085.json" with { type: "json" };
import lv086 from "../levels/86-anti-light-chapel-086.json" with { type: "json" };
import lv087 from "../levels/87-the-inverted-path-087.json" with { type: "json" };
import lv088 from "../levels/88-ouroboros-coil-088.json" with { type: "json" };
import lv089 from "../levels/89-final-mirror-089.json" with { type: "json" };
import lv090 from "../levels/90-convergence-altar-090.json" with { type: "json" };
import lv091 from "../levels/91-splintered-reality-091.json" with { type: "json" };
import lv092 from "../levels/92-echo-atrium-092.json" with { type: "json" };
import lv093 from "../levels/93-voidstep-maze-093.json" with { type: "json" };
import lv094 from "../levels/94-mirror-hall-094.json" with { type: "json" };
import lv095 from "../levels/95-null-forge-095.json" with { type: "json" };
import lv096 from "../levels/96-hollow-pact-096.json" with { type: "json" };
import lv097 from "../levels/97-reality-tear-097.json" with { type: "json" };
import lv098 from "../levels/98-silence-sanctum-098.json" with { type: "json" };
import lv099 from "../levels/99-aether-tomb-099.json" with { type: "json" };
import lv100 from "../levels/100-twisted-spire-100.json" with { type: "json" };

const RAW_LEVELS: readonly unknown[] = [
  lv001, lv002, lv003, lv004, lv005, lv006, lv007, lv008,
  lv009, lv010, lv011, lv012, lv013, lv014, lv015, lv016,
  lv017, lv018, lv019, lv020, lv021, lv022, lv023, lv024,
  lv025, lv026, lv027, lv028, lv029, lv030, lv031, lv032,
  lv033, lv034, lv035, lv036, lv037, lv038, lv039, lv040,
  lv041, lv042, lv043, lv044, lv045, lv046, lv047, lv048,
  lv049, lv050, lv051, lv052, lv053, lv054, lv055, lv056,
  lv057, lv058, lv059, lv060, lv061, lv062, lv063, lv064,
  lv065, lv066, lv067, lv068, lv069, lv070, lv071, lv072,
  lv073, lv074, lv075, lv076, lv077, lv078, lv079, lv080,
  lv081, lv082, lv083, lv084, lv085, lv086, lv087, lv088,
  lv089, lv090, lv091, lv092, lv093, lv094, lv095, lv096,
  lv097, lv098, lv099, lv100
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
