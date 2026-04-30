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

const LoginPage = (): JSX.Element => {
  const router = useRouter();
  const setSession = useSession((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await postJSON<SessionResponseBody>("/api/auth/login", {
        email,
        password,
      });
      setSession(res.user, res.access);
      await bootstrapLocalQuiet(res.access.value);
      router.push("/menu");
    } catch (e) {
      setError(e instanceof AuthApiError ? e.body.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      footer={
        <div className="space-y-1">
          <div>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-realm-aetheric hover:underline">
              Sign up
            </Link>
          </div>
          <div>
            <Link href="/forgot-password" className="text-zinc-400 hover:text-zinc-200">
              Forgot your password?
            </Link>
          </div>
        </div>
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
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={setPassword}
        />
        {error ? <FormError message={error} /> : null}
        <Submit busy={busy}>Sign in</Submit>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
