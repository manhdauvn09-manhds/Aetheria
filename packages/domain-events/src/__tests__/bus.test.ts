import { afterEach, describe, expect, it, vi } from "vitest";

import { EventBus, events } from "../bus.js";
import type { ItemCraftedEvent, LeveledUpEvent } from "../types.js";

afterEach(() => {
  events.removeAll();
});

const fixedItemCrafted = (
  overrides: Partial<ItemCraftedEvent> = {},
): ItemCraftedEvent => ({
  id: "evt-1",
  userId: "1",
  occurredAt: new Date("2026-05-05T00:00:00Z"),
  type: "ItemCrafted",
  outputItemId: "100",
  outputQuantity: 1,
  inputs: [{ itemId: "10", quantity: 3 }],
  ...overrides,
});

describe("EventBus.subscribe + publish", () => {
  it("delivers to a typed subscriber", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("ItemCrafted", handler);
    const event = fixedItemCrafted();
    await bus.publish(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does NOT deliver to subscribers of other types", async () => {
    const bus = new EventBus();
    const itemHandler = vi.fn();
    const levelHandler = vi.fn();
    bus.subscribe("ItemCrafted", itemHandler);
    bus.subscribe("LeveledUp", levelHandler);
    await bus.publish(fixedItemCrafted());
    expect(itemHandler).toHaveBeenCalledTimes(1);
    expect(levelHandler).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers of the same type", async () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("ItemCrafted", a);
    bus.subscribe("ItemCrafted", b);
    await bus.publish(fixedItemCrafted());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("listenerCount reflects subscribers", () => {
    const bus = new EventBus();
    expect(bus.listenerCount("ItemCrafted")).toBe(0);
    const off = bus.subscribe("ItemCrafted", vi.fn());
    expect(bus.listenerCount("ItemCrafted")).toBe(1);
    off();
    expect(bus.listenerCount("ItemCrafted")).toBe(0);
  });

  it("returns an unsubscribe fn that detaches the handler", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.subscribe("ItemCrafted", handler);
    off();
    await bus.publish(fixedItemCrafted());
    expect(handler).not.toHaveBeenCalled();
  });

  it("awaits async handlers before resolving publish", async () => {
    const bus = new EventBus();
    let resolved = false;
    bus.subscribe("ItemCrafted", async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
    });
    await bus.publish(fixedItemCrafted());
    expect(resolved).toBe(true);
  });
});

describe("EventBus.subscribeAll", () => {
  it("delivers every event to wildcard subscribers", async () => {
    const bus = new EventBus();
    const all = vi.fn();
    bus.subscribeAll(all);
    await bus.publish(fixedItemCrafted());
    await bus.publish({
      id: "evt-2",
      userId: "1",
      occurredAt: new Date(),
      type: "LeveledUp",
      from: 1,
      to: 2,
      milestoneIds: [],
    } satisfies LeveledUpEvent);
    expect(all).toHaveBeenCalledTimes(2);
  });

  it("co-exists with typed subscribers (both receive the event)", async () => {
    const bus = new EventBus();
    const typed = vi.fn();
    const all = vi.fn();
    bus.subscribe("ItemCrafted", typed);
    bus.subscribeAll(all);
    await bus.publish(fixedItemCrafted());
    expect(typed).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(1);
  });
});

describe("EventBus.publish error isolation", () => {
  it("re-throws a single handler error verbatim", async () => {
    const bus = new EventBus();
    const boom = new Error("boom");
    bus.subscribe("ItemCrafted", () => {
      throw boom;
    });
    await expect(bus.publish(fixedItemCrafted())).rejects.toBe(boom);
  });

  it("runs all handlers even if one throws", async () => {
    const bus = new EventBus();
    const ok = vi.fn();
    bus.subscribe("ItemCrafted", () => {
      throw new Error("first fails");
    });
    bus.subscribe("ItemCrafted", ok);
    await expect(bus.publish(fixedItemCrafted())).rejects.toThrow("first fails");
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("aggregates multiple handler errors", async () => {
    const bus = new EventBus();
    bus.subscribe("ItemCrafted", () => {
      throw new Error("a");
    });
    bus.subscribe("ItemCrafted", () => {
      throw new Error("b");
    });
    await expect(bus.publish(fixedItemCrafted())).rejects.toBeInstanceOf(AggregateError);
  });

  it("isolates wildcard errors from typed handlers (and vice versa)", async () => {
    const bus = new EventBus();
    const typed = vi.fn();
    bus.subscribe("ItemCrafted", typed);
    bus.subscribeAll(() => {
      throw new Error("wildcard");
    });
    await expect(bus.publish(fixedItemCrafted())).rejects.toThrow("wildcard");
    expect(typed).toHaveBeenCalledTimes(1);
  });
});

describe("EventBus.emit", () => {
  it("auto-fills id + occurredAt", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("ItemCrafted", handler);
    const before = Date.now();
    const event = await bus.emit("ItemCrafted", {
      userId: "1",
      outputItemId: "100",
      outputQuantity: 1,
      inputs: [{ itemId: "10", quantity: 3 }],
    });
    expect(typeof event.id).toBe("string");
    expect(event.id.length).toBeGreaterThan(0);
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("respects an explicit id + occurredAt", async () => {
    const bus = new EventBus();
    const at = new Date("2026-05-05T12:00:00Z");
    const event = await bus.emit("ItemCrafted", {
      id: "explicit-id",
      occurredAt: at,
      userId: "1",
      outputItemId: "100",
      outputQuantity: 1,
      inputs: [],
    });
    expect(event.id).toBe("explicit-id");
    expect(event.occurredAt).toBe(at);
  });

  it("type-narrows the returned event", async () => {
    const bus = new EventBus();
    const event = await bus.emit("LeveledUp", {
      userId: "1",
      from: 1,
      to: 2,
      milestoneIds: ["second_character_slot"],
    });
    expect(event.type).toBe("LeveledUp");
    expect(event.to).toBe(2);
  });

  it("is a no-op (no handlers) without throwing", async () => {
    const bus = new EventBus();
    await expect(
      bus.emit("LeveledUp", { userId: "1", from: 1, to: 2, milestoneIds: [] }),
    ).resolves.toBeDefined();
  });
});

describe("removeAll", () => {
  it("clears typed and wildcard handlers", async () => {
    const bus = new EventBus();
    const typed = vi.fn();
    const all = vi.fn();
    bus.subscribe("ItemCrafted", typed);
    bus.subscribeAll(all);
    bus.removeAll();
    await bus.publish(fixedItemCrafted());
    expect(typed).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();
    expect(bus.listenerCount("ItemCrafted")).toBe(0);
  });
});
