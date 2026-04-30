// Aetheria — deterministic seeded RNG.
//
// We use mulberry32 — a tiny 32-bit PRNG with good statistical
// properties for game purposes (not crypto). API is pure-functional:
// every consumer of randomness threads the `RngState` through, so two
// independent simulations starting from the same seed produce identical
// event streams. Combat replay + server-authoritative validation rely
// on this.
//
// Reference:
//   https://gist.github.com/tommyettinger/46a3a48dd5ee62e0c11abeb1a4d3b40b
//   https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32

/** Opaque PRNG state. Treat as a value — never mutate in place. */
export interface RngState {
  readonly seed: number;
}

const u32 = (n: number): number => n >>> 0;

/**
 * Build an initial state from an arbitrary 32-bit-fittable seed.
 *
 * Negative numbers and floats are coerced to a `Uint32`. A seed of `0`
 * is permitted but not recommended — it produces an early stream of
 * small values; bias the input or hash a string into 32 bits first.
 */
export const makeRng = (seed: number): RngState => ({ seed: u32(seed) });

/**
 * Hash a UTF-8 string into a 32-bit seed. Useful for deriving a stable
 * RNG from human-readable identifiers (e.g. `${runId}:${turn}`).
 * FNV-1a — same hash family used by `core/feature-flag.ts`.
 */
export const seedFromString = (s: string): number => {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = u32(h * 0x01000193); // FNV prime; >>>0 keeps it 32-bit
  }
  return u32(h);
};

/**
 * Step the RNG forward once. Returns the next state and a value in
 * `[0, 1)` (52-bit fraction sampled from the new state).
 */
export const next = (state: RngState): { state: RngState; value: number } => {
  const s = u32(state.seed + 0x6d2b79f5);
  let t = s;
  t = u32(Math.imul(t ^ (t >>> 15), t | 1));
  t ^= u32(t + Math.imul(t ^ (t >>> 7), t | 61));
  const out = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  return { state: { seed: s }, value: out };
};

/** Return an integer in `[lo, hi]` (both inclusive). */
export const nextInt = (
  state: RngState,
  lo: number,
  hi: number,
): { state: RngState; value: number } => {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) {
    throw new Error(`nextInt: invalid range [${String(lo)}, ${String(hi)}]`);
  }
  const { state: s, value } = next(state);
  const span = hi - lo + 1;
  return { state: s, value: lo + Math.floor(value * span) };
};

/** Pick one element of a non-empty array; throws on empty. */
export const pick = <T>(
  state: RngState,
  items: readonly T[],
): { state: RngState; value: T } => {
  if (items.length === 0) throw new Error("pick: empty array");
  const { state: s, value: idx } = nextInt(state, 0, items.length - 1);
  // Safe: idx ∈ [0, items.length-1].
  return { state: s, value: items[idx] as T };
};

/**
 * Roll a fair `s`-sided die `n` times, returning the sum. Used for
 * variance-bounded damage rolls.
 */
export const rollDice = (
  state: RngState,
  n: number,
  sides: number,
): { state: RngState; value: number } => {
  if (n < 0 || sides < 1) throw new Error(`rollDice: invalid (${String(n)}d${String(sides)})`);
  let s = state;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = nextInt(s, 1, sides);
    s = r.state;
    total += r.value;
  }
  return { state: s, value: total };
};

/**
 * Return `true` with probability `p ∈ [0, 1]`. Useful for status-
 * application chance, crit rolls, etc.
 */
export const chance = (
  state: RngState,
  p: number,
): { state: RngState; value: boolean } => {
  if (p <= 0) return { state, value: false };
  if (p >= 1) {
    // No randomness consumed — keep the state as-is to avoid burning
    // entropy on guaranteed outcomes.
    return { state, value: true };
  }
  const { state: s, value } = next(state);
  return { state: s, value: value < p };
};
