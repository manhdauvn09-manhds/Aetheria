"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  AuthShell,
  Field,
  FormError,
  FormSuccess,
  Submit,
} from "@/components/auth/AuthShell";
import { AuthApiError, postJSON } from "@/lib/auth/client";

const ResetPasswordForm = (): JSX.Element => {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <FormError message="Reset link is missing the token. Open the link from your email." />
    );
  }
  if (done) {
    return (
      <FormSuccess message="Password updated. Sign in with the new one to continue." />
    );
  }

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await postJSON<{ ok: true }>("/api/auth/reset-password", {
        token,
        newPassword: password,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof AuthApiError ? e.body.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <Field
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        value={password}
        onChange={setPassword}
      />
      <Field
        id="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        value={confirm}
        onChange={setConfirm}
      />
      {error ? <FormError message={error} /> : null}
      <Submit busy={busy}>Set new password</Submit>
    </form>
  );
};

const ResetPasswordPage = (): JSX.Element => (
  <AuthShell
    title="Choose a new password"
    footer={
      <Link href="/login" className="text-realm-aetheric hover:underline">
        Back to sign in
      </Link>
    }
  >
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <ResetPasswordForm />
    </Suspense>
  </AuthShell>
);

export default ResetPasswordPage;
