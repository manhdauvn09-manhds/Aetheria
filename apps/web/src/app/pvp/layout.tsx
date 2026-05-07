import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PvP Arena",
  description: "Challenge opponents in 1v1 or 3v3 live PvP arenas.",
  alternates: { canonical: "/pvp" },
};

export default function PvpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
