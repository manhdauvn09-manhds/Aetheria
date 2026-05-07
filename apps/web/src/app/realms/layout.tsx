import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Realms",
  description: "Explore the realms of Aether. Choose your next adventure.",
  alternates: { canonical: "/realms" },
};

export default function RealmsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
