// Aetheria — secret-strength helpers.
//
// Used by env loaders to reject low-entropy JWT secrets ("aaaa…" 32 chars
// passes a min-length check but offers ~0 bits of attack surface).

/** Shannon entropy in bits per character. Empty string returns 0. */
export const shannonEntropy = (s: string): number => {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
};

export const MIN_SECRET_ENTROPY_BITS_PER_CHAR = 3.0;

/**
 * True iff the string has at least the given Shannon entropy. Default
 * threshold (3.0 bit/char) accepts random base64/hex output but rejects
 * trivial repeats like `"a".repeat(32)` (entropy 0).
 */
export const hasSufficientEntropy = (
  s: string,
  minBitsPerChar = MIN_SECRET_ENTROPY_BITS_PER_CHAR,
): boolean => shannonEntropy(s) >= minBitsPerChar;
