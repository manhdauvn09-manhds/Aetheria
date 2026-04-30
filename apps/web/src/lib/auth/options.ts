// Aetheria — NextAuth configuration.
//
// Strategy:
//   - NextAuth runs the OAuth dance on the web (handles redirects, code
//     exchange, ID token retrieval).
//   - In the `signIn` / `jwt` callbacks we forward the verified provider
//     credential to our API (`auth.loginWithGoogle` / `auth.loginWithDiscord`)
//     and stash the *Aetheria* tokens on the NextAuth JWT.
//   - The browser then has access to NextAuth's session cookie AND, via the
//     `session` callback, our access/refresh tokens. The Zustand session
//     store (Step 4.13 wires the actual UI) reads `useSession()` once on
//     load and copies the tokens over.

import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord";
import type { NextAuthOptions } from "next-auth";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@aetheria/api/router";

import { env, serverEnv } from "../env";

interface AetheriaSessionTokens {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

interface AetheriaSessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: readonly string[];
  oauthProvider: "google" | "discord" | null;
}

export interface AetheriaJwt {
  aetheriaUser?: AetheriaSessionUser;
  aetheriaTokens?: AetheriaSessionTokens;
  aetheriaError?: string;
}

const apiClient = (): ReturnType<typeof createTRPCProxyClient<AppRouter>> =>
  createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${env.NEXT_PUBLIC_API_URL}/trpc`,
        headers: () => ({ "x-aetheria-client": "web-nextauth" }),
      }),
    ],
  });

export const buildAuthOptions = (): NextAuthOptions => {
  const cfg = serverEnv();
  const providers: NextAuthOptions["providers"] = [];

  // Without a secret the JWT can't be signed; surface a placeholder so
  // module-level evaluation (Next route metadata collection) doesn't
  // crash, but NextAuth itself will refuse sign-in until a real value
  // is supplied at runtime.
  const secret = cfg.NEXTAUTH_SECRET ?? "DEV_PLACEHOLDER_DO_NOT_USE_IN_PROD";

  if (cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: cfg.GOOGLE_CLIENT_ID,
        clientSecret: cfg.GOOGLE_CLIENT_SECRET,
        // We need the id_token (default `openid email profile` scope already
        // includes openid which delivers id_token).
      }),
    );
  }
  if (cfg.DISCORD_CLIENT_ID && cfg.DISCORD_CLIENT_SECRET) {
    providers.push(
      DiscordProvider({
        clientId: cfg.DISCORD_CLIENT_ID,
        clientSecret: cfg.DISCORD_CLIENT_SECRET,
        authorization: { params: { scope: "identify email" } },
      }),
    );
  }

  return {
    secret,
    providers,
    session: { strategy: "jwt" },
    callbacks: {
      // Runs once at sign-in (account is defined) and on subsequent calls
      // to refresh the token. We call our API only on the first pass.
      async jwt({ token, account }) {
        const t = token as typeof token & AetheriaJwt;
        if (!account) return t;
        try {
          const trpc = apiClient();
          if (account.provider === "google" && account.id_token) {
            const res = await trpc.auth.loginWithGoogle.mutate({ idToken: account.id_token });
            t.aetheriaUser = res.user;
            t.aetheriaTokens = res.tokens;
            delete t.aetheriaError;
          } else if (account.provider === "discord" && account.access_token) {
            const res = await trpc.auth.loginWithDiscord.mutate({
              accessToken: account.access_token,
            });
            t.aetheriaUser = res.user;
            t.aetheriaTokens = res.tokens;
            delete t.aetheriaError;
          } else {
            t.aetheriaError = "Provider returned no usable credential";
          }
        } catch (e) {
          t.aetheriaError = e instanceof Error ? e.message : "Aetheria login failed";
        }
        return t;
      },
      session({ session, token }) {
        const t = token as typeof token & AetheriaJwt;
        const merged = session as typeof session & {
          aetheriaUser?: AetheriaSessionUser;
          aetheriaTokens?: AetheriaSessionTokens;
          aetheriaError?: string;
        };
        if (t.aetheriaUser) merged.aetheriaUser = t.aetheriaUser;
        if (t.aetheriaTokens) merged.aetheriaTokens = t.aetheriaTokens;
        if (t.aetheriaError) merged.aetheriaError = t.aetheriaError;
        return merged;
      },
    },
  };
};
