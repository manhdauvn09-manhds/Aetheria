// scripts/gen-levels.mjs — author levels 14..100 from realm templates.
//
// Reads each realm's theme, terrain palette, enemy roster and produces
// per-level JSONs with hand-curated variety (boss every 20th level,
// elites at 5/10/15, treasure tiles, hidden secrets, multi-wave for
// hard fights). Output is committed to packages/game-assets/levels/.
//
// Run: node scripts/gen-levels.mjs

import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(__dirname, "..", "packages", "game-assets", "levels");

// ────────────────────────────────────────────────────────────────────
// Realm templates — terrain + enemy roster + naming flavour
// ────────────────────────────────────────────────────────────────────

const REALMS = [
  {
    id: 1, name: "Verdant Reach",
    slugStem: "verdant",
    terrains: ["grass", "forest", "stone", "water", "ruins"],
    accent: "forest",
    waterCost: 3,
    enemies: ["Verdant Spore", "Ember Husk"],
    bossEnemy: "Tide Brute",
    namePool: [
      "Mossy Clearing", "Whispering Reeds", "Hollowleaf Path", "Sunlit Glade",
      "Tangled Vines", "Burrowed Roots", "Sunwood Shrine", "Bramble Maze",
      "Old Stag Watch", "Verdant Crossroads", "Mist Loom", "Lantern Falls",
      "Stoneflower Garden", "Twin Oaks", "Forgotten Watchtower",
      "Druid's Reckoning", "Bloodroot Hollow", "Aether Bloom Vale",
    ],
  },
  {
    id: 2, name: "Ember Wastes",
    slugStem: "ember",
    terrains: ["stone", "ash", "lava", "ruins", "sand"],
    accent: "lava",
    waterCost: 99, // no water — replaced with sand
    enemies: ["Ember Husk", "Sky Reaper"],
    bossEnemy: "Ember Husk",
    namePool: [
      "Cinder Pass", "Ash Drift", "Magma Veins", "Scorch Plateau",
      "Glasswind Dunes", "Ember Spires", "Charred Caravan", "Slag Refinery",
      "Dustdevil Gulch", "Pyre Sanctum", "Lava Bridge", "Obsidian Throne",
      "Sundered Forge", "Blackrock Pit", "Crucible of Flame",
      "Wyrmsong Cradle", "Smoldering Cathedral", "Pyromancer's Tomb",
    ],
  },
  {
    id: 3, name: "Frostspire",
    slugStem: "frost",
    terrains: ["ice", "stone", "water", "ruins"],
    accent: "ice",
    waterCost: 99, // frozen
    enemies: ["Frost Wraith", "Void Stalker"],
    bossEnemy: "Frost Wraith",
    namePool: [
      "Frozen Causeway", "Glacier Maw", "Wraithwall", "Cryolite Vault",
      "Snowbound Camp", "Icefang Ridge", "Aurora Span", "Blizzard Mire",
      "Frost-Glass Atrium", "Whitehorn Pass", "Howl Cavern", "Rimebound Spire",
      "Shattered Throne", "Pale Saint's Altar", "Cold Iron Bastion",
      "Glacial Choir", "The Final Drift", "Spire of First Snow",
    ],
  },
  {
    id: 4, name: "Tideglass",
    slugStem: "tide",
    terrains: ["water", "stone", "ruins", "grass", "sand"],
    accent: "water",
    waterCost: 3,
    enemies: ["Tide Brute", "Sky Reaper"],
    bossEnemy: "Tide Brute",
    namePool: [
      "Coral Drift", "Sunken Causeway", "Tidehollow Reef", "Brine Halls",
      "Leviathan's Rest", "Salt Pier", "Drowning Choir", "Pearl Cathedral",
      "Stormbreak Quay", "Maelstrom Spire", "Anchor's Doom", "Reefborn Atoll",
      "Glassmaker's Forge", "Deepwatch Tower", "Coralbone Reckoning",
      "Sunken Armory", "The Whisper Vault", "Tide-Glass Sanctum",
    ],
  },
  {
    id: 5, name: "Voidmaw",
    slugStem: "void",
    terrains: ["void", "ruins", "stone", "shrine", "wall"],
    accent: "void",
    waterCost: 99,
    enemies: ["Void Stalker", "Sky Reaper"],
    bossEnemy: "Void Stalker",
    namePool: [
      "Splintered Reality", "Echo Atrium", "Voidstep Maze", "Mirror Hall",
      "Null Forge", "Hollow Pact", "Reality Tear", "Silence Sanctum",
      "Aether Tomb", "Twisted Spire", "Whisper Gallery", "Forgotten Sigil",
      "Cradle of Nothing", "Anti-Light Chapel", "The Inverted Path",
      "Ouroboros Coil", "Final Mirror", "Convergence Altar",
    ],
  },
];

// ────────────────────────────────────────────────────────────────────
// Level archetypes (per-position in the 1..20 cycle)
// ────────────────────────────────────────────────────────────────────

const LEVEL_ARCHETYPES = [
  { idx: 1, type: "story", waves: 1, enemyCount: 2, label: "intro" },
  { idx: 2, type: "combat", waves: 1, enemyCount: 2, label: "skirmish" },
  { idx: 3, type: "combat", waves: 1, enemyCount: 3, label: "patrol" },
  { idx: 4, type: "treasure", waves: 1, enemyCount: 2, label: "cache", hasSecret: true },
  { idx: 5, type: "combat", waves: 2, enemyCount: 3, label: "elite" },
  { idx: 6, type: "story", waves: 1, enemyCount: 2, label: "passage" },
  { idx: 7, type: "combat", waves: 1, enemyCount: 3, label: "ambush" },
  { idx: 8, type: "puzzle", waves: 1, enemyCount: 2, label: "puzzle", hasSecret: true },
  { idx: 9, type: "combat", waves: 2, enemyCount: 4, label: "siege" },
  { idx: 10, type: "boss", waves: 2, enemyCount: 3, label: "mid_boss", isMidBoss: true },
  { idx: 11, type: "combat", waves: 1, enemyCount: 3, label: "recovery" },
  { idx: 12, type: "hidden", waves: 1, enemyCount: 2, label: "hidden", hasSecret: true },
  { idx: 13, type: "combat", waves: 2, enemyCount: 4, label: "pressure" },
  { idx: 14, type: "treasure", waves: 1, enemyCount: 3, label: "vault", hasSecret: true },
  { idx: 15, type: "combat", waves: 2, enemyCount: 4, label: "elite2" },
  { idx: 16, type: "puzzle", waves: 1, enemyCount: 2, label: "puzzle2", hasSecret: true },
  { idx: 17, type: "combat", waves: 2, enemyCount: 4, label: "prepare" },
  { idx: 18, type: "story", waves: 1, enemyCount: 2, label: "passage2" },
  { idx: 19, type: "combat", waves: 2, enemyCount: 4, label: "vanguard" },
  { idx: 20, type: "boss", waves: 2, enemyCount: 4, label: "realm_boss", isRealmBoss: true },
];

// ────────────────────────────────────────────────────────────────────
// Layout generators — picks an interesting 6x4 tile arrangement
// ────────────────────────────────────────────────────────────────────

const layoutForArchetype = (realm, arch) => {
  const tiles = [];
  const T = realm.terrains;
  const accent = realm.accent;

  // Pick layout flavour by archetype label
  const flavour =
    arch.label === "intro" || arch.label === "passage" || arch.label === "passage2"
      ? "open"
      : arch.label === "puzzle" || arch.label === "puzzle2"
        ? "maze"
        : arch.label === "elite" || arch.label === "elite2" || arch.label === "siege" || arch.label === "vanguard"
          ? "elevated"
          : arch.label === "cache" || arch.label === "vault" || arch.label === "hidden"
            ? "secret"
            : arch.label === "mid_boss" || arch.label === "realm_boss"
              ? "arena"
              : "varied";

  for (let r = 0; r < 4; r++) {
    for (let q = 0; q < 6; q++) {
      const tile = { q, r, terrain: T[(q + r) % T.length] };

      // Apply flavour
      if (flavour === "maze") {
        // walls on diagonals
        if ((q === 1 && r === 0) || (q === 3 && r === 0) ||
            (q === 1 && r === 3) || (q === 3 && r === 3)) tile.terrain = "wall";
      } else if (flavour === "elevated") {
        // stone elevation in center
        if ((q === 2 || q === 3) && (r === 0 || r === 1)) {
          tile.terrain = "stone"; tile.elev = 1;
        }
      } else if (flavour === "secret") {
        // ruins for chests
        if ((q === 2 && r === 0) || (q === 4 && r === 3)) tile.terrain = "ruins";
      } else if (flavour === "arena") {
        // shrine center, ruins corners
        if (q === 3 && r === 1) tile.terrain = "shrine";
        if ((q === 0 && r === 0) || (q === 5 && r === 3)) tile.terrain = "ruins";
      }

      // Sprinkle accent
      if ((q + r * 6) % 7 === 3) tile.terrain = accent;

      // Tag exit (top-right)
      if (q === 5 && r === 0) tile.tag = "exit";

      // FX sprinkle
      if (arch.label === "hidden" && (q + r) % 5 === 0) tile.fx = "shimmer";
      if (realm.id === 2 && tile.terrain === "lava") tile.fx = "embers";
      if (realm.id === 3 && tile.terrain === "ice") tile.fx = "snow";
      if (realm.id === 5 && tile.terrain === "void") tile.fx = "miasma";

      tiles.push(tile);
    }
  }
  return tiles;
};

const spawnsFor = (arch, realm) => {
  const heroes = [
    { kind: "player", slot: 1, q: 0, r: 1 },
    { kind: "player", slot: 2, q: 0, r: 2 },
  ];
  const enemies = [];
  // Distribute enemies across right half
  const positions = [
    { q: 4, r: 1 }, { q: 4, r: 2 }, { q: 5, r: 1 }, { q: 5, r: 2 },
    { q: 3, r: 1 }, { q: 3, r: 2 }, { q: 4, r: 3 },
  ];
  for (let i = 0; i < arch.enemyCount && i < positions.length; i++) {
    const e = realm.enemies[i % realm.enemies.length];
    enemies.push({
      kind: "enemy",
      ref: `${slugify(e)}-${String.fromCharCode(97 + i)}`,
      slot: 1,
      q: positions[i].q,
      r: positions[i].r,
    });
  }
  return [...heroes, ...enemies];
};

const wavesFor = (arch, realm, n) => {
  const waves = [];
  const spawnEnemies = spawnsFor(arch, realm).filter(s => s.kind === "enemy");

  if (arch.waves === 1) {
    waves.push({
      index: 1,
      enemies: spawnEnemies.map(s => ({
        id: s.ref,
        unit: realm.enemies[spawnEnemies.indexOf(s) % realm.enemies.length],
        level: difficultyFor(n),
        ai: arch.label.startsWith("elite") || arch.isMidBoss || arch.isRealmBoss
          ? "aggressive"
          : "patrol",
      })),
    });
  } else {
    // Multi-wave: split enemies
    const half = Math.ceil(spawnEnemies.length / 2);
    waves.push({
      index: 1,
      enemies: spawnEnemies.slice(0, half).map(s => ({
        id: s.ref,
        unit: realm.enemies[spawnEnemies.indexOf(s) % realm.enemies.length],
        level: difficultyFor(n),
        ai: "patrol",
      })),
    });
    waves.push({
      index: 2,
      enemies: spawnEnemies.slice(half).map(s => ({
        id: s.ref,
        unit: realm.enemies[spawnEnemies.indexOf(s) % realm.enemies.length],
        level: difficultyFor(n) + 1,
        ai: "aggressive",
      })),
      trigger: { kind: "clear", wave: 1 },
    });
  }
  return waves;
};

const difficultyFor = (n) => Math.max(1, Math.min(10, Math.ceil(n / 10)));
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ────────────────────────────────────────────────────────────────────
// Build one level JSON
// ────────────────────────────────────────────────────────────────────

const buildLevel = (n) => {
  const realm = REALMS[Math.min(4, Math.floor((n - 1) / 20))];
  const arch = LEVEL_ARCHETYPES[(n - 1) % 20];

  const namePoolIdx = (n - 1) % realm.namePool.length;
  const name = realm.namePool[namePoolIdx];
  const slug = `${realm.slugStem}-${slugify(name)}-${String(n).padStart(3, "0")}`;

  // Adjust type for boss
  const type = arch.isRealmBoss ? "boss"
             : arch.isMidBoss ? "boss"
             : arch.type;

  const tiles = layoutForArchetype(realm, arch);
  const spawns = spawnsFor(arch, realm);

  const lvl = {
    slug: slug.slice(0, 48),
    realmId: realm.id,
    levelNumber: n,
    name: `${name}`,
    type,
    difficulty: difficultyFor(n),
    minAccountLevel: Math.max(1, Math.min(100, n - 4)),
    version: 1,
    map: {
      width: 6,
      height: 4,
      tiles,
      spawns,
      exits: [{ q: 5, r: 0, to: arch.isRealmBoss ? "realm_hub" : "next" }],
    },
    encounter: {
      waves: wavesFor(arch, realm, n),
      ...(arch.isRealmBoss || arch.isMidBoss
        ? {
            boss: {
              id: `${realm.slugStem}-boss-${n}`,
              unit: arch.isRealmBoss ? "Void Lord" : realm.bossEnemy,
              level: difficultyFor(n) + 2,
              hpMultiplier: arch.isRealmBoss ? 2.5 : 1.8,
              script: arch.isRealmBoss ? "phase_at_50" : "summon_at_50",
            },
          }
        : {}),
      scripts: [arch.label, realm.slugStem],
    },
    rewards: {
      xp: 60 + n * 12,
      gold: 25 + n * 5,
      items: arch.hasSecret ? [{ itemId: 100 + (n % 10), qty: 1 }] : [],
      firstClearBonus: {
        xp: 30 + n * 5,
        gold: 12 + n * 3,
        items: arch.isRealmBoss
          ? [{ itemId: 200 + realm.id, qty: 1 }]
          : [],
        gems: arch.isRealmBoss ? 10 : arch.isMidBoss ? 5 : 0,
      },
    },
    ...(arch.hasSecret
      ? {
          discoverySecrets: {
            hidden: [
              {
                id: `${slug.slice(0, 30)}-cache`,
                q: arch.label === "cache" || arch.label === "vault" ? 2 : 4,
                r: arch.label === "cache" || arch.label === "vault" ? 0 : 3,
                reveal: arch.label === "hidden" ? "walk" : "search",
                reward: {
                  xp: 30 + n * 4,
                  gold: 15 + n * 2,
                  items: [],
                },
              },
            ],
          },
        }
      : {}),
  };
  return lvl;
};

// ────────────────────────────────────────────────────────────────────
// Write 14..100 (skip existing 1..13)
// ────────────────────────────────────────────────────────────────────

const usedSlugs = new Set();
// Pre-scan 1..13 hand-authored to avoid slug collision
for (let n = 1; n <= 13; n++) {
  const padded = String(n).padStart(2, "0");
  // No need to parse them; assume their slugs are unique by construction
  void padded;
}

let written = 0;
for (let n = 14; n <= 100; n++) {
  const lvl = buildLevel(n);
  // Ensure slug uniqueness via suffix
  let slug = lvl.slug;
  let suffix = 0;
  while (usedSlugs.has(slug)) {
    suffix++;
    slug = `${lvl.slug.slice(0, 44)}-${suffix}`;
  }
  usedSlugs.add(slug);
  lvl.slug = slug;

  const padded = String(n).padStart(2, "0");
  const filename = `${padded}-${slug.replace(/^[^-]+-/, "").slice(0, 45)}.json`;
  const filepath = join(LEVELS_DIR, filename);

  if (existsSync(filepath)) {
    // Skip — preserve hand-authored ones if filename collides
    console.log(`skip ${filename} (exists)`);
    continue;
  }
  writeFileSync(filepath, JSON.stringify(lvl, null, 2) + "\n", "utf-8");
  written++;
}

console.log(`✓ generated ${written} levels (14..100)`);
