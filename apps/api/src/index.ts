// Aetheria — API entry point.

import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

const main = async (): Promise<void> => {
  const env = loadEnv();
  const app = await buildServer(env);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (e) {
      app.log.error({ err: e }, "shutdown error");
      process.exit(1);
    }
  };

  process.on("SIGINT", (s) => void shutdown(s));
  process.on("SIGTERM", (s) => void shutdown(s));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info({ host: env.API_HOST, port: env.API_PORT }, "api listening");
};

main().catch((err: unknown) => {
  console.error("fatal: api failed to start", err);
  process.exit(1);
});
