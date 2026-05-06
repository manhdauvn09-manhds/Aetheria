// Aetheria — OpenTelemetry tracing scaffold.
//
// Intentionally dep-free: actual `@opentelemetry/sdk-node` wiring is a
// follow-up so we don't bloat the install for environments that don't
// export traces. This module ships the boot helper signature + a no-op
// implementation; production swaps the impl behind `OTEL_EXPORTER_OTLP_ENDPOINT`.

export interface TracingHandle {
  readonly serviceName: string;
  readonly enabled: boolean;
  readonly shutdown: () => Promise<void>;
}

export interface TracingOptions {
  readonly serviceName: string;
  readonly endpoint?: string | undefined;
}

/**
 * No-op tracer for the MVP. Returns a `shutdown` that resolves
 * immediately. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, ops swaps in
 * the real exporter without touching call sites.
 */
export const startTracing = (opts: TracingOptions): TracingHandle => ({
  serviceName: opts.serviceName,
  enabled: Boolean(opts.endpoint),
  shutdown: () => Promise.resolve(),
});
