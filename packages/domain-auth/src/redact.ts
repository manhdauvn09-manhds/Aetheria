// Aetheria — PII redaction helpers (audit/log safety, B7).
//
// Audit rows may be queried by junior staff or shipped to log aggregators;
// raw email is PII. Redact to `a***@example.com` form: domain preserved
// (useful for routing diagnostics) but local-part is masked.

/**
 * Mask the local-part of an email so the raw value never reaches audit
 * logs. Returns `"***"` for malformed input rather than leaking the raw
 * string back.
 */
export const redactEmail = (email: string): string => {
  if (typeof email !== "string" || email.length === 0) return "***";
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  const local  = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 2) return `***@${domain}`;
  const first = local.charAt(0);
  return `${first}***@${domain}`;
};
