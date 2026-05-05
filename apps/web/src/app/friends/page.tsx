"use client";

// Aetheria — Friends screen.
//
// Shows accepted friends + outgoing/incoming pending + blocked, plus an
// "add by user id" form. Server-side rules in `domain-social/friends`
// already hide blocks-against-the-viewer so the UI never has to.

import { useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

const FriendsInner = (): JSX.Element => {
  const list = trpc.friends.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = (): void => {
    void utils.friends.list.invalidate();
  };
  const request = trpc.friends.request.useMutation({ onSuccess: invalidate });
  const respond = trpc.friends.respond.useMutation({ onSuccess: invalidate });

  const [target, setTarget] = useState("");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">Friends</h1>
          <p className="text-xs text-zinc-500">Add by user id; accept incoming requests.</p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="font-display text-lg text-zinc-200">Add a friend</h2>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d+$/.test(target)) return;
            request.mutate({ targetUserId: target });
            setTarget("");
          }}
        >
          <input
            className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
            placeholder="User id"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
            }}
          />
          <button
            type="submit"
            disabled={request.isLoading}
            className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            Send
          </button>
        </form>
        {request.isError ? (
          <p className="mt-2 text-xs text-rose-400">{request.error.message}</p>
        ) : null}
      </section>

      {list.isLoading ? <p className="text-sm text-zinc-400">Loading…</p> : null}
      {list.isError ? (
        <p className="text-sm text-rose-400">{list.error.message}</p>
      ) : null}

      {list.data ? (
        <>
          <Bucket title="Friends" rows={list.data.accepted} empty="No friends yet." />
          <Bucket
            title="Incoming requests"
            rows={list.data.incomingPending}
            empty="No incoming requests."
            actions={(otherId) => (
              <span className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-realm-aetheric px-2 py-0.5 text-xs hover:bg-zinc-800"
                  onClick={() => {
                    respond.mutate({ requesterUserId: otherId, accept: true });
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800"
                  onClick={() => {
                    respond.mutate({ requesterUserId: otherId, accept: false });
                  }}
                >
                  Decline
                </button>
              </span>
            )}
          />
          <Bucket
            title="Outgoing requests"
            rows={list.data.outgoingPending}
            empty="No outgoing requests."
          />
          <Bucket title="Blocked" rows={list.data.blocked} empty="No blocked users." />
          {respond.isError ? (
            <p className="text-xs text-rose-400">Respond: {respond.error.message}</p>
          ) : null}
        </>
      ) : null}
    </main>
  );
};

interface Edge {
  readonly otherUserId: bigint;
  readonly status: "pending" | "accepted" | "blocked";
  readonly direction: "outgoing" | "incoming" | "accepted";
  readonly createdAt: Date;
}

const Bucket = ({
  title,
  rows,
  empty,
  actions,
}: {
  readonly title: string;
  readonly rows: readonly Edge[];
  readonly empty: string;
  readonly actions?: (otherUserId: string) => JSX.Element;
}): JSX.Element => (
  <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
    <h2 className="font-display text-lg text-zinc-200">{title}</h2>
    {rows.length === 0 ? (
      <p className="mt-2 text-sm text-zinc-500">{empty}</p>
    ) : (
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li
            key={r.otherUserId.toString()}
            className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm"
          >
            <span className="font-mono text-zinc-300">#{r.otherUserId.toString()}</span>
            {actions ? actions(r.otherUserId.toString()) : null}
          </li>
        ))}
      </ul>
    )}
  </section>
);

const FriendsPage = (): JSX.Element => (
  <RequireAuth>
    <FriendsInner />
  </RequireAuth>
);

export default FriendsPage;
