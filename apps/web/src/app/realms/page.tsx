"use client";

import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";
import { useGameFlow } from "@/store/gameFlow";

const RealmsInner = (): JSX.Element => {
  const setSelectedRealm = useGameFlow((s) => s.setSelectedRealm);
  const realms = trpc.world.realms.useQuery();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            Choose a realm
          </h1>
          <p className="text-xs text-zinc-500">
            Each realm has its own theme, palette, and difficulty curve.
          </p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      {realms.isLoading ? <p className="text-sm text-zinc-400">Loading realms…</p> : null}
      {realms.isError ? (
        <p className="text-sm text-rose-400">Could not load realms: {realms.error.message}</p>
      ) : null}
      {realms.data ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {realms.data.map((r) => (
            <li key={r.id}>
              <Link
                href={{ pathname: "/realms/[realmId]", query: {} }}
                as={`/realms/${r.id}`}
                onClick={() => {
                  setSelectedRealm(r.id);
                }}
                className="block rounded-md border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-realm-aetheric"
                style={{ borderLeft: `4px solid ${r.colorHex}` }}
              >
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  Realm #{r.orderIndex.toString()} · {r.theme}
                </div>
                <div className="font-semibold text-zinc-100">{r.name}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
};

const RealmsPage = (): JSX.Element => (
  <RequireAuth>
    <RealmsInner />
  </RequireAuth>
);

export default RealmsPage;
