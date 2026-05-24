// Aetheria — Have I Been Pwned k-anonymity password check.
//
// On signup / password change we hash the candidate with SHA-1, send the
// first 5 hex chars to https://api.pwnedpasswords.com/range/{prefix},
// and look for our remaining 35-char suffix in the response. The full
// password never leaves the server — that's the whole point of the
// k-anonymity protocol (https://haveibeenpwned.com/API/v3#PwnedPasswords).
//
// Behaviour:
//   - If the password appears in any known breach corpus → throw 400
//     "PWNED_PASSWORD" so the user picks a different one.
//   - If HIBP is unreachable / slow → log + skip. Better to let the user
//     sign up with a possibly-weak password than to outage our auth flow
//     on a third-party dependency.
//
// Threshold: any count ≥ 1 in the breach corpus is treated as compromised.
// For higher-traffic deployments we can raise the bar to e.g. ≥ 100.

import { createHash } from "node:crypto";

import { AppError } from "@aetheria/schema-api";

/** Max time to wait for HIBP before falling back to "skip". */
const HIBP_TIMEOUT_MS = 1500;
const HIBP_BASE = "https://api.pwnedpasswords.com/range/";

/**
 * Throws AppError.badRequest with code PWNED_PASSWORD when the password
 * appears in HIBP's breach corpus. Returns silently when:
 *   - The password is NOT in the corpus.
 *   - HIBP is unreachable or returns non-OK (we soft-fail, log only).
 */
export const rejectIfPwnedPassword = async (password: string): Promise<void> => {
  // Defensive — no zero-length call.
  if (typeof password !== "string" || password.length === 0) return;

  let sha1Upper: string;
  try {
    sha1Upper = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  } catch {
    // Hash failed (extremely unlikely) — skip the check rather than block.
    return;
  }
  const prefix = sha1Upper.slice(0, 5);
  const suffix = sha1Upper.slice(5);

  let res: Response;
  try {
    res = await fetch(HIBP_BASE + prefix, {
      method: "GET",
      headers: { "User-Agent": "Aetheria-Auth/1.0", "Add-Padding": "true" },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
  } catch (e) {
    // Network error / timeout — soft fail.
    // eslint-disable-next-line no-console
    console.warn("[hibp] check skipped (network):", e instanceof Error ? e.message : String(e));
    return;
  }
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[hibp] check skipped (HTTP ${res.status.toString()})`);
    return;
  }
  let body: string;
  try {
    body = await res.text();
  } catch {
    return;
  }

  // Response is `SUFFIX:COUNT` per line, e.g. "0018A45C4D1DEF81644B54AB7F969B88D65:1"
  for (const line of body.split("\n")) {
    const colon = line.indexOf(":");
    if (colon !== 35) continue; // suffix is always 35 hex chars
    const lineSuffix = line.slice(0, 35);
    if (lineSuffix !== suffix) continue;
    const countStr = line.slice(colon + 1).trim();
    const count = Number.parseInt(countStr, 10);
    if (Number.isFinite(count) && count >= 1) {
      throw AppError.badRequest(
        "This password has appeared in known data breaches — please choose a different one.",
        { code: "PWNED_PASSWORD" },
      );
    }
    return;
  }
};
