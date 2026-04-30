// Aetheria — shared tRPC link config (URL, transformer, headers).
// Imported by both the React (browser) client and the server-side caller.

import superjson from "superjson";

import { env } from "../env";

export const trpcUrl = (): string => `${env.NEXT_PUBLIC_API_URL}/trpc`;

export const trpcTransformer = superjson;

/**
 * Compose request headers for tRPC links. The auth slice (Step 4.10+) will
 * add `Authorization: Bearer …` here once token plumbing lands.
 */
export const buildHeaders = (token?: string | null): Record<string, string> => {
  const h: Record<string, string> = { "x-aetheria-client": "web" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
};
