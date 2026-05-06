// Aetheria — pure statistics helpers used by anti-cheat scanning.

export const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** True iff `score` exceeds `factor × median`, with a non-zero median. */
export const isOutlier = (score: number, levelMedian: number, factor: number): boolean =>
  levelMedian > 0 && score > levelMedian * factor;
