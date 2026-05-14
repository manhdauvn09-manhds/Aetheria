/**
 * Aetheria — Query Duration Logging Utility
 *
 * Logs slow database queries (>100ms) to help identify performance bottlenecks.
 * Use in service methods that perform I/O.
 *
 * Example:
 *   const result = await logQuery("inventory.list", () =>
 *     mysql.inventory.findMany({ where: { userId } })
 *   );
 */

const SLOW_QUERY_THRESHOLD_MS = 100;

export const logQuery = async <T,>(
  operationName: string,
  fn: () => Promise<T>,
  thresholdMs: number = SLOW_QUERY_THRESHOLD_MS,
): Promise<T> => {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = performance.now() - start;
    if (durationMs > thresholdMs && typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
      console.warn(`[slow-query] ${operationName} took ${Math.round(durationMs)}ms`, {
        operation: operationName,
        durationMs: Math.round(durationMs),
      });
    }
    return result;
  } catch (err) {
    const durationMs = performance.now() - start;
    console.error(`[query-error] ${operationName} failed after ${Math.round(durationMs)}ms`, {
      operation: operationName,
      durationMs: Math.round(durationMs),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

/**
 * Sync version for operations that don't use async.
 * Returns the duration in milliseconds.
 */
export const logQuerySync = <T,>(operationName: string, fn: () => T): T => {
  const start = performance.now();
  try {
    const result = fn();
    const durationMs = performance.now() - start;
    if (durationMs > SLOW_QUERY_THRESHOLD_MS && typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
      console.warn(`[slow-query] ${operationName} took ${Math.round(durationMs)}ms`, {
        operation: operationName,
        durationMs: Math.round(durationMs),
      });
    }
    return result;
  } catch (err) {
    const durationMs = performance.now() - start;
    console.error(`[query-error] ${operationName} failed after ${Math.round(durationMs)}ms`, {
      operation: operationName,
      durationMs: Math.round(durationMs),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};
