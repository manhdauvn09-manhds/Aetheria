// Aetheria — minimal layout shell for auth pages.
//
// Centers a card with the page title + body. Used by /login, /signup,
// /forgot-password, /reset-password, /verify-email so each page only
// owns its form.

import Link from "next/link";
import type { ReactNode } from "react";

interface AuthShellProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export const AuthShell = ({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps): JSX.Element => (
  <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
    <header className="space-y-1 text-center">
      <Link href="/" className="font-display text-2xl text-realm-aetheric">
        Aetheria
      </Link>
      <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
      {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
    </header>
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-6">
      {children}
    </section>
    {footer ? <footer className="text-center text-xs text-zinc-500">{footer}</footer> : null}
  </main>
);

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly type?: string;
  readonly autoComplete?: string;
  readonly required?: boolean;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly placeholder?: string;
}

export const Field = ({
  id,
  label,
  type = "text",
  autoComplete,
  required,
  value,
  onChange,
  minLength,
  maxLength,
  placeholder,
}: FieldProps): JSX.Element => (
  <label htmlFor={id} className="block space-y-1 text-sm">
    <span className="font-medium text-zinc-300">{label}</span>
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      autoComplete={autoComplete ?? undefined}
      required={required ?? undefined}
      minLength={minLength ?? undefined}
      maxLength={maxLength ?? undefined}
      placeholder={placeholder ?? undefined}
      className="block w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-realm-aetheric focus:outline-none focus:ring-1 focus:ring-realm-aetheric"
    />
  </label>
);

interface SubmitProps {
  readonly busy?: boolean;
  readonly children: ReactNode;
}

export const Submit = ({ busy, children }: SubmitProps): JSX.Element => (
  <button
    type="submit"
    disabled={busy ?? false}
    className="inline-flex w-full items-center justify-center rounded-md bg-realm-aetheric px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
  >
    {busy ? "Working…" : children}
  </button>
);

export const FormError = ({ message }: { message: string }): JSX.Element => (
  <p
    role="alert"
    className="rounded-md border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-300"
  >
    {message}
  </p>
);

export const FormSuccess = ({ message }: { message: string }): JSX.Element => (
  <p
    role="status"
    className="rounded-md border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300"
  >
    {message}
  </p>
);
