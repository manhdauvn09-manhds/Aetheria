"use client";

// Aetheria — team builder page.
//
// Lets the player hand-pick up to 3 heroes from the 8-roster as their
// default party for the next combat. Selection persists into
// `profile.preferences.selectedTeam` (a string[] of hero IDs). The
// combat runtime reads this on `combat.start` — if empty, it falls
// back to the per-level rotation, so this page is optional UX.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

// Mirror of HERO_ROSTER in packages/domain-combat-runtime/src/service.ts.
// Kept here for UI rendering — IDs must match exactly so the saved
// selectedTeam round-trips through to the synth.
const ROSTER: ReadonlyArray<{
  id: string; name: string; role: string; element: string; hint: string; sprite: string;
}> = [
  { id: "aevra", name: "Aevra",  role: "Hybrid DPS", element: "ember",   hint: "Fast melee, +DPS via Power Strike (range 2).", sprite: "/sprites/aevra.svg" },
  { id: "kyo",   name: "Kyo",    role: "Tank/DPS",   element: "void",    hint: "Frontline bruiser, Bulwark = +50% defense.",    sprite: "/sprites/kyo.svg" },
  { id: "lyra",  name: "Lyra",   role: "AoE Mage",   element: "sky",     hint: "Glass cannon — highest ATK, lowest DEF.",       sprite: "/sprites/lyra.svg" },
  { id: "brann", name: "Brann",  role: "Tank",       element: "verdant", hint: "Pure tank, 134 HP, anchor of the line.",        sprite: "/sprites/brann.svg" },
  { id: "mira",  name: "Mira",   role: "Healer",     element: "verdant", hint: "Heal = +35% maxHp to ally (range 2).",          sprite: "/sprites/mira.svg" },
  { id: "vex",   name: "Vex",    role: "Assassin",   element: "void",    hint: "Fastest (SPD 80), turn-1 burst.",               sprite: "/sprites/vex.svg" },
  { id: "solen", name: "Solen",  role: "Support",    element: "sky",     hint: "Bless = +ATK buff to adjacent ally.",           sprite: "/sprites/solen.svg" },
  { id: "null",  name: "Null",   role: "Wildcard",   element: "void",    hint: "Average everything; flexible tempo pick.",      sprite: "/sprites/null.svg" },
];

const ELEMENT_TINT: Record<string, string> = {
  ember:   "border-orange-700/60",
  frost:   "border-sky-700/60",
  verdant: "border-emerald-700/60",
  tide:    "border-cyan-700/60",
  sky:     "border-indigo-700/60",
  void:    "border-violet-700/60",
};

const MAX_TEAM = 3;

const TeamInner = (): JSX.Element => {
  const profileQ = trpc.account.getProfile.useQuery();
  const updateProfile = trpc.account.updateProfile.useMutation();

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Seed the selection from server-stored preferences once profile loads.
  useEffect(() => {
    if (!profileQ.data) return;
    const prefs = profileQ.data.profile.preferences as { selectedTeam?: unknown };
    const stored = Array.isArray(prefs.selectedTeam)
      ? prefs.selectedTeam.filter((x): x is string => typeof x === "string")
      : [];
    setSelected(stored);
  }, [profileQ.data]);

  const toggle = (id: string): void => {
    setSavedMsg(null);
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < MAX_TEAM
          ? [...cur, id]
          : cur,
    );
  };

  const onSave = async (): Promise<void> => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const existingPrefs = (profileQ.data?.profile.preferences ?? {}) as Record<string, unknown>;
      await updateProfile.mutateAsync({
        preferences: { ...existingPrefs, selectedTeam: [...selected] },
      });
      setSavedMsg("Team saved — next battle uses these heroes.");
      await profileQ.refetch();
    } catch (e) {
      setSavedMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const stored = useMemo(() => {
    const prefs = profileQ.data?.profile.preferences as { selectedTeam?: unknown } | undefined;
    return Array.isArray(prefs?.selectedTeam) ? prefs.selectedTeam : [];
  }, [profileQ.data]);

  const dirty = useMemo(
    () => JSON.stringify(selected) !== JSON.stringify(stored),
    [selected, stored],
  );

  if (profileQ.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
        <p className="text-sm text-zinc-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            Team Builder
          </h1>
          <p className="text-sm text-zinc-400">
            Pick up to {MAX_TEAM.toString()} heroes. Empty selection = level auto-rotation.
          </p>
        </div>
        <Link
          href="/menu"
          className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ← Menu
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROSTER.map((hero) => {
          const isPicked = selected.includes(hero.id);
          const tint = ELEMENT_TINT[hero.element] ?? "border-zinc-700";
          return (
            <button
              key={hero.id}
              type="button"
              onClick={() => toggle(hero.id)}
              className={`flex flex-col items-center gap-2 rounded-md border-2 p-3 transition ${
                isPicked
                  ? `${tint} bg-zinc-900/80 ring-2 ring-realm-aetheric/60`
                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600"
              }`}
            >
              <img
                src={hero.sprite}
                alt={hero.name}
                width={96}
                height={96}
                className="h-24 w-24"
              />
              <div className="text-center">
                <div className="text-sm font-semibold text-zinc-100">{hero.name}</div>
                <div className="text-xs uppercase tracking-wider text-zinc-500">{hero.role}</div>
                <div className="text-[10px] text-zinc-400">{hero.element}</div>
              </div>
              <p className="line-clamp-2 text-[11px] text-zinc-400">{hero.hint}</p>
              {isPicked ? (
                <span className="rounded bg-realm-aetheric/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-realm-aetheric">
                  Picked · slot {(selected.indexOf(hero.id) + 1).toString()}
                </span>
              ) : null}
            </button>
          );
        })}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-sm">
          <span className="text-zinc-400">Selected:</span>{" "}
          <span className="font-semibold text-zinc-100">
            {selected.length.toString()}/{MAX_TEAM.toString()}
          </span>
          {selected.length === 0 ? (
            <span className="ml-2 text-xs text-zinc-500">(empty → auto-rotation per level)</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty}
            onClick={() => setSelected(stored as readonly string[])}
            className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void onSave()}
            className="rounded-md border border-realm-aetheric bg-realm-aetheric/20 px-3 py-1 text-sm text-realm-aetheric hover:bg-realm-aetheric/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save team"}
          </button>
        </div>
      </section>

      {savedMsg ? (
        <div className="rounded-md border border-emerald-700/50 bg-emerald-950/30 p-2 text-xs text-emerald-200">
          {savedMsg}
        </div>
      ) : null}
    </main>
  );
};

const TeamPage = (): JSX.Element => (
  <RequireAuth>
    <TeamInner />
  </RequireAuth>
);

export default TeamPage;
