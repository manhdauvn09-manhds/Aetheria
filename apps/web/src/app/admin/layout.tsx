import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description: "Aetheria administration panel.",
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
