"use client";

// Aetheria — combat scene (PixiJS 8).
//
// Renders the live `BattleState` from the combat store: tile grid, actor
// pawns, an HP/AP overlay per actor, and a click-to-target ring. The
// scene also drains `eventQueue` from the store and animates each event
// (move tween, damage flash, defeat fade) before letting the next one
// play. Animations are intentionally short — the goal is "the renderer
// makes the engine output legible", not full juice.
//
// Pixi runs only in the browser, so this component is `"use client"` and
// loads `pixi.js` lazily via dynamic import in a `useEffect`.

import { useEffect, useRef } from "react";
import type * as PixiTypes from "pixi.js";
import type { Application, Container, Graphics, Text } from "pixi.js";

import {
  hexDistance,
  type Actor,
  type BattleState,
  type Coord,
  type Event,
  type Tile,
} from "@aetheria/domain-combat";

import { axialToPixel, hexCorners, pixelToAxial } from "@/lib/hex/math";
import { useCombat } from "@/store/combat";

interface CombatSceneProps {
  readonly width?: number;
  readonly height?: number;
  readonly hexSize?: number;
  /** Forwards a tile click to the parent (e.g. to enter a "move target" mode). */
  readonly onTileClick?: (coord: Coord) => void;
  /** Forwards an actor click (e.g. to pick an attack target). */
  readonly onActorClick?: (actorId: string) => void;
  /** Currently-highlighted target tile (e.g. drawn move ghost). */
  readonly highlightTile?: Coord | null;
}

const DEFAULT_W = 720;
const DEFAULT_H = 460;
const DEFAULT_HEX = 32;
const TILE_FILL: Record<string, number> = {
  plain: 0x2c5d34,
  forest: 0x1f5926,
  stone: 0x8a8e96,
  water: 0x1f6f8b,
  ice: 0xa8d5e2,
  lava: 0xc94a1f,
  void: 0x14121f,
  shrine: 0x7a5fb0,
  wall: 0x2a2a30,
};
const SIDE_FILL: Record<string, number> = {
  player: 0x3aa0ff,
  enemy: 0xd6463f,
  neutral: 0xf2c14e,
};
// Element-themed glow ring around each actor. Picked to be readable on
// the dark tile background.
const ELEMENT_GLOW: Record<string, number> = {
  verdant: 0x6cd66c,
  ember:   0xff7a3a,
  frost:   0xa8d5e2,
  tide:    0x4fb6c0,
  sky:     0xb6c7ff,
  void:    0xc59cff,
};

export const CombatScene = ({
  width = DEFAULT_W,
  height = DEFAULT_H,
  hexSize = DEFAULT_HEX,
  onTileClick,
  onActorClick,
  highlightTile = null,
}: CombatSceneProps): JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest non-reactive props/handlers in refs so the Pixi
  // setup effect can be mount-once without restarting on every render.
  const stateRef = useRef<BattleState | null>(null);
  const handlersRef = useRef({ onTileClick, onActorClick, highlightTile });
  handlersRef.current = { onTileClick, onActorClick, highlightTile };
  // Imperative repaint hook for the highlight overlay. Set inside the
  // Pixi setup effect; called from the prop-change effect below.
  const repaintHighlightRef = useRef<(coord: Coord | null) => void>(() => undefined);

  // We *do* read from the store, but only to drive imperative Pixi
  // updates — never to re-create the canvas.
  const state = useCombat((s) => s.state);
  const eventQueue = useCombat((s) => s.eventQueue);
  const consumeEvent = useCombat((s) => s.consumeEvent);
  stateRef.current = state;

  // Setup runs once on mount. Updates flow through subscription effects.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: Application | null = null;
    let world: Container | null = null;
    const tileLayer = { current: null as Container | null };
    const actorLayer = { current: null as Container | null };
    const highlightLayer = { current: null as Container | null };
    const fxLayer = { current: null as Container | null };
    const actorById = new Map<string, ActorSprite>();
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    let unsubState: (() => void) | null = null;
    let unsubQueue: (() => void) | null = null;
    let animating = false;

    void (async () => {
      // `pixi.js/unsafe-eval` is the misnamed CSP-safe variant: it has
      // SIDE EFFECTS that patch Pixi's extension registry so shader
      // compilation does NOT use `Function()` / eval. Import it first
      // for the side effect, then import the main API as usual.
      await import("pixi.js/unsafe-eval");
      const Pixi = await import("pixi.js");
      if (cancelled) return;

      app = new Pixi.Application();
      await app.init({
        width,
        height,
        background: 0x07060d,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
      });
      if (cancelled || !app) {
        app?.destroy(true);
        return;
      }
      host.appendChild(app.canvas);

      world = new Pixi.Container();
      app.stage.addChild(world);
      tileLayer.current = new Pixi.Container();
      highlightLayer.current = new Pixi.Container();
      actorLayer.current = new Pixi.Container();
      fxLayer.current = new Pixi.Container();
      world.addChild(tileLayer.current);
      world.addChild(highlightLayer.current);
      world.addChild(actorLayer.current);
      world.addChild(fxLayer.current);

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      const onPointerTap = (e: { global: { x: number; y: number } }): void => {
        if (!world) return;
        const wx = (e.global.x - world.position.x) / world.scale.x;
        const wy = (e.global.y - world.position.y) / world.scale.y;
        const axial = pixelToAxial(wx, wy, hexSize);
        const cur = stateRef.current;
        if (!cur) return;
        const hit = cur.actors.find(
          (a) => !a.defeated && a.pos.q === axial.q && a.pos.r === axial.r,
        );
        if (hit) {
          handlersRef.current.onActorClick?.(hit.id);
          return;
        }
        if (cur.tiles.some((t) => t.q === axial.q && t.r === axial.r)) {
          handlersRef.current.onTileClick?.({ q: axial.q, r: axial.r });
        }
      };
      app.stage.on("pointertap", onPointerTap);

      const renderTiles = (s: BattleState): void => {
        if (!tileLayer.current || !world) return;
        tileLayer.current.removeChildren();
        const corners = hexCorners(hexSize);
        for (const tile of s.tiles) {
          const { x, y } = axialToPixel(tile.q, tile.r, hexSize);
          const g = new Pixi.Graphics();
          g.poly(corners.flatMap((c) => [c.x, c.y]));
          g.fill({ color: TILE_FILL[tile.terrain] ?? 0x2c5d34 });
          g.stroke({ color: 0x000000, width: 1, alpha: 0.4 });
          g.position.set(x, y);
          tileLayer.current.addChild(g);
        }
        // Centre once on first render (or whenever battle id changes).
        const min = boundsOf(s.tiles, hexSize);
        const cx = (min.minX + min.maxX) / 2;
        const cy = (min.minY + min.maxY) / 2;
        world.position.set(width / 2 - cx, height / 2 - cy);
      };

      const renderHighlight = (coord: Coord | null): void => {
        if (!highlightLayer.current) return;
        highlightLayer.current.removeChildren();
        if (!coord) return;
        const corners = hexCorners(hexSize);
        const { x, y } = axialToPixel(coord.q, coord.r, hexSize);
        const g = new Pixi.Graphics();
        g.poly(corners.flatMap((c) => [c.x, c.y]));
        g.stroke({ color: 0xfff5b0, width: 2, alpha: 0.85 });
        g.position.set(x, y);
        highlightLayer.current.addChild(g);
      };

      const renderActors = (s: BattleState): void => {
        if (!actorLayer.current) return;
        // Diff: drop sprites for actors no longer in state, add new ones.
        const live = new Set(s.actors.map((a) => a.id));
        for (const [id, sprite] of actorById) {
          if (!live.has(id)) {
            sprite.container.destroy({ children: true });
            actorById.delete(id);
          }
        }
        for (const actor of s.actors) {
          const existing = actorById.get(actor.id);
          if (existing) {
            updateActorSprite(existing, actor, hexSize);
            continue;
          }
          const sprite = makeActorSprite(Pixi, actor, hexSize);
          actorById.set(actor.id, sprite);
          actorLayer.current.addChild(sprite.container);
        }
      };

      const renderState = (s: BattleState): void => {
        renderTiles(s);
        renderActors(s);
        renderHighlight(handlersRef.current.highlightTile ?? null);
      };
      repaintHighlightRef.current = renderHighlight;

      // Initial paint if state already present.
      const initial = useCombat.getState().state;
      if (initial) renderState(initial);

      unsubState = useCombat.subscribe((s, prev) => {
        if (s.state && s.state !== prev.state) {
          renderState(s.state);
        }
      });

      // Animate events from the queue, one at a time. After each
      // animation finishes, pop the next via `consumeEvent`.
      const playNext = async (): Promise<void> => {
        if (animating) return;
        animating = true;
        try {
          while (useCombat.getState().eventQueue.length > 0) {
            const head = useCombat.getState().eventQueue[0];
            if (!head) break;
            await animateEvent(Pixi, head, actorById, fxLayer.current, hexSize);
            consumeEvent();
          }
        } finally {
          animating = false;
        }
      };

      unsubQueue = useCombat.subscribe((s, prev) => {
        if (s.eventQueue !== prev.eventQueue && s.eventQueue.length > 0) {
          void playNext();
        }
      });
      // Kick off if there's already a queue waiting on mount.
      if (useCombat.getState().eventQueue.length > 0) void playNext();

      cleanup = (): void => {
        unsubState?.();
        unsubQueue?.();
        app?.stage.off("pointertap", onPointerTap);
        app?.destroy(true);
        if (host && app?.canvas.parentNode === host) {
          host.removeChild(app.canvas);
        }
        actorById.clear();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [width, height, hexSize, consumeEvent]);

  // Repaint highlight when the prop changes without rebuilding the canvas.
  useEffect(() => {
    repaintHighlightRef.current(highlightTile ?? null);
  }, [highlightTile]);

  // Touch the eventQueue ref so React rebinds the subscription on
  // Strict-mode remount. We never read the slice directly — the Pixi
  // setup subscribes imperatively.
  useEffect(() => {
    void eventQueue;
    void state;
  }, [eventQueue, state]);

  return (
    <div
      ref={hostRef}
      style={{ width, height }}
      className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden"
    />
  );
};

// ── Sprite helpers ────────────────────────────────────────────────────

interface ActorSprite {
  readonly container: Container;
  readonly glow: Graphics;
  readonly body: Graphics;
  readonly hpBar: Graphics;
  readonly label: Text;
  // Last-known authoritative position so move animations know where to
  // tween from when the engine state has already jumped to `to`.
  pos: Coord;
}

const makeActorSprite = (
  Pixi: typeof PixiTypes,
  actor: Actor,
  hexSize: number,
): ActorSprite => {
  const container = new Pixi.Container();
  const glow = new Pixi.Graphics();
  const body = new Pixi.Graphics();
  const hpBar = new Pixi.Graphics();
  const label = new Pixi.Text({
    // Use the unit display name if available; fall back to id prefix.
    text: actor.unit || actor.id.slice(0, 6),
    style: {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: 11,
      fill: 0xffffff,
      fontWeight: "bold",
      stroke: { color: 0x000000, width: 3, alpha: 0.85 },
    },
  });
  label.anchor.set(0.5, 1.4);
  container.addChild(glow);
  container.addChild(body);
  container.addChild(hpBar);
  container.addChild(label);

  const sprite: ActorSprite = {
    container,
    glow,
    body,
    hpBar,
    label,
    pos: actor.pos,
  };
  updateActorSprite(sprite, actor, hexSize);
  return sprite;
};

const updateActorSprite = (
  sprite: ActorSprite,
  actor: Actor,
  hexSize: number,
): void => {
  const { x, y } = axialToPixel(actor.pos.q, actor.pos.r, hexSize);
  sprite.container.position.set(x, y);
  sprite.pos = actor.pos;

  // Element-themed outer glow halo (visual hook for the elemental wheel).
  sprite.glow.clear();
  const glowColor = ELEMENT_GLOW[actor.element] ?? 0xffffff;
  sprite.glow.circle(0, 0, hexSize * 0.5);
  sprite.glow.fill({ color: glowColor, alpha: actor.defeated ? 0.05 : 0.22 });

  // Body — bigger, with side-themed fill + thicker outline for definition.
  sprite.body.clear();
  sprite.body.circle(0, 0, hexSize * 0.4);
  sprite.body.fill({
    color: SIDE_FILL[actor.side] ?? 0x888888,
    alpha: actor.defeated ? 0.25 : 1,
  });
  sprite.body.stroke({ color: 0x000000, width: 2, alpha: 0.6 });
  // Small element-tint accent dot at top-right of the body — like a
  // class icon. Helps tell similar-side actors apart.
  sprite.body.circle(hexSize * 0.22, -hexSize * 0.22, hexSize * 0.13);
  sprite.body.fill({ color: glowColor, alpha: actor.defeated ? 0.2 : 0.85 });
  sprite.body.stroke({ color: 0x000000, width: 1, alpha: 0.5 });

  sprite.hpBar.clear();
  const w = hexSize * 0.78;
  const h = 5;
  sprite.hpBar.rect(-w / 2, hexSize * 0.55, w, h);
  sprite.hpBar.fill({ color: 0x222226 });
  sprite.hpBar.stroke({ color: 0x000000, width: 1, alpha: 0.5 });
  const ratio = actor.stats.maxHp > 0 ? actor.stats.hp / actor.stats.maxHp : 0;
  sprite.hpBar.rect(-w / 2, hexSize * 0.55, w * Math.max(0, Math.min(1, ratio)), h);
  sprite.hpBar.fill({
    color: ratio > 0.6 ? 0x6cd66c : ratio > 0.3 ? 0xf2c14e : 0xd6463f,
  });

  // Keep label in sync with the unit name (re-render if the unit changed,
  // though that's rare during a battle).
  sprite.label.text = actor.unit || actor.id.slice(0, 6);

  sprite.container.alpha = actor.defeated ? 0.4 : 1;
};

// ── Event animator ────────────────────────────────────────────────────
//
// Each animator returns when its tween is finished so the queue drains
// in order. The combat events are short enough that a 200–400 ms beat
// per event keeps the scene responsive.

const animateEvent = async (
  Pixi: typeof PixiTypes,
  event: Event,
  actors: Map<string, ActorSprite>,
  fxLayer: Container | null,
  hexSize: number,
): Promise<void> => {
  switch (event.type) {
    case "actor_moved": {
      const sprite = actors.get(event.actorId);
      if (!sprite) return;
      const fromPx = axialToPixel(event.from.q, event.from.r, hexSize);
      const toPx = axialToPixel(event.to.q, event.to.r, hexSize);
      // Snap to `from` first in case the underlying state already jumped.
      sprite.container.position.set(fromPx.x, fromPx.y);
      await tween(220, (k) => {
        sprite.container.position.set(
          fromPx.x + (toPx.x - fromPx.x) * k,
          fromPx.y + (toPx.y - fromPx.y) * k,
        );
      });
      sprite.pos = event.to;
      return;
    }
    case "damage_dealt": {
      const sprite = actors.get(event.targetId);
      if (!sprite || !fxLayer) return;
      const flash = new Pixi.Graphics();
      flash.circle(0, 0, hexSize * 0.42);
      flash.fill({ color: event.crit ? 0xffea61 : 0xffffff, alpha: 0.7 });
      flash.position.set(sprite.container.position.x, sprite.container.position.y);
      fxLayer.addChild(flash);
      const text = new Pixi.Text({
        text: `-${String(event.amount)}${event.crit ? "!" : ""}`,
        style: {
          fontFamily: "monospace",
          fontSize: 12,
          fill: event.crit ? 0xffea61 : 0xffffff,
          fontWeight: "bold",
        },
      });
      text.anchor.set(0.5, 1.5);
      text.position.set(sprite.container.position.x, sprite.container.position.y);
      fxLayer.addChild(text);
      await tween(260, (k) => {
        flash.alpha = 0.7 * (1 - k);
        text.position.y = sprite.container.position.y - hexSize * 0.6 - k * hexSize * 0.4;
      });
      flash.destroy();
      text.destroy();
      return;
    }
    case "actor_defeated": {
      const sprite = actors.get(event.actorId);
      if (!sprite) return;
      await tween(280, (k) => {
        sprite.container.alpha = 1 - k * 0.6;
      });
      return;
    }
    case "healed": {
      const sprite = actors.get(event.targetId);
      if (!sprite || !fxLayer) return;
      const text = new Pixi.Text({
        text: `+${String(event.amount)}`,
        style: { fontFamily: "monospace", fontSize: 12, fill: 0x6cd66c, fontWeight: "bold" },
      });
      text.anchor.set(0.5, 1.5);
      text.position.set(sprite.container.position.x, sprite.container.position.y);
      fxLayer.addChild(text);
      await tween(240, (k) => {
        text.position.y = sprite.container.position.y - hexSize * 0.6 - k * hexSize * 0.4;
        text.alpha = 1 - k;
      });
      text.destroy();
      return;
    }
    case "resonance_triggered": {
      if (!fxLayer) return;
      const text = new Pixi.Text({
        text: `RESONANCE × ${String(event.bonusMultiplier)}`,
        style: { fontFamily: "monospace", fontSize: 14, fill: 0xc59cff, fontWeight: "bold" },
      });
      text.anchor.set(0.5, 0.5);
      text.position.set(0, 0);
      fxLayer.addChild(text);
      await tween(360, (k) => {
        text.alpha = 1 - k;
        text.scale.set(1 + k * 0.4);
      });
      text.destroy();
      return;
    }
    case "turn_started":
    case "turn_ended":
    case "battle_ended":
    case "status_applied":
    case "status_expired":
      // Visual hooks for these can come later; for now just step.
      await tween(80, () => undefined);
      return;
    default:
      // Exhaustiveness guard.
      ((_: never): void => undefined)(event);
  }
};

const tween = (durationMs: number, step: (k: number) => void): Promise<void> =>
  new Promise((resolve) => {
    const start = performance.now();
    const frame = (): void => {
      const k = Math.min(1, (performance.now() - start) / durationMs);
      step(k);
      if (k >= 1) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

const boundsOf = (
  tiles: readonly Tile[],
  size: number,
): { minX: number; minY: number; maxX: number; maxY: number } => {
  if (tiles.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    const { x, y } = axialToPixel(t.q, t.r, size);
    if (x - size < minX) minX = x - size;
    if (y - size < minY) minY = y - size;
    if (x + size > maxX) maxX = x + size;
    if (y + size > maxY) maxY = y + size;
  }
  return { minX, minY, maxX, maxY };
};

void hexDistance; // referenced from HUD callers; keep symbol pinned for tree-shaking
