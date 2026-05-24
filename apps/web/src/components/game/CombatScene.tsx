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

import { useEffect, useRef, useState } from "react";
import type * as PixiTypes from "pixi.js";
import type { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import {
  hexDistance,
  type Actor,
  type BattleState,
  type Coord,
  type Event,
  type Tile,
} from "@aetheria/domain-combat";

import { axialToPixel, hexCorners, pixelToAxial } from "@/lib/hex/math";
import {
  sfxAttack, sfxBuff, sfxCrit, sfxDefeat, sfxHeal, sfxResonance,
} from "@/lib/audio/sfx";
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
// On phones (≤ 480px) we drop hexSize so the 6×4 grid fits across the
// viewport without horizontal scrolling. The aspect-ratio (~1.57) is
// preserved by deriving height from width.
const MIN_W = 280;
const MAX_W = 1080;
const ASPECT = DEFAULT_W / DEFAULT_H; // canvas width / height
/** Pick a hexSize that keeps the 6-column grid fully inside `width`. */
const hexSizeForWidth = (w: number): number => {
  // hexCorners radius = size; column step ≈ 1.5 * size; 6 columns + edge
  // padding → size ≈ (w - 24) / (6 * 1.5 + 1).
  return Math.max(14, Math.min(38, Math.floor((w - 24) / 10)));
};
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

// Class-themed sprite shape. Mapped from unit name so we don't need a
// new field on the engine's Actor type. Falls back to "soldier" (circle
// + sword) for unknowns. Each shape is drawn into a single Graphics
// scaled by hexSize.
type Archetype =
  | "swordsman" | "tank" | "mage" | "guardian"
  | "healer" | "rogue" | "support" | "wildcard"
  | "wraith" | "husk" | "stalker" | "brute" | "reaper" | "spore" | "lord";

const UNIT_TO_ARCHETYPE: Record<string, Archetype> = {
  Aevra: "swordsman",
  Kyo: "tank",
  Lyra: "mage",
  Brann: "guardian",
  Mira: "healer",
  Vex: "rogue",
  Solen: "support",
  Null: "wildcard",
  "Frost Wraith": "wraith",
  "Ember Husk": "husk",
  "Void Stalker": "stalker",
  "Tide Brute": "brute",
  "Sky Reaper": "reaper",
  "Verdant Spore": "spore",
  "Void Lord": "lord",
};

const archetypeOf = (actor: Actor): Archetype => {
  return UNIT_TO_ARCHETYPE[actor.unit] ?? (actor.side === "player" ? "swordsman" : "wraith");
};

// Map archetype → SVG asset filename. The SVGs live in apps/web/public/
// sprites/ so they're served as static assets and cached by the browser.
// Pixi loads them via Assets.load() and converts to Texture; we render
// them with Pixi.Sprite. If a texture fails to load we fall back to the
// drawArchetype Graphics path so combat never goes blank.
const ARCHETYPE_TO_SVG: Partial<Record<Archetype, string>> = {
  swordsman: "/sprites/aevra.svg",
  tank:      "/sprites/kyo.svg",
  mage:      "/sprites/lyra.svg",
  guardian:  "/sprites/brann.svg",
  healer:    "/sprites/mira.svg",
  rogue:     "/sprites/vex.svg",
  support:   "/sprites/solen.svg",
  wildcard:  "/sprites/null.svg",
  wraith:    "/sprites/frost_wraith.svg",
  husk:      "/sprites/ember_husk.svg",
  stalker:   "/sprites/void_stalker.svg",
  brute:     "/sprites/tide_brute.svg",
  reaper:    "/sprites/sky_reaper.svg",
  spore:     "/sprites/verdant_spore.svg",
  lord:      "/sprites/void_lord.svg",
};

/** Texture cache shared across all sprite instances in a battle. */
const textureCache = new Map<Archetype, Texture>();

/**
 * Preload all archetype SVGs in parallel. Resolves once all attempts
 * complete (settled, not all-or-nothing) so a single bad asset doesn't
 * block the rest.
 */
const preloadSpriteTextures = async (Pixi: typeof PixiTypes): Promise<void> => {
  const entries = Object.entries(ARCHETYPE_TO_SVG) as [Archetype, string][];
  await Promise.allSettled(
    entries.map(async ([archetype, url]) => {
      if (textureCache.has(archetype)) return;
      try {
        const texture = (await Pixi.Assets.load(url)) as Texture;
        textureCache.set(archetype, texture);
      } catch {
        // Leave it absent in the cache; updateActorSprite falls back to
        // the Graphics path for this archetype.
      }
    }),
  );
};

/**
 * Draw a class-themed body shape into a Graphics. Each archetype is a
 * geometric silhouette (sword, shield, star, dagger, etc) tinted by the
 * actor's side (blue for player, red for enemy) with an element accent.
 *
 * Sizes are expressed in fractions of hexSize so they scale with the
 * board. We deliberately keep these as pure Pixi Graphics (no PNGs) so
 * the bundle stays tiny — when we eventually ship sprite sheets, the
 * fallback here still renders if assets fail to load.
 */
const drawArchetype = (
  g: Graphics,
  actor: Actor,
  hexSize: number,
  elementColor: number,
): void => {
  const fill = SIDE_FILL[actor.side] ?? 0x888888;
  const alpha = actor.defeated ? 0.25 : 1;
  const stroke = { color: 0x000000, width: 2, alpha: 0.65 } as const;
  const accent = { color: elementColor, alpha: actor.defeated ? 0.2 : 0.9 } as const;
  const s = hexSize;
  const archetype = archetypeOf(actor);

  // Common: outer body shape per archetype
  switch (archetype) {
    case "swordsman": {
      // Circle base + upward sword
      g.circle(0, 0, s * 0.4).fill({ color: fill, alpha }).stroke(stroke);
      // Sword blade pointing up
      g.poly([0, -s * 0.55, s * 0.07, -s * 0.15, -s * 0.07, -s * 0.15])
        .fill({ color: 0xeeeeee, alpha: alpha * 0.95 }).stroke(stroke);
      // Crossguard
      g.rect(-s * 0.15, -s * 0.18, s * 0.3, s * 0.05)
        .fill({ color: 0x8b5e3c, alpha }).stroke(stroke);
      break;
    }
    case "tank":
    case "guardian": {
      // Rounded square shield + cross emblem
      const w = s * 0.7, h = s * 0.78;
      g.roundRect(-w / 2, -h / 2, w, h, s * 0.16)
        .fill({ color: fill, alpha }).stroke(stroke);
      // Cross emblem
      g.rect(-s * 0.06, -s * 0.28, s * 0.12, s * 0.56).fill(accent);
      g.rect(-s * 0.22, -s * 0.06, s * 0.44, s * 0.12).fill(accent);
      break;
    }
    case "mage": {
      // 5-point star (canon mage silhouette)
      g.star(0, 0, 5, s * 0.45, s * 0.2).fill({ color: fill, alpha }).stroke(stroke);
      // Inner star for element accent
      g.star(0, 0, 5, s * 0.22, s * 0.1).fill(accent);
      break;
    }
    case "healer": {
      // Plus sign + soft circle behind
      g.circle(0, 0, s * 0.4).fill({ color: fill, alpha: alpha * 0.9 }).stroke(stroke);
      g.rect(-s * 0.08, -s * 0.3, s * 0.16, s * 0.6).fill({ color: 0xffffff, alpha });
      g.rect(-s * 0.3, -s * 0.08, s * 0.6, s * 0.16).fill({ color: 0xffffff, alpha });
      break;
    }
    case "rogue": {
      // Diamond (dagger silhouette)
      g.poly([0, -s * 0.5, s * 0.35, 0, 0, s * 0.5, -s * 0.35, 0])
        .fill({ color: fill, alpha }).stroke(stroke);
      g.poly([0, -s * 0.25, s * 0.16, 0, 0, s * 0.25, -s * 0.16, 0]).fill(accent);
      break;
    }
    case "support": {
      // Pentagon
      const pts: number[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
        pts.push(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
      }
      g.poly(pts).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(0, 0, s * 0.16).fill(accent);
      break;
    }
    case "wildcard": {
      // Hexagon (matches the board, hints "of everywhere")
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        pts.push(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
      }
      g.poly(pts).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(0, 0, s * 0.18).fill(accent);
      break;
    }
    // ── Enemies ──────────────────────────────────────────────────
    case "wraith": {
      // Ghost: rounded top + wavy bottom
      const w = s * 0.7;
      g.roundRect(-w / 2, -s * 0.45, w, s * 0.7, s * 0.34)
        .fill({ color: fill, alpha }).stroke(stroke);
      g.poly([-w / 2, s * 0.25, -w / 4, s * 0.05, 0, s * 0.25,
              w / 4, s * 0.05, w / 2, s * 0.25, w / 2, s * 0.3, -w / 2, s * 0.3])
        .fill({ color: fill, alpha });
      // Eyes
      g.circle(-s * 0.13, -s * 0.1, s * 0.06).fill({ color: 0x000000, alpha });
      g.circle(s * 0.13, -s * 0.1, s * 0.06).fill({ color: 0x000000, alpha });
      break;
    }
    case "husk": {
      // Lumpy circle + jagged edge (cracked ember)
      g.circle(0, 0, s * 0.42).fill({ color: fill, alpha }).stroke(stroke);
      // Cracks
      g.moveTo(-s * 0.3, -s * 0.2).lineTo(s * 0.1, 0).lineTo(s * 0.3, s * 0.2)
        .stroke({ color: 0x000000, width: 2, alpha: alpha * 0.7 });
      g.circle(s * 0.15, -s * 0.18, s * 0.07).fill(accent);
      break;
    }
    case "stalker": {
      // Sharp downward triangle (claw)
      g.poly([0, s * 0.5, s * 0.45, -s * 0.35, -s * 0.45, -s * 0.35])
        .fill({ color: fill, alpha }).stroke(stroke);
      // Eye slits
      g.rect(-s * 0.2, -s * 0.18, s * 0.12, s * 0.04).fill({ color: 0xffea61, alpha });
      g.rect(s * 0.08, -s * 0.18, s * 0.12, s * 0.04).fill({ color: 0xffea61, alpha });
      break;
    }
    case "brute": {
      // Wide rectangle + chunky horns
      g.rect(-s * 0.42, -s * 0.25, s * 0.84, s * 0.55)
        .fill({ color: fill, alpha }).stroke(stroke);
      g.poly([-s * 0.42, -s * 0.25, -s * 0.5, -s * 0.5, -s * 0.3, -s * 0.25]).fill({ color: fill, alpha }).stroke(stroke);
      g.poly([s * 0.42, -s * 0.25, s * 0.5, -s * 0.5, s * 0.3, -s * 0.25]).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(-s * 0.15, -s * 0.05, s * 0.06).fill({ color: 0xff3030, alpha });
      g.circle(s * 0.15, -s * 0.05, s * 0.06).fill({ color: 0xff3030, alpha });
      break;
    }
    case "reaper": {
      // Inverted triangle with wing barbs
      g.poly([0, s * 0.45, s * 0.4, -s * 0.4, -s * 0.4, -s * 0.4])
        .fill({ color: fill, alpha }).stroke(stroke);
      g.poly([-s * 0.4, -s * 0.4, -s * 0.62, -s * 0.2, -s * 0.4, -s * 0.1]).fill({ color: fill, alpha });
      g.poly([s * 0.4, -s * 0.4, s * 0.62, -s * 0.2, s * 0.4, -s * 0.1]).fill({ color: fill, alpha });
      g.circle(0, -s * 0.18, s * 0.08).fill(accent);
      break;
    }
    case "spore": {
      // Cluster: 4 small bumps
      g.circle(0, -s * 0.2, s * 0.22).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(-s * 0.25, s * 0.1, s * 0.2).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(s * 0.25, s * 0.1, s * 0.2).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(0, s * 0.3, s * 0.18).fill({ color: fill, alpha }).stroke(stroke);
      g.circle(0, 0, s * 0.1).fill(accent);
      break;
    }
    case "lord": {
      // Large jagged crown (boss tier)
      g.circle(0, s * 0.05, s * 0.45).fill({ color: fill, alpha }).stroke(stroke);
      g.poly([
        -s * 0.45, -s * 0.1,
        -s * 0.3, -s * 0.4,
        -s * 0.15, -s * 0.15,
         0,        -s * 0.45,
         s * 0.15, -s * 0.15,
         s * 0.3,  -s * 0.4,
         s * 0.45, -s * 0.1,
      ]).fill({ color: fill, alpha }).stroke(stroke);
      // Big sinister eye
      g.circle(0, s * 0.05, s * 0.18).fill({ color: 0x000000, alpha });
      g.circle(0, s * 0.05, s * 0.08).fill(accent);
      break;
    }
  }

  // Side accent ring around the sprite for player vs enemy clarity.
  g.circle(0, 0, s * 0.5).stroke({ color: fill, width: 2, alpha: actor.defeated ? 0.15 : 0.45 });
};

export const CombatScene = ({
  width: widthProp,
  height: heightProp,
  hexSize: hexSizeProp,
  onTileClick,
  onActorClick,
  highlightTile = null,
}: CombatSceneProps): JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Measured container width drives canvas + hexSize so the scene
  // resizes for phones/tablets without horizontal scroll. The first
  // paint uses a sensible default; ResizeObserver below updates it.
  const [measured, setMeasured] = useState<{ w: number; h: number; hex: number }>(() => {
    const w = widthProp ?? DEFAULT_W;
    return { w, h: heightProp ?? Math.round(w / ASPECT), hex: hexSizeProp ?? hexSizeForWidth(w) };
  });
  const width = measured.w;
  const height = measured.h;
  const hexSize = measured.hex;
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

      // Preload SVG sprite textures so makeActorSprite() can use them
      // without flashing the Graphics fallback. Settled, not all-or-
      // nothing — missing assets degrade gracefully.
      await preloadSpriteTextures(Pixi);
      if (cancelled) return;

      app = new Pixi.Application();
      // Cap resolution at 2 to avoid burning fillrate on hi-dpi phones
      // (some Android devices report DPR up to 4). Skip antialias when
      // hardware concurrency is low — proxy for "low-end device".
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const lowEnd = (navigator.hardwareConcurrency ?? 4) <= 4;
      await app.init({
        width,
        height,
        background: 0x07060d,
        antialias: !lowEnd,
        autoDensity: true,
        resolution: dpr,
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
        // Capture the canvas element BEFORE destroying the Pixi app: after
        // `destroy(true)` the internal `_canvas` is nulled and the getter
        // throws "Cannot read properties of null (reading 'canvas')".
        const canvasEl = app?.canvas ?? null;
        try {
          app?.stage.off("pointertap", onPointerTap);
        } catch { /* ignore: app already torn down */ }
        try {
          app?.destroy(true);
        } catch { /* ignore */ }
        if (canvasEl && host && canvasEl.parentNode === host) {
          host.removeChild(canvasEl);
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

  // Responsive sizing: observe the host's parent width and recompute
  // canvas + hexSize when it changes. Caller can still override via
  // explicit props (widthProp/heightProp/hexSizeProp).
  useEffect(() => {
    if (widthProp !== undefined && heightProp !== undefined) return; // fixed
    const host = hostRef.current;
    if (!host) return;
    const parent = host.parentElement ?? host;
    const update = (): void => {
      const w = Math.max(MIN_W, Math.min(MAX_W, parent.clientWidth));
      const h = heightProp ?? Math.round(w / ASPECT);
      const hex = hexSizeProp ?? hexSizeForWidth(w);
      setMeasured((prev) =>
        prev.w === w && prev.h === h && prev.hex === hex ? prev : { w, h, hex },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [widthProp, heightProp, hexSizeProp]);

  return (
    <div
      ref={hostRef}
      style={{ width: "100%", maxWidth: width, height }}
      className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden touch-none"
    />
  );
};

// ── Sprite helpers ────────────────────────────────────────────────────

interface ActorSprite {
  readonly container: Container;
  readonly glow: Graphics;
  /** Fallback geometry rendered when no SVG texture is available. */
  readonly body: Graphics;
  /** Optional textured sprite layered on top of the body. */
  spriteLayer: Sprite | null;
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
    spriteLayer: null,
    hpBar,
    label,
    pos: actor.pos,
  };
  // Attempt to use the preloaded SVG texture for this archetype. If
  // missing (asset failed to load), the body Graphics path takes over.
  const archetype = archetypeOf(actor);
  const tex = textureCache.get(archetype);
  if (tex !== undefined) {
    const s = new Pixi.Sprite(tex);
    s.anchor.set(0.5, 0.55);
    // SVGs are 128x128, scale to ~hexSize*1.5 so they read large.
    const scale = (hexSize * 1.5) / 128;
    s.scale.set(scale, scale);
    sprite.spriteLayer = s;
    // Order: glow → spriteLayer → hpBar → label. body stays in tree
    // but is empty when texture is present (acts as a fallback hook).
    container.addChildAt(s, container.getChildIndex(body));
  }
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

  // Body — prefer textured SVG sprite; fall back to Graphics if the
  // archetype texture failed to preload.
  sprite.body.clear();
  if (sprite.spriteLayer !== null) {
    // Defeated → dim it. Live → full alpha.
    sprite.spriteLayer.alpha = actor.defeated ? 0.35 : 1;
  } else {
    drawArchetype(sprite.body, actor, hexSize, glowColor);
  }

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

/** Route each engine event to its corresponding SFX. */
const fireSfxForEvent = (event: Event): void => {
  switch (event.type) {
    case "damage_dealt":
      if (event.crit) sfxCrit(); else sfxAttack();
      return;
    case "healed":
      sfxHeal();
      return;
    case "status_applied":
      sfxBuff();
      return;
    case "actor_defeated":
      sfxDefeat();
      return;
    case "resonance_triggered":
      sfxResonance();
      return;
    default:
      return;
  }
};

const animateEvent = async (
  Pixi: typeof PixiTypes,
  event: Event,
  actors: Map<string, ActorSprite>,
  fxLayer: Container | null,
  hexSize: number,
): Promise<void> => {
  // SFX hook — fire-and-forget; sfx module is no-op under SSR.
  fireSfxForEvent(event);
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
