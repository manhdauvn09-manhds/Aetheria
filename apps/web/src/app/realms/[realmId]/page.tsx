"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

const LevelPickerInner = (): JSX.Element => {
  const params = useParams<{ realmId: string }>();
  const realmId = params?.realmId ?? "";
  const realmIdNum = Number.parseInt(realmId, 10);
  const valid = Number.isInteger(realmIdNum) && realmIdNum > 0;

  const realms = trpc.world.realms.useQuery();
  const levels = trpc.world.levelsForRealm.useQuery(
    { realmId: valid ? realmIdNum : 0 },
    { enabled: valid },
  );
  const realm = realms.data?.find((r) => r.id === realmId);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            {realm ? realm.theme : "—"}
          </div>
          <h1
            className="font-display text-3xl tracking-tight"
            style={{ color: realm?.colorHex ?? "#a78bfa" }}
          >
            {realm?.name ?? `Realm ${realmId}`}
          </h1>
        </div>
        <Link href="/realms" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Realms
        </Link>
      </header>

      {!valid ? (
        <p className="text-sm text-rose-400">Invalid realm id.</p>
      ) : null}
      {levels.isLoading ? <p className="text-sm text-zinc-400">Loading levels…</p> : null}
      {levels.isError ? (
        <p className="text-sm text-rose-400">Could not load levels: {levels.error.message}</p>
      ) : null}
      {levels.data ? (
        levels.data.length === 0 ? (
          <p className="text-sm text-zinc-500">No levels in this realm yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {levels.data.map((lv) => (
              <li
                key={lv.id}
                className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-realm-aetheric"
              >
                <Link
                  href={{ pathname: "/play/[levelNumber]", query: {} }}
                  as={`/play/${lv.levelNumber.toString()}`}
                  className="block space-y-1"
                >
                  <div className="text-xs uppercase tracking-wider text-zinc-500">
                    Level {lv.levelNumber.toString()} · {lv.type}
                  </div>
                  <div className="font-semibold text-zinc-100">{lv.name}</div>
                  <div className="text-xs text-zinc-400">
                    Difficulty {lv.difficulty.toString()} · min Lv {lv.minAccountLevel.toString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </main>
  );
};

const LevelPickerPage = (): JSX.Element => (
  <RequireAuth>
    <LevelPickerInner />
  </RequireAuth>
);

export default LevelPickerPage;
