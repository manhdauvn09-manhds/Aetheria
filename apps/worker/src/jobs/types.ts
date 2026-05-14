// Aetheria — worker job contract.

import type { Logger } from "pino";
import type { Redis } from "ioredis";

import type { MysqlClient } from "@aetheria/schema-db/mysql";

export interface JobContext {
  readonly mysql: MysqlClient;
  readonly redis: Redis | null;
  readonly log: Logger;
  readonly now: Date;
}

export interface JobDefinition {
  readonly name: string;
  /** Tick interval in ms. Subsequent ticks may overlap if `run` is slow — the lock prevents true parallelism. */
  readonly intervalMs: number;
  /** Lock TTL in ms — should comfortably exceed the longest expected `run` duration. */
  readonly lockTtlMs: number;
  /**
   * Optional offset from worker boot before the first tick fires. Useful
   * to spread heavy jobs across the minute. Defaults to a quarter of
   * `intervalMs` capped at 30 s.
   */
  readonly initialDelayMs?: number;
  /**
   * Optional timeout in ms for a single job execution. If the job takes
   * longer, it's aborted and logged as an error. Defaults to no timeout.
   * Should be less than `lockTtlMs - 100` to allow cleanup time.
   */
  readonly timeoutMs?: number;
  readonly run: (ctx: JobContext) => Promise<void>;
}
