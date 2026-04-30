// Aetheria — tRPC React client. Used in client components via hooks like
// `trpc.health.ping.useQuery()`. The Provider is wired in app/providers.tsx.

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@aetheria/api/router";

export const trpc = createTRPCReact<AppRouter>();
