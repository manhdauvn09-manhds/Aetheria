"use client";

// Aetheria — client-side auth gate. Wraps protected pages so they can
// render unconditionally and let the gate handle "still loading session"
// + "no session, redirect to /login" cases.

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useHydratedSession } from "@/lib/auth/useHydratedSession";

export const RequireAuth = ({ children }: { children: ReactNode }): JSX.Element => {
  const status = useHydratedSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 py-16">
        <p className="text-sm text-zinc-400">Checking your session…</p>
      </main>
    );
  }
  if (status === "unauthenticated") {
    // The redirect effect runs next render; show nothing in the gap.
    return <main className="min-h-screen" />;
  }
  return <>{children}</>;
};
