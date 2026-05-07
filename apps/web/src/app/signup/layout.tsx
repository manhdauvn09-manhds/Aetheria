import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Join Aetheria — forge your legend in the realms of Aether.",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
