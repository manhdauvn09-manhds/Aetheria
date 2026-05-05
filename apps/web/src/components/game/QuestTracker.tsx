"use client";

// Aetheria — Quest tracker.
//
// Compact HUD-style tracker that lists daily + weekly quests with their
// progress bar and a Claim button when complete. Designed to be embedded
// inside other screens via `<QuestTracker variant="hud" />` or rendered
// standalone on /quests via `variant="page"`.

import { trpc } from "@/lib/trpc/client";

type QuestRequirement =
  | { kind: "craft_item"; count: number; itemId?: string }
  | { kind: "defeat_enemies"; count: number; archetype?: string }
  | { kind: "complete_levels"; count: number; levelId?: string }
  | { kind: "level_up"; targetLevel: number }
  | { kind: "finish_runs"; count: number; status?: "completed" | "failed" | "abandoned" };

type QuestReward =
  | { kind: "item"; itemId: string; quantity: number }
  | { kind: "xp"; amount: number };

const requirementGoal = (r: QuestRequirement): number =>
  r.kind === "level_up" ? r.targetLevel : r.count;

const requirementLabel = (r: QuestRequirement): string => {
  switch (r.kind) {
    case "craft_item":
      return r.itemId ? `Craft ${r.itemId} ×${r.count.toString()}` : `Craft any ×${r.count.toString()}`;
    case "defeat_enemies":
      return r.archetype
        ? `Defeat ${r.archetype} ×${r.count.toString()}`
        : `Defeat enemies ×${r.count.toString()}`;
    case "complete_levels":
      return r.levelId
        ? `Complete level ${r.levelId} ×${r.count.toString()}`
        : `Complete any level ×${r.count.toString()}`;
    case "level_up":
      return `Reach account Lv ${r.targetLevel.toString()}`;
    case "finish_runs":
      return r.status
        ? `Finish ${r.status} runs ×${r.count.toString()}`
        : `Finish runs ×${r.count.toString()}`;
  }
};

const rewardLabel = (rs: readonly QuestReward[]): string =>
  rs
    .map((r) =>
      r.kind === "xp" ? `+${r.amount.toString()} XP` : `${r.itemId} ×${r.quantity.toString()}`,
    )
    .join(" · ");

interface Props {
  readonly variant?: "hud" | "page";
}

export const QuestTracker = ({ variant = "hud" }: Props): JSX.Element => {
  const daily = trpc.quests.daily.useQuery();
  const weekly = trpc.quests.weekly.useQuery();
  const utils = trpc.useUtils();
  const claim = trpc.quests.claim.useMutation({
    onSuccess: () => {
      void utils.quests.daily.invalidate();
      void utils.quests.weekly.invalidate();
    },
  });

  const isHud = variant === "hud";
  const wrapCls = isHud
    ? "rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs"
    : "space-y-6";

  const renderEntries = (
    title: string,
    data: typeof daily.data,
    isLoading: boolean,
    isError: boolean,
    err?: { message: string },
  ): JSX.Element => (
    <section className={isHud ? "space-y-2" : "space-y-3"}>
      <h3
        className={
          isHud
            ? "text-[10px] uppercase tracking-wider text-zinc-500"
            : "font-display text-lg text-zinc-200"
        }
      >
        {title}
      </h3>
      {isLoading ? <p className="text-zinc-500">Loading…</p> : null}
      {isError ? <p className="text-rose-400">{err?.message ?? "Error"}</p> : null}
      {data ? (
        data.entries.length === 0 ? (
          <p className="text-zinc-500">No active quests.</p>
        ) : (
          <ul className={isHud ? "space-y-2" : "space-y-3"}>
            {data.entries.map((e) => {
              const goal = requirementGoal(e.quest.requirement);
              const cur = Math.min(goal, e.progress.count);
              const pct = goal > 0 ? Math.round((cur * 100) / goal) : 0;
              const claimed = e.status === "claimed";
              const ready = e.isComplete && !claimed;
              return (
                <li
                  key={e.quest.questId}
                  className={
                    isHud
                      ? "rounded border border-zinc-800 bg-zinc-950/40 p-2"
                      : "rounded-md border border-zinc-800 bg-zinc-900/40 p-4"
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className={isHud ? "" : "font-semibold text-zinc-100"}>
                      {requirementLabel(e.quest.requirement)}
                    </div>
                    <div className={isHud ? "text-zinc-500" : "text-xs text-zinc-500"}>
                      {cur.toString()} / {goal.toString()}
                    </div>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded bg-zinc-800">
                    <div
                      className="h-full bg-realm-aetheric"
                      style={{ width: `${pct.toString()}%` }}
                    />
                  </div>
                  <div
                    className={
                      isHud
                        ? "mt-1 flex items-center justify-between gap-2"
                        : "mt-2 flex items-center justify-between gap-2"
                    }
                  >
                    <div className="text-zinc-400">
                      {rewardLabel(e.quest.rewards)}
                    </div>
                    {claimed ? (
                      <span className="text-zinc-500">Claimed</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!ready || claim.isLoading}
                        onClick={() => {
                          claim.mutate({ questId: e.quest.questId });
                        }}
                        className="rounded border border-realm-aetheric px-2 py-0.5 text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {ready ? "Claim" : "In progress"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </section>
  );

  return (
    <div className={wrapCls}>
      {!isHud ? (
        <header>
          <h2 className="font-display text-3xl tracking-tight text-realm-aetheric">Quests</h2>
          <p className="text-xs text-zinc-500">
            Daily + weekly challenges. Progress is tracked automatically.
          </p>
        </header>
      ) : null}
      {renderEntries("Daily", daily.data, daily.isLoading, daily.isError, daily.error ?? undefined)}
      {renderEntries(
        "Weekly",
        weekly.data,
        weekly.isLoading,
        weekly.isError,
        weekly.error ?? undefined,
      )}
      {claim.isError ? (
        <p className={isHud ? "text-rose-400" : "text-sm text-rose-400"}>
          Claim failed: {claim.error.message}
        </p>
      ) : null}
    </div>
  );
};
