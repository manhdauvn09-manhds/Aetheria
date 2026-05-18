// Aetheria — env var loader. Fails fast at boot if anything is missing or
// malformed. Defaults are dev-friendly; production must set everything.

import { z } from "zod";

import { hasSufficientEntropy } from "@aetheria/core";

// Reject low-entropy JWT secrets (e.g. "a".repeat(32)) — see @aetheria/core/secret.
const strongSecret = (label: string): z.ZodString =>
  z
    .string()
    .min(32, `${label} must be ≥32 bytes`)
    .max(512, `${label} must be ≤512 bytes`)
    .refine(
      hasSufficientEntropy,
      `${label} entropy too low (use \`openssl rand -base64 32\`)`,
    ) as unknown as z.ZodString;

// Validate each comma-separated origin parses as a URL. Rejects "localhost",
// trailing-slash typos, and accidental whitespace at boot rather than at
// first cross-origin request.
const corsOrigins = z
  .string()
  .default("http://localhost:3001")
  .transform((s, ctx) => {
    const items = s.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
    for (const item of items) {
      try {
        new URL(item);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid origin (not a URL): "${item}"`,
        });
        return z.NEVER;
      }
    }
    return items;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Operator socket-level timeout for MySQL queries. Hard-required in
  // production: without it, a slow/hung query holds a connection slot
  // until the OS kills it (potentially minutes), starving the pool.
  // Leave empty in dev so migrations + Prisma Studio aren't capped.
  MYSQL_SOCKET_TIMEOUT: z.string().optional(),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  CORS_ORIGIN: corsOrigins,

  /**
   * Require `cf-connecting-ip` on every inbound request and trust XFF only
   * from Cloudflare CIDRs. Default ON in production, OFF in dev/test so
   * `curl localhost:3000` still works.
   */
  ENFORCE_CLOUDFLARE: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => (typeof v === "string" ? v === "true" || v === "1" : v)),

  RATE_LIMIT_MAX:        z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS:  z.coerce.number().int().positive().default(60_000),

  JWT_SECRET:         strongSecret("JWT_SECRET"),
  JWT_REFRESH_SECRET: strongSecret("JWT_REFRESH_SECRET"),
  JWT_ISSUER:   z.string().default("aetheria"),
  JWT_AUDIENCE: z.string().default("aetheria-web"),

  DATABASE_URL_MYSQL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  /** PvP season identifier — keys leaderboards by `lb:{mode}:{seasonId}`. */
  PVP_SEASON_ID: z.string().min(1).max(32).default("1"),

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
})
.superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;
  // In production, never silently fall back to the console mailer:
  // password-reset tokens would land in stderr → log aggregator → ATO.
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RESEND_API_KEY"],
      message:
        "RESEND_API_KEY is required in production — consoleMailer leaks reset tokens to stderr",
    });
  }
  // In production, require a socket-level query timeout so a hung
  // query can't pin a pool slot forever and degrade service.
  if (
    !env.MYSQL_SOCKET_TIMEOUT ||
    !/^\d+$/.test(env.MYSQL_SOCKET_TIMEOUT) ||
    Number.parseInt(env.MYSQL_SOCKET_TIMEOUT, 10) <= 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MYSQL_SOCKET_TIMEOUT"],
      message:
        "MYSQL_SOCKET_TIMEOUT (seconds) is required in production — unset = pool exhaustion risk",
    });
  }
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
