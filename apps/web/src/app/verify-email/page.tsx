"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  AuthShell,
  FormError,
  FormSuccess,
} from "@/components/auth/AuthShell";
import { AuthApiError, postJSON } from "@/lib/auth/client";

type Status = "pending" | "ok" | "error";

const VerifyEmailInner = (): JSX.Element => {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Verification link is missing the token.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await postJSON<{ ok: true }>("/api/auth/verify-email", { token });
        if (!cancelled) setStatus("ok");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof AuthApiError ? e.body.message : "Verification failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "pending") {
    return <p className="text-sm text-zinc-400">Verifying your email…</p>;
  }
  if (status === "ok") {
    return <FormSuccess message="Email verified. You can close this tab and return to the game." />;
  }
  return <FormError message={error ?? "Verification failed"} />;
};

const VerifyEmailPage = (): JSX.Element => (
  <AuthShell
    title="Verify your email"
    footer={
      <Link href="/" className="text-realm-aetheric hover:underline">
        Back to Aetheria
      </Link>
    }
  >
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <VerifyEmailInner />
    </Suspense>
  </AuthShell>
);

export default VerifyEmailPage;
