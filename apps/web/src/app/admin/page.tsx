"use client";

// Aetheria — Admin tools.
//
// Minimal CRUD over the admin tRPC surface. Server-side `adminProcedure`
// is the gate; this page just hides itself for non-admins by reading
// `roles` from the local session.

import { useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "@/store/session";

const AdminInner = (): JSX.Element => {
  const roles = useSession((s) => s.user?.roles ?? []);
  const isAdmin = roles.includes("admin");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">Admin</h1>
          <p className="text-xs text-zinc-500">
            Privileged actions. Every call writes an audit log entry.
          </p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      {!isAdmin ? (
        <p className="rounded-md border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
          You are not signed in as an admin. The server will reject every action.
        </p>
      ) : null}

      <BanCard />
      <GrantItemCard />
      <FeatureFlagsCard />
      <ReplayCard />
    </main>
  );
};

const BanCard = (): JSX.Element => {
  const ban = trpc.admin.banUser.useMutation();
  const unban = trpc.admin.unbanUser.useMutation();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Card title="User moderation">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Target user id"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
          }}
        />
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Reason (ban only)"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
        <button
          type="button"
          disabled={ban.isLoading || !/^\d+$/.test(target) || reason.length === 0}
          onClick={() => {
            ban.mutate({ targetUserId: target, reason });
          }}
          className="rounded border border-rose-800 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-50"
        >
          Ban
        </button>
        <button
          type="button"
          disabled={unban.isLoading || !/^\d+$/.test(target)}
          onClick={() => {
            unban.mutate({ targetUserId: target });
          }}
          className="rounded border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          Unban
        </button>
      </div>
      {ban.isError ? <p className="mt-2 text-xs text-rose-400">{ban.error.message}</p> : null}
      {unban.isError ? <p className="mt-2 text-xs text-rose-400">{unban.error.message}</p> : null}
      {ban.isSuccess || unban.isSuccess ? (
        <p className="mt-2 text-xs text-emerald-400">Done.</p>
      ) : null}
    </Card>
  );
};

const GrantItemCard = (): JSX.Element => {
  const grant = trpc.admin.grantItem.useMutation();
  const [target, setTarget] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  return (
    <Card title="Grant item">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Target user id"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
          }}
        />
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Item id"
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
          }}
        />
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          type="number"
          min={1}
          max={9999}
          value={qty}
          onChange={(e) => {
            setQty(e.target.value);
          }}
        />
        <button
          type="button"
          disabled={
            grant.isLoading ||
            !/^\d+$/.test(target) ||
            !/^\d+$/.test(itemId) ||
            !Number.isFinite(Number(qty))
          }
          onClick={() => {
            grant.mutate({
              targetUserId: target,
              itemId,
              quantity: Math.max(1, Math.min(9999, Math.floor(Number(qty)))),
            });
          }}
          className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          Grant
        </button>
      </div>
      {grant.isError ? (
        <p className="mt-2 text-xs text-rose-400">{grant.error.message}</p>
      ) : null}
      {grant.isSuccess ? (
        <p className="mt-2 text-xs text-emerald-400">
          Granted ×{grant.data.granted.toString()} (now {grant.data.newQuantity.toString()}).
        </p>
      ) : null}
    </Card>
  );
};

const FeatureFlagsCard = (): JSX.Element => {
  const flags = trpc.admin.listFeatureFlags.useQuery();
  const utils = trpc.useUtils();
  const setFlag = trpc.admin.setFeatureFlag.useMutation({
    onSuccess: () => {
      void utils.admin.listFeatureFlags.invalidate();
    },
  });
  const [key, setKey] = useState("");
  const [valueRaw, setValueRaw] = useState("true");
  return (
    <Card title="Feature flags">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Flag key"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
          }}
        />
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="JSON value (e.g. true / 0.5 / {})"
          value={valueRaw}
          onChange={(e) => {
            setValueRaw(e.target.value);
          }}
        />
        <button
          type="button"
          disabled={setFlag.isLoading || key.length === 0}
          onClick={() => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(valueRaw);
            } catch {
              parsed = valueRaw;
            }
            setFlag.mutate({ key, value: parsed });
          }}
          className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          Set
        </button>
      </div>
      {setFlag.isError ? (
        <p className="mt-2 text-xs text-rose-400">{setFlag.error.message}</p>
      ) : null}
      <ul className="mt-3 space-y-1 text-sm">
        {flags.data?.map((f) => (
          <li
            key={f.key}
            className="flex items-baseline justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2"
          >
            <span className="font-mono text-zinc-300">{f.key}</span>
            <span className="font-mono text-zinc-400">{JSON.stringify(f.value)}</span>
          </li>
        ))}
        {flags.data?.length === 0 ? (
          <li className="text-zinc-500">No flags set.</li>
        ) : null}
      </ul>
    </Card>
  );
};

const ReplayCard = (): JSX.Element => {
  const [action, setAction] = useState("");
  const replay = trpc.admin.replay.useQuery(
    { action: action || undefined, limit: 25 },
    { refetchOnWindowFocus: false },
  );
  return (
    <Card title="Audit replay">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
          placeholder="Filter by action (e.g. shop.purchase)"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
          }}
        />
        <button
          type="button"
          onClick={() => {
            void replay.refetch();
          }}
          className="rounded border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
        >
          Reload
        </button>
      </div>
      {replay.isError ? (
        <p className="mt-2 text-xs text-rose-400">{replay.error.message}</p>
      ) : null}
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-xs">
        {replay.data?.map((e) => (
          <li
            key={e.id.toString()}
            className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-zinc-300">{e.action}</span>
              <span className="text-zinc-500">{e.createdAt.toISOString()}</span>
            </div>
            <div className="mt-1 text-zinc-400">
              actor #{e.actorUserId?.toString() ?? "—"} → {e.targetType}#
              {e.targetId?.toString() ?? "—"}
            </div>
          </li>
        ))}
        {replay.data?.length === 0 ? <li className="text-zinc-500">No entries.</li> : null}
      </ul>
    </Card>
  );
};

const Card = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): JSX.Element => (
  <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
    <h2 className="font-display text-lg text-zinc-200">{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

const AdminPage = (): JSX.Element => (
  <RequireAuth>
    <AdminInner />
  </RequireAuth>
);

export default AdminPage;
