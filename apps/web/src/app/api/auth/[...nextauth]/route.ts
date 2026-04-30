// Aetheria — NextAuth catch-all route. Handles /api/auth/signin,
// /api/auth/callback/{google,discord}, /api/auth/session, etc.

import NextAuth from "next-auth";

import { buildAuthOptions } from "@/lib/auth/options";

// next-auth v4 ships its app-router handler typed as `any`; cast at the
// boundary so the rest of the file stays strict.
const handler = NextAuth(buildAuthOptions()) as (
  req: Request,
  ctx: { params: { nextauth: string[] } },
) => Promise<Response>;

export { handler as GET, handler as POST };
