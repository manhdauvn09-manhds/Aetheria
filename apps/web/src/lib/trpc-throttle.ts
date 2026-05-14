/**
 * Aetheria — TRPC Rate Limiting Utility
 *
 * Prevents client-side spam on non-critical queries.
 * Use for: inventory.list, leaderboard, catalog reads
 * DO NOT use for: combat moves, PvP queue (gameplay-critical)
 */

export const createThrottle = (delayMs: number) => {
  let lastCall = 0;

  return <T,>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall < delayMs) {
      // Return pending promise (caller will wait)
      return new Promise((resolve) => {
        setTimeout(() => {
          lastCall = Date.now();
          fn().then(resolve);
        }, delayMs - timeSinceLastCall);
      });
    }

    lastCall = now;
    return fn();
  };
};

export const createDebounce = (delayMs: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return <T,>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delayMs);
    });
  };
};

/**
 * Safe throttles for non-critical TRPC calls (400ms min interval)
 *
 * Usage example (in a component):
 *   const throttle = createThrottle(THROTTLE_NON_CRITICAL);
 *   const handleRefresh = async () => {
 *     const data = await throttle(() => trpc.inventory.list.query(...));
 *     setInventory(data);
 *   };
 */
export const THROTTLE_NON_CRITICAL = 400;

/**
 * Safe debounce for search/filter (600ms, groups rapid changes)
 *
 * Usage example (in a component with search input):
 *   const debounce = createDebounce(DEBOUNCE_SEARCH);
 *   const handleSearchChange = async (query: string) => {
 *     const results = await debounce(() => trpc.shop.search.query({ q: query }));
 *     setResults(results);
 *   };
 */
export const DEBOUNCE_SEARCH = 600;
