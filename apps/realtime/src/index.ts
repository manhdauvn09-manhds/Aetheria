// Aetheria — realtime entry point.

import { loadEnv } from "./env.js";
import { buildRealtime } from "./server.js";

const main = async (): Promise<void> => {
  const env = loadEnv();
  const rt = buildRealtime(env);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    rt.log.info({ signal }, "shutting down realtime");
    try {
      await rt.close();
      process.exit(0);
    } catch (e) {
      rt.log.error({ err: e }, "shutdown error");
      process.exit(1);
    }
  };

  process.on("SIGINT", (s) => void shutdown(s));
  process.on("SIGTERM", (s) => void shutdown(s));

  await new Promise<void>((resolve) => {
    rt.http.listen(env.REALTIME_PORT, env.REALTIME_HOST, () => {
      rt.log.info(
        { host: env.REALTIME_HOST, port: env.REALTIME_PORT },
        "realtime listening",
      );
      resolve();
    });
  });
};

main().catch((err: unknown) => {
  console.error("fatal: realtime failed to start", err);
  process.exit(1);
});
