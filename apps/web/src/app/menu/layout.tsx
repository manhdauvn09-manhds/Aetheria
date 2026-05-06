import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Menu",
  description: "Your hero hub. Select a realm, check your roster, and enter the fray.",
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
