// Aetheria — session store (client-only). Holds auth tokens + the
// authenticated user's display info. Persisted to localStorage so that
// reloads keep the user logged in until the access token expires.
//
// The full hydrate-from-refresh-token flow lands in Step 4.13. For now
// this is a typed shell wired into the providers tree so other stores
// can compose against it.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SessionUser {
  readonly userId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

export interface SessionTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number; // epoch ms
  readonly refreshToken: string;
}

export interface SessionState {
  user: SessionUser | null;
  tokens: SessionTokens | null;
  setSession: (user: SessionUser, tokens: SessionTokens) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      setSession: (user, tokens) => {
        set({ user, tokens });
      },
      clearSession: () => {
        set({ user: null, tokens: null });
      },
      isAuthenticated: () => {
        const t = get().tokens;
        return t !== null && t.accessTokenExpiresAt > Date.now();
      },
    }),
    {
      name: "aetheria.session.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, tokens: s.tokens }),
    },
  ),
);
