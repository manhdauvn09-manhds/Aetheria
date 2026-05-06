import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetheria.gg";

// Public-facing routes only. Auth-gated pages (/play, /pvp, /guild, etc.)
// are not indexed because crawlers cannot reach the gameplay state behind
// `RequireAuth`. Robots disallow them in tandem (see `robots.ts`).
const STATIC_ROUTES = [
  "",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return STATIC_ROUTES.map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1.0 : 0.6,
  }));
}
