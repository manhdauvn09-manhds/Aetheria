export {
  BattlePassService,
  type BattlePassDeps,
  type BattlePassMysqlClient,
} from "./service.js";

export { createBattlePassRouter, type BattlePassRouter } from "./router.js";

export {
  XP_PER_TIER,
  MAX_TIER,
  parseTracks,
  maxTier,
  xpForTier,
  tierFromXp,
  eventXpDelta,
  evaluateClaim,
  isSeasonActive,
  type ClaimEligibility,
} from "./rules.js";

export type {
  BattlePassEntry,
  BattlePassReward,
  BattlePassSeasonCatalog,
  BattlePassTier,
  BattlePassTracks,
  BattlePassUserState,
  ClaimInput,
  ClaimResult,
  CurrentSeasonInput,
  CurrentSeasonResult,
  ProgressInput,
  ProgressResult,
} from "./types.js";
