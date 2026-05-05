// Aetheria — sticky-session helpers.
//
// Pure (no I/O). Picks a deterministic backend shard for a given user
// id so all sockets from the same player land on the same realtime
// instance even without a sticky-session-aware load balancer.
//
// The strategy is intentionally trivial: FNV-1a 32-bit hash → modulo
// instance count. The LB can then key on the same hash (e.g. via a
// consistent-hash on `userId` from the access token's `sub`).

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit hash over a UTF-8 string. Pure. */
export const fnv1a32 = (input: string): number => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul keeps multiplication 32-bit-safe.
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
};

/**
 * Resolve a `userId` to a shard index in `[0, instances)`.
 * Returns 0 when `instances <= 1` so single-process deploys are a no-op.
 */
export const shardForUser = (userId: bigint | string, instances: number): number => {
  if (instances <= 1) return 0;
  return fnv1a32(typeof userId === "string" ? userId : userId.toString()) % instances;
};

/**
 * Cookie name expected by sticky-session-aware load balancers (Nginx
 * `sticky cookie`, Traefik `loadBalancer.sticky`, …). The LB writes the
 * shard index here; this app surfaces the same value at /sticky-cookie?u=…
 * for clients that need to seed it before opening the WebSocket.
 */
export const STICKY_COOKIE_NAME = "aetheria_rt_shard";
