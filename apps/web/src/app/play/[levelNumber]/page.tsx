// Aetheria — single-level preview page.
//
// Server component: loads the level from `@aetheria/game-assets` (the
// canonical content source for Step 4.15). Once 4.16 lands the runtime
// catalog the page will instead fetch via `world.startLevel`. For now
// this is the renderer's smoke test.

import Link from "next/link";
import { notFound } from "next/navigation";

import { findLevelByNumber } from "@aetheria/game-assets";

import { HexMapRenderer } from "@/components/game/HexMapRenderer";

interface PageProps {
  readonly params: Promise<{ levelNumber: string }>;
}

const PlayLevelPage = async ({ params }: PageProps): Promise<JSX.Element> => {
  const { levelNumber } = await params;
  const parsed = Number.parseInt(levelNumber, 10);
  if (!Number.isInteger(parsed) || parsed < 1) notFound();
  const level = findLevelByNumber(parsed);
  if (!level) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            {level.name}
          </h1>
          <p className="text-xs text-zinc-500">
            Realm {String(level.realmId)} · Level {String(level.levelNumber)} · {level.type} ·
            difficulty {String(level.difficulty)} · min Lv {String(level.minAccountLevel)}
          </p>
        </div>
        <Link href="/play" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← All levels
        </Link>
      </header>

      <section>
        <HexMapRenderer map={level.map} hexSize={28} width={840} height={500} />
      </section>

      <section className="grid grid-cols-2 gap-4 text-xs text-zinc-400 md:grid-cols-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-1 font-semibold uppercase tracking-wider text-zinc-300">Map</div>
          <div>
            {String(level.map.tiles.length)} tiles · {String(level.map.spawns.length)} spawns · {String(level.map.exits.length)} exits
          </div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-1 font-semibold uppercase tracking-wider text-zinc-300">
            Encounter
          </div>
          <div>
            {String(level.encounter.waves.length)} wave(s)
            {level.encounter.boss ? ` · boss "${level.encounter.boss.unit}"` : ""}
          </div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-1 font-semibold uppercase tracking-wider text-zinc-300">Rewards</div>
          <div>
            {String(level.rewards.xp)} xp · {String(level.rewards.gold)} gold ·{" "}
            {String(level.rewards.items.length)} items
          </div>
        </div>
      </section>
    </main>
  );
};

export default PlayLevelPage;
