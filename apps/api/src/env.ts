// Aetheria — env var loader. Fails fast at boot if anything is missing or
// malformed. Defaults are dev-friendly; production must set everything.

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3001")
    .transform((s) => s.split(",").map((o) => o.trim()).filter((o) => o.length > 0)),

  RATE_LIMIT_MAX:        z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS:  z.coerce.number().int().positive().default(60_000),

  JWT_SECRET:         z.string().min(32, "JWT_SECRET must be ≥32 bytes"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be ≥32 bytes"),
  JWT_ISSUER:   z.string().default("aetheria"),
  JWT_AUDIENCE: z.string().default("aetheria-web"),

  DATABASE_URL_MYSQL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  // OAuth (used by apps/web NextAuth + apps/api server-side verification).
  // Either provider can be left blank — the matching tRPC procedure will
  // surface NOT_IMPLEMENTED rather than booting with broken config.
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID:     z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),

  // Mailer (Resend). When unset, the API uses a console mailer that
  // logs the would-be email to stderr — fine for dev, useless for prod.
  RESEND_API_KEY:  z.string().optional(),
  MAIL_FROM:       z.string().email().default("noreply@aetheria.local"),

  // Front-end URLs that the password-reset / email-verification emails
  // point at. The token is appended as `?token=…`.
  PASSWORD_RESET_URL:       z.string().url().default("http://localhost:3001/reset-password"),
  EMAIL_VERIFICATION_URL:   z.string().url().default("http://localhost:3001/verify-email"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parse process.env once. Throws AggregateError-style ZodError on first call if invalid. */
export const loadEnv = (): Env => {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
};
