export {
  type RngState,
  makeRng,
  seedFromString,
  next,
  nextInt,
  pick,
  rollDice,
  chance,
} from "./rng.js";

export {
  apCost,
  lineOfSight,
  rangeReachable,
  elementAdvantage,
  resonanceCheck,
  type ReachableTile,
  type ResonanceMatch,
} from "./helpers.js";

export {
  // Enums
  Elements,
  Statuses,
  Sides,
  BattleTerrains,
  BattlePhases,
  ELEMENT_WHEEL,
  HEX_DIRS,
  // Type aliases for the union members
  type Element,
  type Status,
  type Side,
  type BattleTerrain,
  type BattlePhase,
  // Core data
  type Coord,
  type Tile,
  type StatusEffect,
  type ActorId,
  type SkillId,
  type ActorStats,
  type Actor,
  type BattleConfig,
  type BattleState,
  // Actions
  type MoveAction,
  type AttackAction,
  type UseSkillAction,
  type DefendAction,
  type EndTurnAction,
  type Action,
  // Events
  type BaseEvent,
  type ActorMovedEvent,
  type DamageDealtEvent,
  type HealedEvent,
  type StatusAppliedEvent,
  type StatusExpiredEvent,
  type ActorDefeatedEvent,
  type ResonanceTriggeredEvent,
  type TurnStartedEvent,
  type TurnEndedEvent,
  type BattleEndedEvent,
  type Event,
  // Helpers
  sameCoord,
  hexDistance,
} from "./types.js";
