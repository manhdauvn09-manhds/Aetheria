"use client";

// Aetheria — Battle Pass screen.
//
// Reads the active season + the user's progress. Renders both tracks
// (free + premium) side by side, highlights the current/claimable tier,
// and exposes a Claim button that the server enforces in-order. Claims
// advance one tier at a time; the server-side rule rejects skips with
// `must_claim_in_order`.

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";

import type { AppRouter } from "@aetheria/api/router";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

type ProgressOutput = inferRouterOutputs<AppRouter>["battlepass"]["progress"];
type ActiveProgress = Exclude<ProgressOutput, { season: null }>;
type SeasonCatalog = ActiveProgress["season"];
type UserState = ActiveProgress["state"];
type Reward = SeasonCatalog["tracks"]["free"][number]["reward"];

const rewardLabel = (r: Reward): string =>
  r.kind === "xp" ? `+${r.amount.toString()} XP` : `${r.itemId} ×${r.quantity.toString()}`;

const BattlePassInner = (): JSX.Element => {
  const progress = trpc.battlepass.progress.useQuery();
  const utils = trpc.useUtils();
  const claim = trpc.battlepass.claim.useMutation({
    onSuccess: () => {
      void utils.battlepass.progress.invalidate();
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">
            Battle Pass
          </h1>
          <p className="text-xs text-zinc-500">
            Earn XP from play; claim free + premium rewards as you advance.
          </p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      {progress.isLoading ? (
        <p className="text-sm text-zinc-400">Loading season…</p>
      ) : null}
      {progress.isError ? (
        <p className="text-sm text-rose-400">
          Could not load battle pass: {progress.error.message}
        </p>
      ) : null}

      {progress.data?.season === null ? (
        <p className="text-sm text-zinc-500">No active season right now.</p>
      ) : null}

      {progress.data && progress.data.season !== null ? (
        <BattlePassBody
          season={(progress.data).season}
          state={(progress.data).state}
          onClaim={(tier) => {
            claim.mutate({
              seasonId: (progress.data as ActiveProgress).season.seasonId,
              tier,
            });
          }}
          claiming={claim.isLoading}
          claimError={claim.isError ? claim.error.message : null}
        />
      ) : null}
    </main>
  );
};

interface BodyProps {
  readonly season: SeasonCatalog;
  readonly state: UserState;
  readonly onClaim: (tier: number) => void;
  readonly claiming: boolean;
  readonly claimError: string | null;
}

const BattlePassBody = ({ season, state, onClaim, claiming, claimError }: BodyProps): JSX.Element => {

  const allTiers = Array.from(
    new Set([
      ...season.tracks.free.map((t) => t.tier),
      ...season.tracks.premium.map((t) => t.tier),
    ]),
  ).sort((a, b) => a - b);

  const freeById = new Map(season.tracks.free.map((t) => [t.tier, t.reward]));
  const premiumById = new Map(season.tracks.premium.map((t) => [t.tier, t.reward]));

  const nextClaimable = state.claimedTier + 1;
  const xpInCurrent = state.xp - state.currentTier * 1000;

  return (
    <>
      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-semibold text-zinc-100">{season.name}</div>
            <div className="text-xs text-zinc-500">
              {season.startsAt.toLocaleDateString()} – {season.endsAt.toLocaleDateString()}
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-zinc-300">
              Tier{" "}
              <span className="font-mono text-realm-aetheric">
                {state.currentTier.toString()}
              </span>{" "}
              / <span className="text-zinc-500">{season.maxTier.toString()}</span>
            </div>
            <div className="text-zinc-500">
              {state.xp.toString()} XP · {state.premium ? "Premium" : "Free"}
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
          <div
            className="h-full bg-realm-aetheric"
            style={{ width: `${Math.min(100, Math.round((xpInCurrent * 100) / 1000)).toString()}%` }}
          />
        </div>
      </section>

      <ul className="space-y-2">
        {allTiers.map((tier) => {
          const free = freeById.get(tier);
          const prem = premiumById.get(tier);
          const claimed = tier <= state.claimedTier;
          const ready = tier === nextClaimable && state.currentTier >= tier;
          const cls = claimed
            ? "border-zinc-800 bg-zinc-900/30 opacity-70"
            : ready
              ? "border-realm-aetheric bg-zinc-900/40"
              : "border-zinc-800 bg-zinc-900/40";
          return (
            <li
              key={tier}
              className={`grid grid-cols-[64px_1fr_1fr_120px] items-center gap-3 rounded-md border p-3 ${cls}`}
            >
              <div className="text-center text-xs uppercase tracking-wider text-zinc-500">
                Tier {tier.toString()}
              </div>
              <div className="text-sm text-zinc-200">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Free</div>
                {free ? rewardLabel(free) : <span className="text-zinc-600">—</span>}
              </div>
              <div className="text-sm text-zinc-200">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Premium</div>
                {prem ? (
                  <span className={state.premium ? "" : "text-zinc-600"}>
                    {rewardLabel(prem)}
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
              <div className="text-right">
                {claimed ? (
                  <span className="text-xs text-zinc-500">Claimed</span>
                ) : (
                  <button
                    type="button"
                    disabled={!ready || claiming}
                    onClick={() => {
                      onClaim(tier);
                    }}
                    className="rounded-md border border-realm-aetheric px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {ready ? "Claim" : "Locked"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {claimError ? <p className="text-sm text-rose-400">Claim failed: {claimError}</p> : null}
    </>
  );
};

const BattlePassPage = (): JSX.Element => (
  <RequireAuth>
    <BattlePassInner />
  </RequireAuth>
);

export default BattlePassPage;
