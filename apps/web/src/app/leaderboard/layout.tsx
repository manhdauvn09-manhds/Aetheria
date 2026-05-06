import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top players ranked by arena victories. Climb the global leaderboard.",
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
