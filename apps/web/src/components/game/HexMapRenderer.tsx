"use client";

// Aetheria — PixiJS 8 hex map renderer.
//
// Renders a `LevelMap` (axial hex tiles + spawns + exits) into a
// container <div>. Camera supports drag-to-pan and wheel-to-zoom; tile
// click forwards (q, r) to a parent callback.
//
// Pixi must run in the browser (uses canvas/webgl), so this component
// is `"use client"` AND defers all Pixi work to a `useEffect` so
// nothing touches `window` during SSR.

import { useEffect, useRef, useState } from "react";
import type * as PixiTypes from "pixi.js";
import type { Application, Container } from "pixi.js";

import type { LevelMap, Spawn, Tile } from "@aetheria/game-assets";

import {
  axialToPixel,
  hexCorners,
  pixelToAxial,
  tilesBounds,
  type Axial,
} from "@/lib/hex/math";
import {
  EXIT_FILL,
  FX_TINT,
  SPAWN_FILL,
  TERRAIN_FILL,
  TERRAIN_OUTLINE,
} from "@/lib/hex/terrain";

interface HexMapRendererProps {
  readonly map: LevelMap;
  readonly hexSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly onTileClick?: (tile: Axial) => void;
}

const DEFAULT_HEX_SIZE = 28;
const DEFAULT_W = 800;
const DEFAULT_H = 480;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

export const HexMapRenderer = ({
  map,
  hexSize = DEFAULT_HEX_SIZE,
  width = DEFAULT_W,
  height = DEFAULT_H,
  onTileClick,
}: HexMapRendererProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverTile, setHoverTile] = useState<Axial | null>(null);
  const [lastClick, setLastClick] = useState<Axial | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let app: Application | null = null;
    let world: Container | null = null;
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      // Dynamic import keeps Pixi out of the SSR bundle.
      // `/unsafe-eval` is the misnamed CSP-safe variant: side-effect
      // import that patches Pixi's extensions registry so shader
      // compilation works under `script-src 'self'` (no unsafe-eval).
      await import("pixi.js/unsafe-eval");
      const Pixi = await import("pixi.js");
      if (cancelled) return;

      app = new Pixi.Application();
      await app.init({
        width,
        height,
        background: 0x0a0a0f,
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
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      drawTiles(Pixi, world, map.tiles, hexSize);
      drawSpawns(Pixi, world, map.spawns, hexSize);
      drawExits(Pixi, world, map.exits, hexSize);

      // Centre the map under the camera.
      const bounds = tilesBounds(map.tiles, hexSize);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      world.position.set(width / 2 - cx, height / 2 - cy);

      // ── Pan: drag stage ───────────────────────────────────────
      let dragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let originX = 0;
      let originY = 0;

      const stage = app.stage;
      const onPointerDown = (e: { global: { x: number; y: number } }): void => {
        if (!world) return;
        dragging = true;
        dragStartX = e.global.x;
        dragStartY = e.global.y;
        originX = world.position.x;
        originY = world.position.y;
      };
      const onPointerMove = (e: { global: { x: number; y: number } }): void => {
        if (!dragging || !world) return;
        world.position.set(
          originX + (e.global.x - dragStartX),
          originY + (e.global.y - dragStartY),
        );
      };
      const onPointerUp = (): void => {
        dragging = false;
      };
      stage.on("pointerdown", onPointerDown);
      stage.on("pointermove", onPointerMove);
      stage.on("pointerup", onPointerUp);
      stage.on("pointerupoutside", onPointerUp);

      // ── Zoom: wheel ───────────────────────────────────────────
      const canvas = app.canvas;
      const onWheel = (ev: WheelEvent): void => {
        if (!world || !app) return;
        ev.preventDefault();
        const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, world.scale.x * factor));
        // Zoom around the cursor: keep the world coord under the cursor fixed.
        const rect = canvas.getBoundingClientRect();
        const cursorX = ev.clientX - rect.left;
        const cursorY = ev.clientY - rect.top;
        const worldX = (cursorX - world.position.x) / world.scale.x;
        const worldY = (cursorY - world.position.y) / world.scale.y;
        world.scale.set(next, next);
        world.position.set(cursorX - worldX * next, cursorY - worldY * next);
      };
      canvas.addEventListener("wheel", onWheel, { passive: false });

      // ── Click: emit (q, r) ────────────────────────────────────
      const tileSet = new Set<string>(map.tiles.map((t) => `${String(t.q)},${String(t.r)}`));
      const onPointerTap = (e: { global: { x: number; y: number } }): void => {
        if (!world) return;
        if (
          Math.abs(e.global.x - dragStartX) > 4 ||
          Math.abs(e.global.y - dragStartY) > 4
        ) {
          // Treat sufficient drag as pan, not tap.
          return;
        }
        const wx = (e.global.x - world.position.x) / world.scale.x;
        const wy = (e.global.y - world.position.y) / world.scale.y;
        const axial = pixelToAxial(wx, wy, hexSize);
        if (!tileSet.has(`${String(axial.q)},${String(axial.r)}`)) return;
        setLastClick(axial);
        onTileClick?.(axial);
      };
      stage.on("pointertap", onPointerTap);

      // ── Hover: track tile under cursor ────────────────────────
      const onHoverMove = (e: { global: { x: number; y: number } }): void => {
        if (!world) return;
        const wx = (e.global.x - world.position.x) / world.scale.x;
        const wy = (e.global.y - world.position.y) / world.scale.y;
        const axial = pixelToAxial(wx, wy, hexSize);
        if (!tileSet.has(`${String(axial.q)},${String(axial.r)}`)) {
          setHoverTile(null);
          return;
        }
        setHoverTile(axial);
      };
      stage.on("pointermove", onHoverMove);

      cleanup = (): void => {
        canvas.removeEventListener("wheel", onWheel);
        stage.off("pointerdown", onPointerDown);
        stage.off("pointermove", onPointerMove);
        stage.off("pointerup", onPointerUp);
        stage.off("pointerupoutside", onPointerUp);
        stage.off("pointertap", onPointerTap);
        stage.off("pointermove", onHoverMove);
        app?.destroy(true);
        if (canvas.parentNode === host) host.removeChild(canvas);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [map, hexSize, width, height, onTileClick]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        style={{ width, height }}
        className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden"
      />
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Hover:{" "}
          <span className="font-mono text-zinc-300">
            {hoverTile ? `q=${String(hoverTile.q)}, r=${String(hoverTile.r)}` : "—"}
          </span>
        </span>
        <span>
          Last click:{" "}
          <span className="font-mono text-zinc-300">
            {lastClick ? `q=${String(lastClick.q)}, r=${String(lastClick.r)}` : "—"}
          </span>
        </span>
        <span className="text-zinc-600">drag = pan · wheel = zoom · click = select</span>
      </div>
    </div>
  );
};

// ── Pixi draw helpers ──────────────────────────────────────────────

type PixiNs = typeof PixiTypes;

const drawTiles = (
  Pixi: PixiNs,
  world: Container,
  tiles: readonly Tile[],
  size: number,
): void => {
  const corners = hexCorners(size);
  for (const tile of tiles) {
    const { x, y } = axialToPixel(tile.q, tile.r, size);
    const g = new Pixi.Graphics();
    g.poly(corners.flatMap((c) => [c.x, c.y]));
    g.fill({ color: TERRAIN_FILL[tile.terrain] });
    g.stroke({ color: TERRAIN_OUTLINE[tile.terrain], width: 2 });
    g.position.set(x, y);
    world.addChild(g);
    if (tile.fx) {
      const fxG = new Pixi.Graphics();
      fxG.poly(corners.flatMap((c) => [c.x, c.y]));
      fxG.fill({ color: FX_TINT[tile.fx], alpha: 0.18 });
      fxG.position.set(x, y);
      world.addChild(fxG);
    }
    if ((tile.elev ?? 0) > 0) {
      // Light elevation hint: white stripe on the top edge.
      const top = corners[0];
      const right = corners[1];
      if (top && right) {
        const h = new Pixi.Graphics();
        h.moveTo(top.x, top.y).lineTo(right.x, right.y);
        h.stroke({ color: 0xffffff, width: Math.min(4, 1 + (tile.elev ?? 0)), alpha: 0.35 });
        h.position.set(x, y);
        world.addChild(h);
      }
    }
  }
};

const drawSpawns = (
  Pixi: PixiNs,
  world: Container,
  spawns: readonly Spawn[],
  size: number,
): void => {
  for (const sp of spawns) {
    const { x, y } = axialToPixel(sp.q, sp.r, size);
    const g = new Pixi.Graphics();
    g.circle(0, 0, size * 0.35);
    g.fill({ color: SPAWN_FILL[sp.kind] });
    g.stroke({ color: 0x000000, width: 2, alpha: 0.6 });
    g.position.set(x, y);
    world.addChild(g);
  }
};

const drawExits = (
  Pixi: PixiNs,
  world: Container,
  exits: readonly LevelMap["exits"][number][],
  size: number,
): void => {
  for (const ex of exits) {
    const { x, y } = axialToPixel(ex.q, ex.r, size);
    const g = new Pixi.Graphics();
    g.star(0, 0, 5, size * 0.32, size * 0.16);
    g.fill({ color: EXIT_FILL });
    g.stroke({ color: 0x000000, width: 2, alpha: 0.6 });
    g.position.set(x, y);
    world.addChild(g);
  }
};
