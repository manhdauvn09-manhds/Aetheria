"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AuthShell,
  Field,
  FormError,
  Submit,
} from "@/components/auth/AuthShell";
import { bootstrapLocalQuiet } from "@/lib/auth/bootstrap";
import { AuthApiError, postJSON } from "@/lib/auth/client";
import type { SessionResponseBody } from "@/lib/auth/proxy";
import { useSession } from "@/store/session";

const SignupPage = (): JSX.Element => {
  const router = useRouter();
  const setSession = useSession((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await postJSON<SessionResponseBody>("/api/auth/signup", {
        email,
        displayName,
        password,
      });
      setSession(res.user, res.access);
      await bootstrapLocalQuiet(res.access.value);
      router.push("/menu");
    } catch (e) {
      setError(e instanceof AuthApiError ? e.body.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Pick a display name — it's how other heroes will know you."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-realm-aetheric hover:underline">
            Sign in
          </Link>
        </>
      }
    >
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
        <Field
          id="displayName"
          label="Display name"
          autoComplete="username"
          required
          minLength={2}
          maxLength={32}
          value={displayName}
          onChange={setDisplayName}
        />
        <Field
          id="password"
          label="Password"
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
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={confirm}
          onChange={setConfirm}
        />
        {error ? <FormError message={error} /> : null}
        <Submit busy={busy}>Create account</Submit>
      </form>
    </AuthShell>
  );
};

export default SignupPage;
