// Aetheria — web env loader. Tiny on purpose: only a couple of values
// are needed pre-auth. Auth-related env (OAuth client ids etc.) lands
// alongside the auth slice in Step 4.10+.

import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3001"),
});

export type WebEnv = z.infer<typeof schema>;

const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
