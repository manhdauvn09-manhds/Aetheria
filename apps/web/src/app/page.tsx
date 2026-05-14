import Link from "next/link";
import type { Metadata } from "next";

import { SessionBar } from "@/components/auth/SessionBar";
import { serverTrpc } from "@/lib/trpc/server";

// SEO: regenerate on every request to keep metadata fresh
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetheria.gg";

// NOTE — most of these fields (title/description/openGraph/twitter/alternates)
// are inherited from `app/layout.tsx`. We override only what diverges per-page;
// keeping the rest unset prevents the canonical-domain drift that the previous
// version of this file caused (page.tsx hard-coded aetheria.com while layout
// used the SITE_URL env, splitting search-engine signal across two hostnames).
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: {
      "en-US": SITE_URL,
      "vi-VN": `${SITE_URL}/vi`,
    },
  },
};

interface ApiStatus {
  readonly ok: boolean;
  readonly serverTime?: string;
}

const fetchApiStatus = async (): Promise<ApiStatus> => {
  try {
    const res = await serverTrpc.health.ping.query();
    return { ok: res.ok, serverTime: res.serverTime };
  } catch {
    return { ok: false };
  }
};

const LandingPage = async (): Promise<JSX.Element> => {
  const status = await fetchApiStatus();

  return (
    <>
      <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950">
        {/* Header */}
        <header className="border-b border-zinc-800 bg-zinc-950/50">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <h1 className="font-display text-2xl font-bold text-realm-aetheric">Aetheria</h1>
            <SessionBar />
          </div>
        </header>

        {/* Hero Section */}
        <section className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-8 px-6 py-24 text-center">
          <div className="space-y-4">
            <h1 className="font-display text-5xl font-bold tracking-tight text-realm-aetheric md:text-6xl">
              Master Tactical Combat
            </h1>
            <p className="text-xl text-zinc-300">
              A free-to-play hex-grid strategy RPG
            </p>
          </div>

          <p className="max-w-2xl text-base text-zinc-400">
            Aetheria features turn-based tactical combat on hex grids, character progression
            across multiple realms, and strategic encounter design. Engage with dynamic gameplay,
            unlock powerful characters, and discover hidden secrets.
          </p>

          <div className="flex gap-4">
            {status.ok && (
              <Link
                href="/realms"
                className="rounded-lg bg-realm-aetheric px-8 py-3 font-semibold text-slate-900 hover:bg-realm-aetheric/90"
              >
                Play Now
              </Link>
            )}
            <a
              href="#features"
              className="rounded-lg border border-zinc-700 px-8 py-3 text-zinc-200 hover:bg-zinc-800"
            >
              Learn More
            </a>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="mb-12 text-center text-3xl font-bold text-zinc-100">
            Why Play Aetheria?
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <article className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
              <h3 className="text-lg font-semibold text-amber-400">⚔️ Tactical Gameplay</h3>
              <p className="text-sm text-zinc-400">
                Master hex-grid combat with turn-based strategy and real-time decision-making.
              </p>
            </article>
            <article className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
              <h3 className="text-lg font-semibold text-amber-400">🎭 Character Roster</h3>
              <p className="text-sm text-zinc-400">
                Unlock and level up unique characters with special abilities and skill trees.
              </p>
            </article>
            <article className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
              <h3 className="text-lg font-semibold text-amber-400">🌍 Multiple Realms</h3>
              <p className="text-sm text-zinc-400">
                Explore diverse worlds with varying terrain, enemies, and strategic challenges.
              </p>
            </article>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mx-auto max-w-5xl px-6 py-24 text-center">
          <div className="space-y-6 rounded-lg border border-amber-700/50 bg-amber-950/20 p-12">
            <h2 className="text-2xl font-bold text-amber-200">Ready to Enter the Realms?</h2>
            <p className="text-zinc-400">
              Join players in Aetheria's tactical combat experience.
            </p>
            {status.ok && (
              <Link
                href="/realms"
                className="inline-block rounded-lg bg-realm-aetheric px-8 py-3 font-semibold text-slate-900 hover:bg-realm-aetheric/90"
              >
                Start Playing Free
              </Link>
            )}
          </div>
        </section>

        {/* API Status (dev only) */}
        {!status.ok && (
          <section className="mx-auto max-w-5xl px-6 py-8">
            <div className="rounded-md border border-rose-700/50 bg-rose-950/20 p-4">
              <p className="text-sm text-rose-300">
                API server is not running. Backend unavailable. Start with: <code>pnpm dev</code>
              </p>
            </div>
          </section>
        )}
      </main>

      {/*
        Schema.org VideoGame structured data is emitted ONCE in
        app/layout.tsx — see the `jsonld-game` <Script> there. Don't add a
        second copy here: duplicate JSON-LD with conflicting fields confuses
        search engines and dilutes rich-result eligibility.
      */}
    </>
  );
};

export default LandingPage;
