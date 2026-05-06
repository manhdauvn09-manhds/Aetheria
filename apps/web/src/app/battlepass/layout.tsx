import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Battle Pass",
  description: "Unlock exclusive rewards every season with the Aetheria Battle Pass.",
};

export default function BattlepassLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
