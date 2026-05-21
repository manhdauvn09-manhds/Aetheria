import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team Builder",
  description: "Choose your party of up to 3 heroes for the next battle.",
  alternates: { canonical: "/team" },
};

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
