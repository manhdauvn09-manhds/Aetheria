// Aetheria — web env loader.
//
// Public (NEXT_PUBLIC_*) values are exposed to the browser bundle. The
// NextAuth secrets are *server-only* and must NEVER be re-exported to
// the client — they live in `serverEnv` which only resolves from
// process.env at runtime in Server Components / API routes.

import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3001"),
  /** Surface OAuth provider availability to the UI (so the buttons can hide). */
  NEXT_PUBLIC_OAUTH_GOOGLE: z.coerce.boolean().default(false),
  NEXT_PUBLIC_OAUTH_DISCORD: z.coerce.boolean().default(false),
});

export type WebEnv = z.infer<typeof publicSchema>;

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_OAUTH_GOOGLE: process.env.NEXT_PUBLIC_OAUTH_GOOGLE,
  NEXT_PUBLIC_OAUTH_DISCORD: process.env.NEXT_PUBLIC_OAUTH_DISCORD,
});

if (!parsed.success) {
  throw new Error(
    "[web/env] invalid environment:\n" +
      parsed.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n"),
  );
}

export const env: WebEnv = parsed.data;

// ── server-only ──────────────────────────────────────────────────────

// All values optional at the type level so the build-time module
// evaluation (Next collects route metadata during `next build`) doesn't
// crash on missing values. The NextAuth handler still rejects sign-in
// at runtime if NEXTAUTH_SECRET / NEXTAUTH_URL aren't supplied.
const serverSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  NEXTAUTH_URL:    z.string().url().optional(),
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID:     z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
});

export type WebServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: WebServerEnv | null = null;

export const serverEnv = (): WebServerEnv => {
  if (cachedServerEnv) return cachedServerEnv;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      "[web/serverEnv] invalid environment:\n" +
        result.error.issues
          .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n"),
    );
  }
  cachedServerEnv = result.data;
  return cachedServerEnv;
};
