// Aetheria — post-login local SQLite bootstrap helper.
//
// After signup / login / cookie-driven refresh, the web client calls
// `account.bootstrapLocal` so the API can open the user's per-player
// SQLite file, run migrations, and seed `local_profile`. We hit the
// tRPC endpoint directly (rather than a Next route proxy) because we
// already hold the access token client-side.

import superjson from "superjson";

import { env } from "../env";

export const bootstrapLocalQuiet = async (accessToken: string): Promise<void> => {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/trpc/account.bootstrapLocal`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-aetheria-client": "web",
      },
      // tRPC v10 expects superjson-encoded body even when there's no input.
      body: JSON.stringify(superjson.serialize({})),
    });
    if (!res.ok) {
      console.warn(`[bootstrapLocal] non-OK status ${String(res.status)}`);
    }
  } catch (e) {
    // Non-blocking — the user can still play; sync will catch up later.
    console.warn("[bootstrapLocal] failed", e);
  }
};
