// Aetheria — sample-level loader.
//
// Reads the JSON files in `packages/game-assets/levels/` once, validates
// each against `levelSchema`, and exposes them as a typed array. The DB
// seeder (Step 4.16) and the in-memory dev fallback both consume this.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Level, levelSchema } from "./level-schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve `packages/game-assets/levels` relative to the source file. */
const levelsDir = (): string => resolve(HERE, "..", "levels");

let cached: readonly Level[] | null = null;

/**
 * Read every `*.json` file in `levels/`, parse + validate, and return them
 * sorted by `levelNumber`. Throws on the first invalid file with a message
 * pointing at the offending path so authoring errors fail loudly.
 */
export const loadAllLevels = (): readonly Level[] => {
  if (cached) return cached;
  const dir = levelsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const levels: Level[] = [];
  for (const file of files) {
    const path = resolve(dir, file);
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const parsed = levelSchema.safeParse(raw);
    if (!parsed.success) {
      const summary = parsed.error.issues
        .slice(0, 5)
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(`[game-assets] invalid level "${file}":\n${summary}`);
    }
    levels.push(parsed.data);
  }
  levels.sort((a, b) => a.levelNumber - b.levelNumber);
  cached = Object.freeze(levels);

  // Cross-cutting sanity checks the schema can't express on its own.
  const numbers = new Set<number>();
  const slugs = new Set<string>();
  for (const lv of cached) {
    if (numbers.has(lv.levelNumber)) {
      throw new Error(`[game-assets] duplicate levelNumber ${lv.levelNumber.toString()}`);
    }
    numbers.add(lv.levelNumber);
    if (slugs.has(lv.slug)) {
      throw new Error(`[game-assets] duplicate slug "${lv.slug}"`);
    }
    slugs.add(lv.slug);
  }

  return cached;
};

/** Look up a single level by levelNumber. */
export const findLevelByNumber = (levelNumber: number): Level | undefined =>
  loadAllLevels().find((l) => l.levelNumber === levelNumber);

/** Look up by slug — the human-readable id used in editors / URLs. */
export const findLevelBySlug = (slug: string): Level | undefined =>
  loadAllLevels().find((l) => l.slug === slug);

/** Filter by realm (1..5 in the seed). */
export const levelsForRealm = (realmId: number): readonly Level[] =>
  loadAllLevels().filter((l) => l.realmId === realmId);
