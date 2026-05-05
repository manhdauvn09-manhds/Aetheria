"use client";

// Aetheria — Quests page. Wraps the shared QuestTracker in a full-page
// layout. The compact HUD variant is meant to be embedded into the in-game
// scene; this page is the dedicated "show me everything" view.

import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuestTracker } from "@/components/game/QuestTracker";

const QuestsInner = (): JSX.Element => (
  <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
    <header className="flex items-baseline justify-between">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">Quests</h1>
        <p className="text-xs text-zinc-500">
          Daily + weekly challenges. Claim rewards once a quest completes.
        </p>
      </div>
      <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Main menu
      </Link>
    </header>
    <QuestTracker variant="page" />
  </main>
);

const QuestsPage = (): JSX.Element => (
  <RequireAuth>
    <QuestsInner />
  </RequireAuth>
);

export default QuestsPage;
