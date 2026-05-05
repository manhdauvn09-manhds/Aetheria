"use client";

// Aetheria — Skill tree screen.
//
// Drilldown from /roster. Reads `skills.tree` for a userCharacter, lets the
// player invest a single point per click, and offers a respec that wipes
// every node for that character. SP totals come from account level (see
// `RosterService.getSkillTree`), so refunds are implicit.

import Link from "next/link";
import { useParams } from "next/navigation";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

const SkillTreeInner = (): JSX.Element => {
  const params = useParams<{ userCharacterId: string }>();
  const userCharacterId = params?.userCharacterId ?? "";
  const valid = /^\d+$/.test(userCharacterId);

  const tree = trpc.skills.tree.useQuery(
    { userCharacterId },
    { enabled: valid },
  );
  const utils = trpc.useUtils();
  const invest = trpc.skills.invest.useMutation({
    onSuccess: () => {
      void utils.skills.tree.invalidate({ userCharacterId });
    },
  });
  const respec = trpc.skills.respec.useMutation({
    onSuccess: () => {
      void utils.skills.tree.invalidate({ userCharacterId });
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            Skill tree
          </h1>
          <p className="text-xs text-zinc-500">
            Spend skill points (granted by account level) on this hero&apos;s nodes.
          </p>
        </div>
        <Link href="/roster" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Roster
        </Link>
      </header>

      {!valid ? <p className="text-sm text-rose-400">Invalid character id.</p> : null}
      {tree.isLoading ? <p className="text-sm text-zinc-400">Loading skill tree…</p> : null}
      {tree.isError ? (
        <p className="text-sm text-rose-400">Could not load tree: {tree.error.message}</p>
      ) : null}

      {tree.data ? (
        <>
          <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm text-zinc-300">
                Skill points{" "}
                <span className="font-mono text-realm-aetheric">
                  {tree.data.skillPointsAvailable.toString()}
                </span>{" "}
                <span className="text-zinc-500">
                  / {tree.data.skillPointsTotal.toString()} (
                  {tree.data.skillPointsSpent.toString()} spent)
                </span>
              </div>
              <button
                type="button"
                disabled={respec.isLoading || tree.data.skillPointsSpent === 0}
                onClick={() => {
                  respec.mutate({ userCharacterId });
                }}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {respec.isLoading ? "Respec'ing…" : "Respec"}
              </button>
            </div>
          </section>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tree.data.nodes.map((n) => {
              const maxed = n.investedLevel >= n.maxLevel;
              const cantAfford = tree.data.skillPointsAvailable <= 0;
              return (
                <li
                  key={n.skillId}
                  className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <div className="text-xs uppercase tracking-wider text-zinc-500">
                    {n.type} · AP {n.apCost.toString()} · CD {n.cooldown.toString()}
                  </div>
                  <div className="font-semibold text-zinc-100">{n.name}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Lv {n.investedLevel.toString()} / {n.maxLevel.toString()}
                  </div>
                  <button
                    type="button"
                    disabled={invest.isLoading || maxed || cantAfford}
                    onClick={() => {
                      invest.mutate({ userCharacterId, skillId: n.skillId });
                    }}
                    className="mt-3 rounded-md border border-realm-aetheric px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {maxed ? "Maxed" : "Invest +1"}
                  </button>
                </li>
              );
            })}
          </ul>

          {tree.data.nodes.length === 0 ? (
            <p className="text-sm text-zinc-500">No skills published for this hero yet.</p>
          ) : null}

          {invest.isError ? (
            <p className="text-sm text-rose-400">Invest failed: {invest.error.message}</p>
          ) : null}
          {respec.isError ? (
            <p className="text-sm text-rose-400">Respec failed: {respec.error.message}</p>
          ) : null}
        </>
      ) : null}
    </main>
  );
};

const SkillTreePage = (): JSX.Element => (
  <RequireAuth>
    <SkillTreeInner />
  </RequireAuth>
);

export default SkillTreePage;
