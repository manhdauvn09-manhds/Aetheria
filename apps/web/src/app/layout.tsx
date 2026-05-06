import type { Metadata } from "next";

import "./globals.css";
import { SwRegister } from "@/components/pwa/SwRegister";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Aetheria",
  description: "Aetheria — online strategy, exploration, and combat.",
  manifest: "/manifest.webmanifest",
  themeColor: "#7c5cff",
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
