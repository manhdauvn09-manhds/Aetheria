/**
 * Aetheria — E2E smoke driver.
 *
 * Boots the Fastify server in-process and walks the critical path without
 * binding a port: health → /trpc dispatch reachability. The full
 * signup → tutorial → first level → autosave → resume → claim daily quest
 * trace requires a populated DB + redis; this script ships the harness so
 * CI can layer the data fixtures on top.
 *
 * Run:  pnpm e2e:smoke
 */

import { buildServer } from "../apps/api/src/server.js";
import { loadEnv } from "../apps/api/src/env.js";

interface Step {
  readonly name: string;
  readonly run: () => Promise<void>;
}

const main = async (): Promise<void> => {
  const env = loadEnv();
  const app = await buildServer(env);

  const steps: readonly Step[] = [
    {
      name: "GET /health",
      run: async () => {
        const r = await app.inject({ method: "GET", url: "/health" });
        if (r.statusCode !== 200) throw new Error(`health failed: ${r.statusCode.toString()}`);
        const body = JSON.parse(r.payload) as { ok?: unknown };
        if (body.ok !== true) throw new Error("health body unexpected");
      },
    },
    {
      name: "tRPC reachable: health.ping",
      run: async () => {
        const r = await app.inject({
          method: "GET",
          url: "/trpc/health.ping",
        });
        if (r.statusCode !== 200) {
          throw new Error(`trpc dispatch failed: ${r.statusCode.toString()} ${r.payload}`);
        }
      },
    },
  ];

  let failed = 0;
  for (const s of steps) {
    const start = Date.now();
    try {
      await s.run();
      console.log(`ok  ${s.name}  (${(Date.now() - start).toString()}ms)`);
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${s.name}`, e);
    }
  }

  await app.close();
  if (failed > 0) {
    console.error(`smoke: ${failed.toString()} step(s) failed`);
    process.exit(1);
  }
  console.log("smoke: all green");
};

main().catch((err: unknown) => {
  console.error("smoke crashed", err);
  process.exit(1);
});
