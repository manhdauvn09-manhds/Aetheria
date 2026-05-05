"use client";

// Aetheria — Roster screen.
//
// Lists owned characters, characters the user can unlock right now, and
// characters still locked behind unmet requirements. `unlockCharacter` and
// `ascend` actions live here; `equipSkin` is exposed via a small inline
// control so the same screen can answer "what's mine, what can I get,
// what can I become next." Skill tree drilldown links to /roster/[id].

import Link from "next/link";
import { useRouter } from "next/navigation";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

const formatUnlock = (
  unlock:
    | { kind: "default" }
    | { kind: "account_level"; level: number }
    | { kind: "quest"; questId: string }
    | { kind: "pvp_rank"; tier: string }
    | { kind: "secret" },
): string => {
  switch (unlock.kind) {
    case "default":
      return "Default roster";
    case "account_level":
      return `Account Lv ${unlock.level.toString()}`;
    case "quest":
      return `Complete quest ${unlock.questId}`;
    case "pvp_rank":
      return `Reach ${unlock.tier} in PvP`;
    case "secret":
      return "??? (secret)";
  }
};

const RosterInner = (): JSX.Element => {
  const router = useRouter();
  const list = trpc.roster.list.useQuery();
  const utils = trpc.useUtils();
  const unlock = trpc.roster.unlockCharacter.useMutation({
    onSuccess: () => {
      void utils.roster.list.invalidate();
    },
  });
  const ascend = trpc.roster.ascend.useMutation({
    onSuccess: () => {
      void utils.roster.list.invalidate();
    },
  });
  const equipSkin = trpc.roster.equipSkin.useMutation({
    onSuccess: () => {
      void utils.roster.list.invalidate();
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            Roster
          </h1>
          <p className="text-xs text-zinc-500">
            Unlock heroes, ascend them, and tune their skill trees.
          </p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      {list.isLoading ? <p className="text-sm text-zinc-400">Loading roster…</p> : null}
      {list.isError ? (
        <p className="text-sm text-rose-400">Could not load roster: {list.error.message}</p>
      ) : null}

      {list.data ? (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-lg text-zinc-200">
              Owned ({list.data.entries.length.toString()})
            </h2>
            {list.data.entries.length === 0 ? (
              <p className="text-sm text-zinc-500">
                You don&apos;t own any heroes yet. Default heroes seed on first login.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.data.entries.map((e) => (
                  <li
                    key={e.userCharacterId}
                    className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4"
                  >
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-zinc-500">
                          {e.character.class} · {e.character.role}
                        </div>
                        <div className="font-semibold text-zinc-100">
                          {e.character.name}{" "}
                          <span className="ml-1 text-xs text-realm-aetheric">
                            A{e.ascension.toString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">
                        XP {e.characterXp.toString()}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/roster/${e.userCharacterId}`);
                        }}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Skill tree →
                      </button>
                      <button
                        type="button"
                        disabled={ascend.isLoading || e.ascension >= 3}
                        onClick={() => {
                          ascend.mutate({ userCharacterId: e.userCharacterId });
                        }}
                        className="rounded-md border border-realm-aetheric px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {e.ascension >= 3 ? "Max ascension" : "Ascend"}
                      </button>
                      {e.equippedSkinId !== null ? (
                        <button
                          type="button"
                          disabled={equipSkin.isLoading}
                          onClick={() => {
                            equipSkin.mutate({
                              userCharacterId: e.userCharacterId,
                              skinItemId: null,
                            });
                          }}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Unequip skin
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg text-zinc-200">
              Unlockable now ({list.data.unlockable.length.toString()})
            </h2>
            {list.data.unlockable.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing new to unlock right now.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.data.unlockable.map((c) => (
                  <li
                    key={c.characterId}
                    className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4"
                  >
                    <div className="text-xs uppercase tracking-wider text-zinc-500">
                      {c.class} · {c.role}
                    </div>
                    <div className="font-semibold text-zinc-100">{c.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatUnlock(c.unlock)}</div>
                    <button
                      type="button"
                      disabled={unlock.isLoading}
                      onClick={() => {
                        unlock.mutate({ characterId: c.characterId });
                      }}
                      className="mt-3 rounded-md border border-realm-aetheric px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Unlock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg text-zinc-200">
              Locked ({list.data.locked.length.toString()})
            </h2>
            {list.data.locked.length === 0 ? (
              <p className="text-sm text-zinc-500">No more heroes to discover.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.data.locked.map((c) => (
                  <li
                    key={c.characterId}
                    className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4 opacity-70"
                  >
                    <div className="text-xs uppercase tracking-wider text-zinc-500">
                      {c.class} · {c.role}
                    </div>
                    <div className="font-semibold text-zinc-300">{c.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatUnlock(c.unlock)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {unlock.isError ? (
            <p className="text-sm text-rose-400">Unlock failed: {unlock.error.message}</p>
          ) : null}
          {ascend.isError ? (
            <p className="text-sm text-rose-400">Ascend failed: {ascend.error.message}</p>
          ) : null}
          {equipSkin.isError ? (
            <p className="text-sm text-rose-400">
              Skin change failed: {equipSkin.error.message}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
};

const RosterPage = (): JSX.Element => (
  <RequireAuth>
    <RosterInner />
  </RequireAuth>
);

export default RosterPage;
