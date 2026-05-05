// Aetheria — domain event union.
//
// Pure data shapes. The bus (`bus.ts`) routes these to subscribers and
// future workers (BullMQ outbox) will persist + replay them. Strings used
// throughout for ids so cross-process serialisation stays trivial.

export interface BaseDomainEvent {
  /** Stable event id (UUID-like). Consumers may use it for idempotency. */
  readonly id: string;
  /** Owning user — every domain event in MVP is per-user. */
  readonly userId: string;
  readonly occurredAt: Date;
}

export interface LeveledUpEvent extends BaseDomainEvent {
  readonly type: "LeveledUp";
  readonly from: number;
  readonly to: number;
  /** `MilestoneId`s crossed in this transition (may be empty). */
  readonly milestoneIds: readonly string[];
}

export interface EnemyDefeatedEvent extends BaseDomainEvent {
  readonly type: "EnemyDefeated";
  readonly runId: string;
  readonly enemyId: string;
  /** Archetype tag (e.g. "minion", "elite", "boss"). Optional. */
  readonly archetype?: string;
}

export interface LevelCompletedEvent extends BaseDomainEvent {
  readonly type: "LevelCompleted";
  readonly runId: string;
  readonly levelId: string;
  readonly score: number;
  readonly stars: number;
}

export interface ItemCraftedEvent extends BaseDomainEvent {
  readonly type: "ItemCrafted";
  readonly outputItemId: string;
  readonly outputQuantity: number;
  readonly inputs: readonly {
    readonly itemId: string;
    readonly quantity: number;
  }[];
}

export interface RunFinishedEvent extends BaseDomainEvent {
  readonly type: "RunFinished";
  readonly runId: string;
  readonly levelId: string;
  readonly status: "completed" | "failed" | "abandoned";
  readonly score: number;
  readonly stars: number;
}

export type DomainEvent =
  | LeveledUpEvent
  | EnemyDefeatedEvent
  | LevelCompletedEvent
  | ItemCraftedEvent
  | RunFinishedEvent;

export type DomainEventType = DomainEvent["type"];

/** Map a `DomainEventType` to the concrete event shape. */
export type DomainEventOf<T extends DomainEventType> = Extract<
  DomainEvent,
  { type: T }
>;

export type DomainEventHandler<T extends DomainEventType> = (
  event: DomainEventOf<T>,
) => void | Promise<void>;

export type AnyDomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * Factory input for `EventBus.emit(type, payload)`. The discriminator
 * `type` is supplied by the first argument, and `id` / `occurredAt`
 * default-fill when omitted.
 */
export type NewDomainEvent<T extends DomainEventType> = Omit<
  DomainEventOf<T>,
  "id" | "occurredAt" | "type"
> & {
  readonly id?: string;
  readonly occurredAt?: Date;
};
