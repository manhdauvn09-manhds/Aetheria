"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { AuthApiError, postJSON } from "@/lib/auth/client";
import { useSession } from "@/store/session";
import { useGameFlow } from "@/store/gameFlow";

const MenuInner = (): JSX.Element => {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const clearSession = useSession((s) => s.clearSession);
  const reset = useGameFlow((s) => s.reset);
  const [busy, setBusy] = useState(false);

  const onLogout = async (): Promise<void> => {
    setBusy(true);
    try {
      await postJSON<{ ok: true }>("/api/auth/logout", {});
    } catch (e) {
      if (!(e instanceof AuthApiError)) console.error(e);
    } finally {
      clearSession();
      reset();
      setBusy(false);
      router.replace("/login");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-4xl tracking-tight text-realm-aetheric">
          Aetheria
        </h1>
        <p className="text-sm text-zinc-400">
          Welcome back,{" "}
          <span className="font-mono text-zinc-100">{user?.displayName ?? "Hero"}</span>.
        </p>
      </header>

      <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MenuButton href="/realms" title="New Journey" subtitle="Pick a realm and dive in." accent />
        <MenuButton
          href="/realms"
          title="Continue"
          subtitle="Resume an active run (auto-detected)."
        />
        <MenuButton href="/roster" title="Roster" subtitle="Heroes, ascensions, skill trees." />
        <MenuButton href="/quests" title="Quests" subtitle="Daily + weekly challenges." />
        <MenuButton href="/battlepass" title="Battle Pass" subtitle="Seasonal track rewards." />
        <MenuButton href="/guild" title="Guild" subtitle="Found, recruit, lead." />
        <MenuButton href="/friends" title="Friends" subtitle="Add, accept, manage." />
        <MenuButton href="/chat" title="Chat" subtitle="Global / guild / whispers." />
        <MenuButton href="/pvp" title="PvP" subtitle="Ranked 1v1 / 3v3." />
        <MenuButton href="/leaderboard" title="Leaderboard" subtitle="Live Glicko-2 standings." />
      </nav>

      <footer className="flex justify-center">
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={busy}
          className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </footer>
    </main>
  );
};

interface MenuButtonProps {
  readonly href: string;
  readonly title: string;
  readonly subtitle: string;
  readonly disabled?: boolean;
  readonly accent?: boolean;
}

const MenuButton = ({ href, title, subtitle, disabled, accent }: MenuButtonProps): JSX.Element => {
  const base =
    "block rounded-md border p-4 text-left transition";
  const cls = disabled
    ? `${base} cursor-not-allowed border-zinc-800 bg-zinc-900/30 opacity-60`
    : accent
      ? `${base} border-realm-aetheric bg-zinc-900/40 hover:bg-zinc-900`
      : `${base} border-zinc-800 bg-zinc-900/40 hover:border-realm-aetheric`;
  const inner = (
    <>
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="mt-1 text-xs text-zinc-400">{subtitle}</div>
    </>
  );
  if (disabled) {
    return <div className={cls}>{inner}</div>;
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
};

const MenuPage = (): JSX.Element => (
  <RequireAuth>
    <MenuInner />
  </RequireAuth>
);

export default MenuPage;
