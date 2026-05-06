export {
  NotificationsService,
  type NotificationsDeps,
  type NotificationsMysqlClient,
} from "./service.js";

export {
  createNotificationsRouter,
  type NotificationsRouter,
} from "./router.js";

export {
  isKnownType,
  categoryOf,
  parsePayload,
  type NotificationCategory,
} from "./rules.js";

export type {
  NotificationType,
  NotificationRow,
  PushInput,
  ListInput,
  MarkReadInput,
} from "./types.js";
