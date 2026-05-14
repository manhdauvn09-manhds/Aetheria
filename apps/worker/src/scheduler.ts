// Aetheria — job scheduler.
//
// Pure-ish — owns timer state but delegates actual work to `runLocked`.
// Each registered job spins on a private `setInterval`; the lock is the
// single-fire guarantee across the fleet. `start()` returns an
// unsubscribe that clears every timer.

import type { Logger } from "pino";

import { runLocked, type LockRedisClient } from "./lock.js";
import type { JobContext, JobDefinition } from "./jobs/types.js";

export interface SchedulerDeps {
  readonly log: Logger;
  readonly redis: LockRedisClient | null;
  readonly buildContext: (now: Date) => JobContext;
  readonly allowlist?: readonly string[];
  /** Set true in tests to skip the auto-start delay. */
  readonly immediate?: boolean;
}

export interface RunningScheduler {
  readonly stop: () => void;
  readonly tick: (job: JobDefinition) => Promise<void>;
}

export const computeInitialDelay = (job: JobDefinition): number => {
  if (job.initialDelayMs !== undefined) return Math.max(0, job.initialDelayMs);
  return Math.min(30_000, Math.max(0, Math.floor(job.intervalMs / 4)));
};

const isAllowed = (job: JobDefinition, allowlist?: readonly string[]): boolean => {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.includes(job.name);
};

export const buildScheduler = (
  jobs: readonly JobDefinition[],
  deps: SchedulerDeps,
): RunningScheduler => {
  const timers: NodeJS.Timeout[] = [];

  const tick = async (job: JobDefinition): Promise<void> => {
    const start = Date.now();
    const ctx = deps.buildContext(new Date());

    const runWithTimeout = async (): Promise<void> => {
      if (!job.timeoutMs) {
        await job.run(ctx);
        return;
      }
      // Wrap with a timeout: if job exceeds timeoutMs, reject.
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          reject(new Error(`Job timeout after ${job.timeoutMs}ms`));
        }, job.timeoutMs);
        t.unref();
      });
      await Promise.race([job.run(ctx), timeoutPromise]);
    };

    if (!deps.redis) {
      // No-Redis fallback: run unconditionally. Production should always
      // have Redis so the lock is the canonical guard.
      try {
        await runWithTimeout();
      } catch (e) {
        deps.log.error({ err: e, job: job.name }, "job failed (unlocked)");
      }
      return;
    }
    const r = await runLocked(deps.redis, job.name, job.lockTtlMs, runWithTimeout);
    if (r.ran) {
      deps.log.debug(
        { job: job.name, ms: Date.now() - start },
        "job ran",
      );
    } else {
      deps.log.debug({ job: job.name }, "job skipped (lock held)");
    }
  };

  const startOne = (job: JobDefinition): void => {
    const start = (): void => {
      const interval = setInterval(() => {
        void tick(job).catch((e: unknown) => {
          deps.log.error({ err: e, job: job.name }, "job tick crashed");
        });
      }, job.intervalMs);
      interval.unref();
      timers.push(interval);
    };
    if (deps.immediate) {
      start();
      return;
    }
    const t = setTimeout(start, computeInitialDelay(job));
    t.unref();
    timers.push(t);
  };

  for (const job of jobs) {
    if (!isAllowed(job, deps.allowlist)) {
      deps.log.info({ job: job.name }, "job skipped — not in allowlist");
      continue;
    }
    deps.log.info(
      { job: job.name, intervalMs: job.intervalMs, lockTtlMs: job.lockTtlMs },
      "registered",
    );
    startOne(job);
  }

  return {
    stop: (): void => {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    },
    tick,
  };
};
