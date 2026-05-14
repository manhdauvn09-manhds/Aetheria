"use client";

// Aetheria — sample-level index. Lists every JSON in @aetheria/game-assets.
//
// This is a developer-facing page for now (Step 4.19 smoke). The actual
// realm/level pickers land in 4.20 (state-machine flow).
//
// Lazy-loads game-assets on page access to defer bundling 8 level JSONs
// until the user navigates here (rather than including in main bundle).

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Level } from "@aetheria/game-assets";

const REALM_NAME: Record<number, string> = {
  1: "Verdant Reach",
  2: "Ashen Wastes",
  3: "Aetheric Spires",
  4: "Sunken Hollow",
  5: "Hollow Vault",
};

const PlayIndexPage = (): JSX.Element => {
  const [levels, setLevels] = useState<readonly Level[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { loadAllLevels } = await import("@aetheria/game-assets");
      if (isMounted) {
        setLevels(loadAllLevels());
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
          Aetheria — sample levels
        </h1>
        <p className="text-sm text-zinc-400">
          Open a level to render it with the PixiJS hex map renderer.
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-zinc-400">Loading levels…</p>
      ) : levels ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {levels.map((lv) => (
            <li
              key={lv.slug}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 hover:border-realm-aetheric"
            >
              <Link
                href={{ pathname: "/play/[levelNumber]", query: {} }}
                as={`/play/${String(lv.levelNumber)}`}
                className="block space-y-1"
              >
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  {REALM_NAME[lv.realmId] ?? `Realm ${String(lv.realmId)}`} · L{String(lv.levelNumber)}
                </div>
                <div className="font-semibold text-zinc-100">{lv.name}</div>
                <div className="text-xs text-zinc-400">
                  {lv.type} · difficulty {String(lv.difficulty)} · {String(lv.map.tiles.length)} tiles
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
};

export default PlayIndexPage;
