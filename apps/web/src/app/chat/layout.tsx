import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
  description: "Global, guild, and whisper channels. Connect with the Aetheria community.",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
