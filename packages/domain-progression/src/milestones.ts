// Aetheria — milestone unlocks.
//
// Account-level milestones fire exactly once when the player first reaches
// the listed level. Spec from STEP4_SUB_SCHEDULE 4.29:
//   levels { 5, 10, 15, 25, 40, 60, 80, 100 }
// Specific unlocks align with `docs/01_GAME_GUIDELINE.md` §10/§7:
//   "Level-up surprises every 5 levels: new mechanic
//    (e.g. lvl 15 unlocks Photo Mode, lvl 25 unlocks Co-op)."

import type { Level, Milestone, MilestoneId } from "./types.js";

export const MILESTONES: readonly Milestone[] = Object.freeze([
  { level:   5, id: "second_character_slot", i18nKey: "progression.milestone.second_character_slot" },
  { level:  10, id: "skill_tree",            i18nKey: "progression.milestone.skill_tree" },
  { level:  15, id: "photo_mode",            i18nKey: "progression.milestone.photo_mode" },
  { level:  25, id: "coop",                  i18nKey: "progression.milestone.coop" },
  { level:  40, id: "guild_raids",           i18nKey: "progression.milestone.guild_raids" },
  { level:  60, id: "ranked_pvp",            i18nKey: "progression.milestone.ranked_pvp" },
  { level:  80, id: "endless_tower",         i18nKey: "progression.milestone.endless_tower" },
  { level: 100, id: "weekly_rifts",          i18nKey: "progression.milestone.weekly_rifts" },
] as const satisfies readonly Milestone[]);

const _BY_LEVEL: ReadonlyMap<Level, Milestone> = new Map(
  MILESTONES.map((m) => [m.level, m] as const),
);

const _BY_ID: ReadonlyMap<MilestoneId, Milestone> = new Map(
  MILESTONES.map((m) => [m.id, m] as const),
);

/** Milestone that fires *exactly* at the given level, if any. */
export const milestoneAtLevel = (level: Level): Milestone | null =>
  _BY_LEVEL.get(level) ?? null;

/** Milestones whose level falls in `(fromLevel, toLevel]`. Useful for multi-level jumps. */
export const milestonesCrossing = (
  fromLevel: Level,
  toLevel: Level,
): readonly Milestone[] => {
  if (toLevel <= fromLevel) return [];
  const out: Milestone[] = [];
  for (const m of MILESTONES) {
    if (m.level > fromLevel && m.level <= toLevel) out.push(m);
  }
  return out;
};

export const milestoneById = (id: MilestoneId): Milestone | null =>
  _BY_ID.get(id) ?? null;
