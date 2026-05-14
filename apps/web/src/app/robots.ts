import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetheria.gg";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          // Public marketing showcase — kept here so it survives any future
          // tightening of the disallow list under /docs/*.
          "/docs/aetheria-showcase.html",
        ],
        disallow: [
          "/admin",
          "/menu",
          "/play",
          "/pvp",
          "/guild",
          "/chat",
          "/leaderboard",
          "/battlepass",
          "/friends",
          "/roster",
          "/realms",
          "/api/",
          "/trpc/",
          // Internal operations document — must never appear in SERPs even
          // though the file is served from /public for the admin team.
          "/docs/ADS_ADMIN_GUIDE.html",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
