// Aetheria — realtime env loader.
//
// Mirrors apps/api: same JWT_SECRET so the same access tokens authenticate
// both surfaces. REDIS_URL is optional in dev; when omitted the server
// runs single-process (no cross-instance pub/sub).

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  REALTIME_HOST: z.string().default("0.0.0.0"),
  REALTIME_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),

  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3001")
    .transform((s) => s.split(",").map((o) => o.trim()).filter((o) => o.length > 0)),

  JWT_SECRET:   z.string().min(32, "JWT_SECRET must be ≥32 bytes").max(512, "JWT_SECRET must be ≤512 bytes"),
  JWT_ISSUER:   z.string().default("aetheria"),
  JWT_AUDIENCE: z.string().default("aetheria-web"),

  /** When set, Socket.IO uses the Redis adapter for cross-instance pub/sub. */
  REDIS_URL: z.string().url().optional(),

  /** Sticky-session shard count (apps/realtime instances behind LB). */
  REALTIME_INSTANCES: z.coerce.number().int().min(1).max(64).default(1),
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
    throw new Error(`Invalid realtime environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
};
