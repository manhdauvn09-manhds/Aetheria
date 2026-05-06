// Aetheria — worker entry point.

import { Redis } from "ioredis";
import pino, { type Logger } from "pino";

import { mysql, disconnectMysql } from "@aetheria/schema-db/mysql";

import { loadEnv, type Env } from "./env.js";
import { antiCheatScanJob } from "./jobs/antiCheatScan.js";
import { dailyResetJob } from "./jobs/dailyReset.js";
import { guildRaidSchedulerJob } from "./jobs/guildRaidScheduler.js";
import { leaderboardSnapshotJob } from "./jobs/leaderboardSnapshot.js";
import { pingJob } from "./jobs/ping.js";
import { seasonResetJob } from "./jobs/seasonReset.js";
import type { JobContext, JobDefinition } from "./jobs/types.js";
import { weeklyResetJob } from "./jobs/weeklyReset.js";
import { buildScheduler } from "./scheduler.js";

const buildLogger = (env: Env): Logger =>
  pino(
    env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty" }, level: "debug" }
      : { level: "info" },
  );

const ALL_JOBS: readonly JobDefinition[] = [
  pingJob,
  dailyResetJob,
  weeklyResetJob,
  seasonResetJob,
  antiCheatScanJob,
  leaderboardSnapshotJob,
  guildRaidSchedulerJob,
];

const main = async (): Promise<void> => {
  const env = loadEnv();
  const log = buildLogger(env);
  const redis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;

  const buildContext = (now: Date): JobContext => ({
    mysql,
    redis,
    log,
    now,
  });

  const scheduler = buildScheduler(ALL_JOBS, {
    log,
    redis,
    buildContext,
    allowlist: env.WORKER_JOBS.length > 0 ? env.WORKER_JOBS : [],
  });

  log.info(
    { jobs: ALL_JOBS.map((j) => j.name), allowlist: env.WORKER_JOBS },
    "worker started",
  );

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    log.info({ signal }, "shutting down worker");
    scheduler.stop();
    if (redis) await redis.quit();
    await disconnectMysql();
    process.exit(0);
  };

  process.on("SIGINT", (s) => void shutdown(s));
  process.on("SIGTERM", (s) => void shutdown(s));

  // Block forever — timers keep the loop alive (they're `unref`'d but
  // we hold the redis + db handles).
  await new Promise<void>(() => undefined);
};

main().catch((err: unknown) => {
  console.error("fatal: worker failed to start", err);
  process.exit(1);
});
