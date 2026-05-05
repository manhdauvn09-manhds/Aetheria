// Aetheria — in-process domain event bus.
//
// MVP fan-out is single-process: services call `events.publish(...)` and
// every subscriber runs in the same Node event loop. We isolate handler
// failures (one bad consumer must not break the others) and we await all
// handlers so the publisher knows side-effects have settled by the time
// `publish` resolves — important for tests and request-bound flows.
//
// When we add a durable outbox + workers (BullMQ) in 4-I, an OutboxBus
// will replace this singleton at the wiring boundary; consumer code
// continues to call `events.publish(...)` unchanged.

import { randomUUID } from "node:crypto";

import type {
  AnyDomainEventHandler,
  DomainEvent,
  DomainEventHandler,
  DomainEventOf,
  DomainEventType,
  NewDomainEvent,
} from "./types.js";

export type Unsubscribe = () => void;

export class EventBus {
  private readonly typed = new Map<DomainEventType, Set<AnyDomainEventHandler>>();
  private readonly all = new Set<AnyDomainEventHandler>();

  subscribe<T extends DomainEventType>(
    type: T,
    handler: DomainEventHandler<T>,
  ): Unsubscribe {
    let set = this.typed.get(type);
    if (!set) {
      set = new Set();
      this.typed.set(type, set);
    }
    const wrapped = handler as AnyDomainEventHandler;
    set.add(wrapped);
    return () => {
      const current = this.typed.get(type);
      if (current) current.delete(wrapped);
    };
  }

  subscribeAll(handler: AnyDomainEventHandler): Unsubscribe {
    this.all.add(handler);
    return () => this.all.delete(handler);
  }

  /** Number of subscribers for a specific type (excludes `subscribeAll`). */
  listenerCount(type: DomainEventType): number {
    return this.typed.get(type)?.size ?? 0;
  }

  /** Drop every subscriber. Useful in tests; not for production code paths. */
  removeAll(): void {
    this.typed.clear();
    this.all.clear();
  }

  /**
   * Build + publish in one call. Defaults `id` to a UUID and `occurredAt`
   * to `new Date()` so callers don't have to thread those through.
   */
  async emit<T extends DomainEventType>(
    type: T,
    payload: NewDomainEvent<T>,
  ): Promise<DomainEventOf<T>> {
    const event = {
      id: payload.id ?? randomUUID(),
      occurredAt: payload.occurredAt ?? new Date(),
      ...payload,
      type,
    } as unknown as DomainEventOf<T>;
    await this.publish(event);
    return event;
  }

  /**
   * Publish a fully-formed event. Awaits all handlers and surfaces a
   * single `AggregateError` if any of them throws — the rest still run.
   */
  async publish(event: DomainEvent): Promise<void> {
    const typedSet = this.typed.get(event.type);
    const handlers: AnyDomainEventHandler[] = [];
    if (typedSet) handlers.push(...typedSet);
    if (this.all.size > 0) handlers.push(...this.all);

    if (handlers.length === 0) return;

    const errors: unknown[] = [];
    await Promise.all(
      handlers.map(async (h) => {
        try {
          await h(event);
        } catch (e) {
          errors.push(e);
        }
      }),
    );
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `EventBus: ${errors.length} handlers failed for ${event.type}`);
    }
  }
}

/**
 * Module-level singleton. Domain services import this for `publish`/`emit`
 * and apps wire subscribers at startup. Mirrors the `audit` pattern in
 * `@aetheria/core` — explicit, named, and easy to find at call sites.
 */
export const events = new EventBus();
