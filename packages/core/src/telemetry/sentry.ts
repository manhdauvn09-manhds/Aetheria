// Aetheria — Sentry error-reporting scaffold.
//
// Same pattern as `tracing.ts`: no runtime dep, env-gated boot. When
// `SENTRY_DSN` is set, ops swaps in the real `@sentry/node` /
// `@sentry/nextjs` integrations without touching call sites.

export interface SentryHandle {
  readonly enabled: boolean;
  readonly captureException: (err: unknown) => void;
  readonly flush: (timeoutMs?: number) => Promise<boolean>;
}

export interface SentryOptions {
  readonly dsn?: string | undefined;
  readonly environment?: string | undefined;
}

export const startSentry = (opts: SentryOptions): SentryHandle => {
  const enabled = Boolean(opts.dsn);
  return {
    enabled,
    captureException: (err): void => {
      if (!enabled) return;
      // eslint-disable-next-line no-console
      console.error("[sentry]", err);
    },
    flush: () => Promise.resolve(true),
  };
};
