"use client";

// Aetheria — session bar shown on the landing page.
//
// Reads the Zustand session for the cached user hint and on mount tries
// `POST /api/auth/refresh` to upgrade to a fresh access token. If the
// refresh succeeds, the user is treated as logged-in. Otherwise we
// render the pre-auth call-to-action.
//
// Logout: hits `/api/auth/logout` (which clears the cookie + revokes
// server-side) then clears the session store.

import Link from "next/link";
import { useEffect, useState } from "react";

import { bootstrapLocalQuiet } from "@/lib/auth/bootstrap";
import { AuthApiError, postJSON } from "@/lib/auth/client";
import type { SessionResponseBody } from "@/lib/auth/proxy";
import { useSession } from "@/store/session";

export const SessionBar = (): JSX.Element => {
  const user = useSession((s) => s.user);
  const access = useSession((s) => s.access);
  const setSession = useSession((s) => s.setSession);
  const clearSession = useSession((s) => s.clearSession);
  const [hydrating, setHydrating] = useState(true);
  const [busy, setBusy] = useState(false);

  // On mount, try to upgrade the (possibly stale) cached user hint with
  // a fresh access token. If the refresh cookie is missing/expired, we
  // silently fall back to the logged-out state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await postJSON<SessionResponseBody>("/api/auth/refresh", {});
        if (!cancelled) {
          setSession(res.user, res.access);
          // Fire-and-forget — local SQLite bootstrap is non-blocking.
          void bootstrapLocalQuiet(res.access.value);
        }
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession, setSession]);

  const onLogout = async (): Promise<void> => {
    setBusy(true);
    try {
      await postJSON<{ ok: true }>("/api/auth/logout", {});
    } catch (e) {
      if (!(e instanceof AuthApiError)) console.error(e);
    } finally {
      clearSession();
      setBusy(false);
    }
  };

  if (hydrating) {
    return <span className="text-xs text-zinc-500">Checking session…</span>;
  }

  if (user && access && access.expiresAt > Date.now()) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-300">
          Signed in as <span className="font-mono text-zinc-100">{user.displayName}</span>
        </span>
        <Link
          href="/menu"
          className="rounded-md border border-realm-aetheric bg-realm-aetheric/10 px-2 py-1 text-xs text-zinc-100 hover:bg-realm-aetheric/20"
        >
          Open menu
        </Link>
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={busy}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link
        href="/login"
        className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        className="rounded-md bg-realm-aetheric px-3 py-1 text-white hover:opacity-90"
      >
        Create account
      </Link>
    </div>
  );
};
