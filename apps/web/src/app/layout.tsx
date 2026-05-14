import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";
import { SwRegister } from "@/components/pwa/SwRegister";
import { Providers } from "./providers";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetheria.gg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  "Aetheria — Tactical Hex-Based Combat RPG",
    template: "%s · Aetheria",
  },
  description:
    "Aetheria is a free-to-play tactical RPG with hex-grid combat, dynamic encounters, and strategic gameplay. Play now and master the realms.",
  keywords: "tactical RPG, hex combat, strategy game, free-to-play RPG, turn-based combat",
  applicationName: "Aetheria",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  alternates: {
    canonical: "/",
    // NOTE — only advertise hreflang for locales that actually resolve. The
    // previous "vi-VN": "/vi" entry pointed at a route that does not exist
    // yet (no app/vi/* folder), which surfaces as a "Broken hreflang" error
    // in Google Search Console and slightly weights the canonical signal
    // against us. Restore the vi-VN entry once the /vi locale ships.
    languages: {
      "en-US": "/",
    },
  },
  openGraph: {
    type:        "website",
    siteName:    "Aetheria",
    title:       "Aetheria — Tactical Hex-Based Combat RPG",
    description:
      "Aetheria is a free-to-play tactical RPG with hex-grid combat, dynamic encounters, and strategic gameplay.",
    url:         SITE_URL,
    locale:      "en_US",
    images: [
      {
        url:    `${SITE_URL}/og-image.jpg`,
        width:  1200,
        height: 630,
        alt:    "Aetheria Combat Scene",
        type:   "image/jpeg",
      },
    ],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Aetheria — Tactical Hex-Based Combat RPG",
    description: "Free-to-play tactical RPG with hex-grid combat. Master the realms.",
    images:      ["/og-image.jpg"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export const viewport: Viewport = {
  themeColor:    "#7c5cff",
  width:         "device-width",
  initialScale:  1,
  viewportFit:   "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "Aetheria",
  description: "Online turn-based strategy, exploration, and live PvP arenas in the realms of Aether.",
  url: SITE_URL,
  applicationCategory: "Game",
  operatingSystem: "Web",
  gamePlatform: "Web Browser",
  genre: ["Strategy", "RPG", "Multiplayer Online"],
  inLanguage: ["en", "vi"],
};

const RootLayout = ({ children }: { children: React.ReactNode }): JSX.Element => {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <Script
          id="jsonld-game"
          type="application/ld+json"
          // Security: JSON.stringify() output is trusted (no user input).
          // Script tag content-type prevents interpretation as HTML/JS.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>{children}</Providers>
        <SwRegister />
      </body>
    </html>
  );
};

export default RootLayout;
