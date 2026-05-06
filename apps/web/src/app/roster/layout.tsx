import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roster",
  description: "Your character collection. Manage skills and equip your heroes.",
};

export default function RosterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
