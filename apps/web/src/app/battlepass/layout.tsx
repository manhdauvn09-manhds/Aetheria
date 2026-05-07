import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Battle Pass",
  description: "Unlock exclusive rewards every season with the Aetheria Battle Pass.",
  alternates: { canonical: "/battlepass" },
};

export default function BattlepassLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
