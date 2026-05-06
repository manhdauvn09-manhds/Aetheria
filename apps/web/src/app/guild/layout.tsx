import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guild",
  description: "Create or join a guild. Conquer the Aether together.",
};

export default function GuildLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
