"use client";

// Aetheria — Guild screen.
//
// Three states:
//   • not-in-guild → Create form + pending invites list (with accept/decline)
//   • in-guild     → Member list with role pills + role-gated actions
//                    (invite, kick, promote) wired to mutations
//
// Permission gating mirrors the server-side rules in `domain-social/guild/rules`.

import { useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { trpc } from "@/lib/trpc/client";

const GuildInner = (): JSX.Element => {
  const membership = trpc.guild.myMembership.useQuery();
  const invites = trpc.guild.pendingInvites.useQuery();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-realm-aetheric">Guild</h1>
          <p className="text-xs text-zinc-500">Found, invite, lead. Roles: leader · officer · member.</p>
        </div>
        <Link href="/menu" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Main menu
        </Link>
      </header>

      {membership.isLoading ? <p className="text-sm text-zinc-400">Loading…</p> : null}
      {membership.isError ? (
        <p className="text-sm text-rose-400">Could not load: {membership.error.message}</p>
      ) : null}

      {membership.data === null ? (
        <NotInGuild
          invites={invites.data ?? []}
          invitesLoading={invites.isLoading}
        />
      ) : null}

      {membership.data ? (
        <InGuild guildId={membership.data.guildId} myRole={membership.data.role} />
      ) : null}
    </main>
  );
};

interface InviteRow {
  readonly inviteId: bigint;
  readonly guildId: bigint;
  readonly inviterUserId: bigint;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

const NotInGuild = ({
  invites,
  invitesLoading,
}: {
  readonly invites: readonly InviteRow[];
  readonly invitesLoading: boolean;
}): JSX.Element => {
  const utils = trpc.useUtils();
  const create = trpc.guild.create.useMutation({
    onSuccess: () => {
      void utils.guild.myMembership.invalidate();
    },
  });
  const respond = trpc.guild.respond.useMutation({
    onSuccess: () => {
      void utils.guild.pendingInvites.invalidate();
      void utils.guild.myMembership.invalidate();
    },
  });

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");

  return (
    <>
      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="font-display text-lg text-zinc-200">Found a guild</h2>
        <form
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name, tag, description: description || undefined });
          }}
        >
          <input
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
            placeholder="Name (3-64)"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <input
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
            placeholder="Tag (2-4)"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
            }}
          />
          <button
            type="submit"
            disabled={create.isLoading}
            className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            {create.isLoading ? "Creating…" : "Create"}
          </button>
          <textarea
            className="col-span-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
          />
        </form>
        {create.isError ? (
          <p className="mt-2 text-xs text-rose-400">{create.error.message}</p>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="font-display text-lg text-zinc-200">Pending invites</h2>
        {invitesLoading ? <p className="mt-2 text-sm text-zinc-500">Loading…</p> : null}
        {invites.length === 0 && !invitesLoading ? (
          <p className="mt-2 text-sm text-zinc-500">No pending invites.</p>
        ) : null}
        <ul className="mt-2 space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.inviteId.toString()}
              className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm"
            >
              <span>
                Guild #{inv.guildId.toString()} · invited by #{inv.inviterUserId.toString()}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-realm-aetheric px-2 py-0.5 text-xs hover:bg-zinc-800"
                  onClick={() => {
                    respond.mutate({ inviteId: inv.inviteId.toString(), accept: true });
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800"
                  onClick={() => {
                    respond.mutate({ inviteId: inv.inviteId.toString(), accept: false });
                  }}
                >
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>
        {respond.isError ? (
          <p className="mt-2 text-xs text-rose-400">{respond.error.message}</p>
        ) : null}
      </section>
    </>
  );
};

const roleRank: Record<"leader" | "officer" | "member", number> = {
  leader: 2,
  officer: 1,
  member: 0,
};

const InGuild = ({
  guildId,
  myRole,
}: {
  readonly guildId: bigint;
  readonly myRole: "leader" | "officer" | "member";
}): JSX.Element => {
  const detail = trpc.guild.get.useQuery({ guildId: guildId.toString() });
  const utils = trpc.useUtils();
  const invalidate = (): void => {
    void utils.guild.get.invalidate({ guildId: guildId.toString() });
    void utils.guild.myMembership.invalidate();
  };
  const invite = trpc.guild.invite.useMutation({ onSuccess: invalidate });
  const kick = trpc.guild.kick.useMutation({ onSuccess: invalidate });
  const promote = trpc.guild.promote.useMutation({ onSuccess: invalidate });

  const [inviteId, setInviteId] = useState("");

  if (detail.isLoading) return <p className="text-sm text-zinc-400">Loading guild…</p>;
  if (detail.isError) return <p className="text-sm text-rose-400">{detail.error.message}</p>;
  if (!detail.data) return <></>;

  const g = detail.data;
  const canInvite = myRole === "leader" || myRole === "officer";
  const canPromote = myRole === "leader";

  return (
    <>
      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-display text-2xl text-zinc-100">
              {g.name} <span className="text-zinc-500">[{g.tag}]</span>
            </div>
            <div className="text-xs text-zinc-500">
              Lv {g.level.toString()} · {g.xp.toString()} XP · {g.memberCount.toString()} members
            </div>
          </div>
          <span className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
            You: {myRole}
          </span>
        </div>
        {g.description ? (
          <p className="mt-2 text-sm text-zinc-400">{g.description}</p>
        ) : null}
      </section>

      {canInvite ? (
        <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="font-display text-lg text-zinc-200">Invite</h2>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^\d+$/.test(inviteId)) return;
              invite.mutate({ guildId: guildId.toString(), targetUserId: inviteId });
              setInviteId("");
            }}
          >
            <input
              className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
              placeholder="Target user id"
              value={inviteId}
              onChange={(e) => {
                setInviteId(e.target.value);
              }}
            />
            <button
              type="submit"
              disabled={invite.isLoading}
              className="rounded border border-realm-aetheric px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
            >
              Invite
            </button>
          </form>
          {invite.isError ? (
            <p className="mt-2 text-xs text-rose-400">{invite.error.message}</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="font-display text-lg text-zinc-200">Members</h2>
        <ul className="mt-2 space-y-2">
          {g.members.map((m) => {
            const canKickThis =
              roleRank[myRole] > roleRank[m.role] && m.role !== "leader";
            return (
              <li
                key={m.userId.toString()}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-zinc-300">#{m.userId.toString()}</span>
                  <span className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                    {m.role}
                  </span>
                </span>
                <span className="flex gap-2">
                  {canPromote && m.role !== "leader" ? (
                    <select
                      className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-xs"
                      value={m.role}
                      onChange={(e) => {
                        promote.mutate({
                          guildId: guildId.toString(),
                          targetUserId: m.userId.toString(),
                          newRole: e.target.value as "leader" | "officer" | "member",
                        });
                      }}
                    >
                      <option value="member">member</option>
                      <option value="officer">officer</option>
                      <option value="leader">leader</option>
                    </select>
                  ) : null}
                  {canKickThis ? (
                    <button
                      type="button"
                      className="rounded border border-rose-800 px-2 py-0.5 text-xs text-rose-300 hover:bg-rose-950"
                      onClick={() => {
                        kick.mutate({
                          guildId: guildId.toString(),
                          targetUserId: m.userId.toString(),
                        });
                      }}
                    >
                      Kick
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        {kick.isError ? (
          <p className="mt-2 text-xs text-rose-400">Kick: {kick.error.message}</p>
        ) : null}
        {promote.isError ? (
          <p className="mt-2 text-xs text-rose-400">Promote: {promote.error.message}</p>
        ) : null}
      </section>
    </>
  );
};

const GuildPage = (): JSX.Element => (
  <RequireAuth>
    <GuildInner />
  </RequireAuth>
);

export default GuildPage;
