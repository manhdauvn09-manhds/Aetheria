"use client";

// Aetheria — root client providers. Holds:
//  - React Query client (one instance per browser tab via useState).
//  - tRPC React provider, configured to talk to apps/api over /trpc.
//
// This file is the *only* client boundary at the root; everything inside
// `app/` can stay as Server Components by default.

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";

import { trpc } from "@/lib/trpc/client";
import { buildHeaders, trpcTransformer, trpcUrl } from "@/lib/trpc/shared";
import { useSession } from "@/store/session";

export const Providers = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Game UIs do better with explicit refetches than the default
            // window-focus burst. Individual queries can override.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: trpcTransformer,
      links: [
        httpBatchLink({
          url: trpcUrl(),
          headers: () => {
            const tokens = useSession.getState().tokens;
            return buildHeaders(tokens?.accessToken ?? null);
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
};
