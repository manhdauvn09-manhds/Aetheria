// Aetheria — tRPC server-side caller for React Server Components.
//
// In a Next.js Server Component we call the API over HTTP (same as the
// browser would) so that auth/session middleware on the API side runs
// uniformly. We could shortcut to `appRouter.createCaller(...)` for
// in-process calls once SSR auth context is wired (Step 4.13+).

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@aetheria/api/router";

import { buildHeaders, trpcTransformer, trpcUrl } from "./shared";

export const serverTrpc = createTRPCProxyClient<AppRouter>({
  transformer: trpcTransformer,
  links: [
    httpBatchLink({
      url: trpcUrl(),
      headers: () => buildHeaders(null),
    }),
  ],
});
