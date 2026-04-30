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
