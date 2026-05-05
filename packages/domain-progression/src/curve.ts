// Aetheria — XP curve.
//
// Curve formula (per Step 4.29 spec):
//   xpForLevel(n) = floor(50 * n^1.85)
// where `xpForLevel(n)` is the XP needed to advance from level `n` to `n + 1`.
//
// Sanity checks (all integers):
//   xpForLevel(1)   = 50
//   xpForLevel(2)   = 180        (50 * 2^1.85 ≈ 180.4)
//   xpForLevel(10)  = 3548       (50 * 10^1.85)
//   xpForLevel(50)  = 65 011     (~)
//   xpForLevel(99)  = 232 906    (~)
// Cumulative XP to reach MAX_LEVEL is precomputed once at module load.

import type { Level, Xp } from "./types.js";

export const MIN_LEVEL: Level = 1;
export const MAX_LEVEL: Level = 100;

export const XP_BASE = 50;
export const XP_EXPONENT = 1.85;

/** True for finite, non-negative integers (including 0). */
const isNonNegInt = (n: number): boolean =>
  Number.isFinite(n) && Number.isInteger(n) && n >= 0;

const isLevelInRange = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_LEVEL && n <= MAX_LEVEL;

/**
 * XP required to advance from level `n` to level `n + 1`.
 * Defined for `n` in `[MIN_LEVEL, MAX_LEVEL - 1]`. At `MAX_LEVEL` returns
 * `Infinity` so any further XP is treated as overflow by the level-up loop.
 */
export const xpForLevel = (n: Level): Xp => {
  if (!isLevelInRange(n)) {
    throw new RangeError(
      `xpForLevel: level out of range (got ${String(n)}, expected ${String(MIN_LEVEL)}..${String(MAX_LEVEL)})`,
    );
  }
  if (n >= MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return Math.floor(XP_BASE * Math.pow(n, XP_EXPONENT));
};

// Precompute cumulative XP table — `_CUMULATIVE_XP[k]` = total XP needed
// to reach level `k + 1` from level 1 (k = 0 → 0 XP, k = MAX_LEVEL - 1 →
// XP to reach MAX_LEVEL). The table is frozen so callers can't mutate it.
const _CUMULATIVE_XP: readonly Xp[] = (() => {
  const out: Xp[] = [0];
  let acc = 0;
  for (let lvl = MIN_LEVEL; lvl < MAX_LEVEL; lvl += 1) {
    acc += Math.floor(XP_BASE * Math.pow(lvl, XP_EXPONENT));
    out.push(acc);
  }
  return Object.freeze(out);
})();

/**
 * Total XP required to *reach* level `n` from level 1.
 * `xpToReach(1) === 0`, `xpToReach(2) === xpForLevel(1)`, etc.
 */
export const xpToReach = (n: Level): Xp => {
  if (!isLevelInRange(n)) {
    throw new RangeError(
      `xpToReach: level out of range (got ${String(n)}, expected ${String(MIN_LEVEL)}..${String(MAX_LEVEL)})`,
    );
  }
  return _CUMULATIVE_XP[n - 1] ?? 0;
};

/**
 * Resolve a `(level, xpIntoLevel)` pair from a monotonic `totalXp` counter.
 * Used when reconstructing progression state from an audit-log replay or
 * when accepting a server-authoritative XP grant.
 */
export const levelFromTotalXp = (
  totalXp: Xp,
): { level: Level; xpIntoLevel: Xp } => {
  if (!isNonNegInt(totalXp)) {
    throw new RangeError(
      `levelFromTotalXp: totalXp must be a non-negative integer (got ${String(totalXp)})`,
    );
  }

  // Binary-search the cumulative table for the highest level whose
  // entry threshold is <= totalXp.
  let lo = 0;
  let hi = _CUMULATIVE_XP.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    const threshold = _CUMULATIVE_XP[mid] ?? Number.POSITIVE_INFINITY;
    if (threshold <= totalXp) lo = mid;
    else hi = mid - 1;
  }
  const level: Level = lo + 1;
  const banked = totalXp - (_CUMULATIVE_XP[lo] ?? 0);
  // At MAX_LEVEL, any banked XP is overflow — surface it as 0 here so the
  // returned shape is always valid for the public Progression type.
  const xpIntoLevel = level >= MAX_LEVEL ? 0 : banked;
  return { level, xpIntoLevel };
};
