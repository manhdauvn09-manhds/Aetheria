import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetheria.gg";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"],
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
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
