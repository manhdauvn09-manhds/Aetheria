// Aetheria — session store (client-only).
//
// Storage strategy (Step 4.13):
//   - access token  : in memory only (Zustand state). Lost on reload, but
//                     a Next API route refreshes it from the httpOnly
//                     cookie before the first authed call.
//   - refresh token : httpOnly cookie set by the Next API auth routes.
//                     The browser JS never sees it — no XSS exfiltration.
//   - user info     : persisted to localStorage so reloads keep an
//                     "I appear logged in" hint until the refresh call
//                     resolves.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly oauthProvider: "google" | "discord" | null;
}

export interface AccessToken {
  readonly value: string;
  readonly expiresAt: number; // epoch ms
}

export interface SessionState {
  user: SessionUser | null;
  /** Lives only in memory — never persisted to disk. */
  access: AccessToken | null;
  setSession: (user: SessionUser, access: AccessToken) => void;
  setAccess: (access: AccessToken) => void;
  setUser: (user: SessionUser | null) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      user: null,
      access: null,
      setSession: (user, access) => {
        set({ user, access });
      },
      setAccess: (access) => {
        set({ access });
      },
      setUser: (user) => {
        set({ user });
      },
      clearSession: () => {
        set({ user: null, access: null });
      },
      isAuthenticated: () => {
        const a = get().access;
        return a !== null && a.expiresAt > Date.now();
      },
    }),
    {
      name: "aetheria.session.v2",
      storage: createJSONStorage(() => localStorage),
      // Only persist the non-PII user hint. Email is excluded — it's PII and
      // unnecessary for the "appears logged in" optimistic UI. Access token
      // stays in memory only.
      partialize: (s) => ({
        user: s.user
          ? { id: s.user.id, displayName: s.user.displayName, roles: s.user.roles, oauthProvider: s.user.oauthProvider }
          : null,
      }),
    },
  ),
);
