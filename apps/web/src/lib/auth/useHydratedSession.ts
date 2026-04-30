// Aetheria — hook: hydrate the in-memory access token from the
// httpOnly refresh cookie on first mount.
//
// Returns a status flag the caller can use to gate a render:
//   - "loading"        : the refresh request is in flight
//   - "authenticated"  : the session is valid + access token in memory
//   - "unauthenticated": no valid session (expired / missing cookie)

"use client";

import { useEffect, useState } from "react";

import { postJSON } from "@/lib/auth/client";
import type { SessionResponseBody } from "@/lib/auth/proxy";
import { useSession } from "@/store/session";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export const useHydratedSession = (): SessionStatus => {
  const access = useSession((s) => s.access);
  const setSession = useSession((s) => s.setSession);
  const clearSession = useSession((s) => s.clearSession);
  const [status, setStatus] = useState<SessionStatus>(() => {
    if (access && access.expiresAt > Date.now()) return "authenticated";
    return "loading";
  });

  useEffect(() => {
    if (access && access.expiresAt > Date.now()) {
      setStatus("authenticated");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await postJSON<SessionResponseBody>("/api/auth/refresh", {});
        if (cancelled) return;
        setSession(res.user, res.access);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        clearSession();
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access, setSession, clearSession]);

  return status;
};
