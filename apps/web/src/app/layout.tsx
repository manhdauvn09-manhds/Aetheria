import type { Metadata, Viewport } from "next";

import "./globals.css";
import { SwRegister } from "@/components/pwa/SwRegister";
import { Providers } from "./providers";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetheria.gg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  "Aetheria — Reclaim the Aether",
    template: "%s · Aetheria",
  },
  description: "Online turn-based strategy, exploration, and live PvP arenas in the realms of Aether.",
  applicationName: "Aetheria",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      vi: "/",
    },
  },
  openGraph: {
    type:        "website",
    siteName:    "Aetheria",
    title:       "Aetheria — Reclaim the Aether",
    description: "Online turn-based strategy + live PvP. Master the broken sky.",
    url:         SITE_URL,
    locale:      "en_US",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Aetheria — Reclaim the Aether",
    description: "Online turn-based strategy + live PvP. Master the broken sky.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor:    "#7c5cff",
  width:         "device-width",
  initialScale:  1,
  viewportFit:   "cover",
};

const RootLayout = ({ children }: { children: React.ReactNode }): JSX.Element => {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <Providers>{children}</Providers>
        <SwRegister />
      </body>
    </html>
  );
};

export default RootLayout;
