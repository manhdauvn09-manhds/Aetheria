"use client";

import Link from "next/link";
import { useState } from "react";

import {
  AuthShell,
  Field,
  FormError,
  FormSuccess,
  Submit,
} from "@/components/auth/AuthShell";
import { AuthApiError, postJSON } from "@/lib/auth/client";

const ForgotPasswordPage = (): JSX.Element => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await postJSON<{ ok: true }>("/api/auth/forgot-password", { email });
      setDone(true);
    } catch (e) {
      setError(e instanceof AuthApiError ? e.body.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link if the account exists."
      footer={
        <Link href="/login" className="text-realm-aetheric hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <FormSuccess message="If that email is registered, a reset link is on its way. Check your inbox (and spam)." />
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={setEmail}
          />
          {error ? <FormError message={error} /> : null}
          <Submit busy={busy}>Send reset link</Submit>
        </form>
      )}
    </AuthShell>
  );
};

export default ForgotPasswordPage;
