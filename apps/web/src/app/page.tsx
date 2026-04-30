// Aetheria — landing page. A Server Component that pings the API to
// show the wiring is alive end-to-end. Falls back to a friendly error
// box if the API isn't running so `pnpm dev --filter @aetheria/web`
// alone still renders.

import { SessionBar } from "@/components/auth/SessionBar";
import { serverTrpc } from "@/lib/trpc/server";

// Hit the API on every request — without this Next would prerender at
// build time and bake in whatever the API happened to say (often: down).
export const dynamic = "force-dynamic";

interface ApiStatus {
  readonly ok: boolean;
  readonly serverTime?: string;
  readonly error?: string;
}

const fetchApiStatus = async (): Promise<ApiStatus> => {
  try {
    const res = await serverTrpc.health.ping.query();
    return { ok: res.ok, serverTime: res.serverTime };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
};

const LandingPage = async (): Promise<JSX.Element> => {
  const status = await fetchApiStatus();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-4xl tracking-tight text-realm-aetheric">
            Aetheria
          </h1>
          <p className="text-sm text-zinc-400">
            Online strategy, exploration, and combat. (Pre-alpha shell.)
          </p>
        </div>
        <SessionBar />
      </header>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-300">
          API health
        </h2>
        {status.ok ? (
          <p className="text-sm text-emerald-400">
            <span className="font-mono">/trpc/health.ping</span> ok ·{" "}
            <span className="font-mono">{status.serverTime}</span>
          </p>
        ) : (
          <p className="text-sm text-rose-400">
            unreachable: <span className="font-mono">{status.error ?? "n/a"}</span>
          </p>
        )}
      </section>

      <section className="text-xs text-zinc-500">
        Step 4.13 — auth UI live. World, save, and combat slices land in 4.15+.
      </section>
    </main>
  );
};

export default LandingPage;
