import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Friends",
  description: "Manage your friends list, pending requests, and blocked players.",
  alternates: { canonical: "/friends" },
};

export default function FriendsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
