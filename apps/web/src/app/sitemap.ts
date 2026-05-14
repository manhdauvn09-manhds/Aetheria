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
  // Public marketing collateral. The bilingual showcase is the de-facto
  // landing for press / partner referrals; not advertising it in the
  // sitemap means Googlebot has to discover it via inbound links alone.
  // ADS_ADMIN_GUIDE.html is internal and intentionally absent here — it is
  // disallowed in robots.ts so search engines won't surface it either.
  "/docs/aetheria-showcase.html",
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
