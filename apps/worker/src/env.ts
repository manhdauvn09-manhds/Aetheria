// Aetheria — worker env loader.

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL_MYSQL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  /**
   * Comma-separated job allowlist. Empty default = run everything that's
   * registered. Useful in production to shard jobs across worker fleets:
   * one fleet runs `dailyReset,leaderboardSnapshot`, another runs the
   * anti-cheat sweep, etc.
   */
  WORKER_JOBS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export const loadEnv = (): Env => {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid worker environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
};
