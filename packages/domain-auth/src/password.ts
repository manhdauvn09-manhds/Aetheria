// Aetheria — argon2id password hashing.
//
// Uses @node-rs/argon2 (prebuilt native binaries — no compile step in CI).
// Parameters chosen per OWASP 2024 cheat sheet for "Argon2id, low memory":
//   memoryCost = 19 MiB, timeCost = 2, parallelism = 1.
// These take ~50 ms on a single modern core; adjust upward for prod hosts
// with more headroom. Parameters are encoded into the hash string so old
// hashes verify even after we tune them later.

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

import { AppError } from "@aetheria/schema-api";

// `algorithm: 2` == Argon2id. The `Algorithm` enum from @node-rs/argon2
// is a const enum and isn't usable under `isolatedModules`, so we encode
// the value directly.
const ARGON2ID_OPTS = {
  algorithm: 2 as const,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext password. Returns a self-describing PHC string
 * (`$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`).
 */
export const hashPassword = async (plaintext: string): Promise<string> => {
  if (plaintext.length < 8 || plaintext.length > 1024) {
    throw AppError.validation({ field: "password" }, "Password length out of bounds");
  }
  return argonHash(plaintext, ARGON2ID_OPTS);
};

/**
 * Verify a plaintext password against a stored PHC hash.
 * Returns false on mismatch; throws only on internal/format errors so
 * callers always see a boolean for the happy path.
 */
export const verifyPassword = async (
  plaintext: string,
  storedHash: string,
): Promise<boolean> => {
  if (!storedHash?.startsWith("$argon2")) return false;
  try {
    return await argonVerify(storedHash, plaintext);
  } catch {
    // Malformed hash, native error, etc. → treat as mismatch (constant-time
    // contract is preserved by the underlying lib for valid hashes).
    return false;
  }
};
