// Aetheria — profanity filter.
//
// Conservative, deterministic, and intentionally tiny: the canonical list
// is shipped in code so tests are reproducible. Production deployments
// should pass an extended list via `containsProfanity(text, customList)`.
//
// Matching is case-insensitive over a normalised form (NFKC + light
// leetspeak fold) and operates on whole words so common substrings inside
// benign tokens (e.g. "scunthorpe") do not false-match the small seed set.

const LEET_FOLD: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Default seed list. Service callers should extend, not replace. */
export const DEFAULT_PROFANITY: readonly string[] = [
  "badword",
  "shit",
  "fuck",
  "asshole",
  "bitch",
];

/**
 * Lower-case + NFKC-normalise + map common leet substitutions to their
 * letter form. The output preserves length 1:1 with the input so callers
 * can use match indices on the normalised form to locate spans in the
 * original.
 */
export const normalizeForMatch = (s: string): string => {
  const lower = s.normalize("NFKC").toLowerCase();
  let out = "";
  for (const ch of lower) {
    out += LEET_FOLD[ch] ?? ch;
  }
  return out;
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isWordChar = (c: string | undefined): boolean =>
  c !== undefined && /[a-z0-9]/.test(c);

const findMatches = (
  normalized: string,
  list: readonly string[],
): { start: number; end: number }[] => {
  const spans: { start: number; end: number }[] = [];
  for (const term of list) {
    if (term.length === 0) continue;
    const needle = normalizeForMatch(term);
    const re = new RegExp(escapeRe(needle), "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const start = m.index;
      const end = start + needle.length;
      const before = start > 0 ? normalized[start - 1] : undefined;
      const after = end < normalized.length ? normalized[end] : undefined;
      if (!isWordChar(before) && !isWordChar(after)) {
        spans.push({ start, end });
      }
    }
  }
  return spans;
};

/**
 * True iff `text` contains any of `list` as a whole word, comparing on the
 * normalised form so leet variants (e.g. `sh1t`) are caught.
 */
export const containsProfanity = (
  text: string,
  list: readonly string[] = DEFAULT_PROFANITY,
): boolean => findMatches(normalizeForMatch(text), list).length > 0;

/**
 * Replace each profanity hit with `*` of matching length. Operates on the
 * original text but uses the normalised form to locate spans, so casing
 * and punctuation outside the match are preserved.
 */
export const redactProfanity = (
  text: string,
  list: readonly string[] = DEFAULT_PROFANITY,
): string => {
  const normalized = normalizeForMatch(text);
  const spans = findMatches(normalized, list).sort((a, b) => a.start - b.start);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const { start, end } of spans) {
    if (start < cursor) continue;
    out += text.slice(cursor, start);
    out += "*".repeat(end - start);
    cursor = end;
  }
  out += text.slice(cursor);
  return out;
};
