import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play",
  description: "Choose a level and battle through the Aetherian realms.",
  alternates: { canonical: "/play" },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
