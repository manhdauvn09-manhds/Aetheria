export {
  QuestService,
  type QuestsDeps,
  type QuestsMysqlClient,
} from "./service.js";

export {
  createQuestsRouter,
  type QuestsRouter,
} from "./router.js";

export {
  parseRequirement,
  parseRewards,
  parseProgress,
  eventMatchesRequirement,
  applyEventToProgress,
  isRequirementComplete,
  isQuestActive,
} from "./rules.js";

export type {
  QuestKind,
  QuestStatus,
  QuestRequirement,
  QuestReward,
  QuestProgress,
  QuestCatalog,
  QuestEntry,
  QuestListResult,
  QuestListInput,
  QuestClaimInput,
  QuestClaimResult,
} from "./types.js";
