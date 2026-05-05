export {
  MIN_LEVEL,
  MAX_LEVEL,
  XP_BASE,
  XP_EXPONENT,
  xpForLevel,
  xpToReach,
  levelFromTotalXp,
} from "./curve.js";

export {
  MILESTONES,
  milestoneAtLevel,
  milestonesCrossing,
  milestoneById,
} from "./milestones.js";

export {
  initialProgression,
  assertValidProgression,
  checkLevelUp,
  addXp,
} from "./levelup.js";

export type {
  Level,
  Xp,
  Progression,
  Milestone,
  MilestoneId,
  LeveledUpEvent,
  AddXpResult,
} from "./types.js";
