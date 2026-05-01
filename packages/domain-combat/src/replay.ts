// Aetheria — combat replay + state fingerprinting.
//
// Used by the anti-cheat worker (Step 4-I) and admin replay tooling:
//   - The client submits a `runs.action_log` plus the final `snapshot`.
//   - The server reconstructs a fresh battle from the same seed +
//     initial inputs, replays every action, then compares the final
//     state's hash against the client-submitted one.
//   - Any per-step EngineError is captured but doesn't abort the
//     replay — anti-cheat wants to know *all* the divergences, not
//     just the first.
//
// Pure-domain. The fingerprint is JS-pure FNV-1a 64-bit on the stable
// JSON produced by `stringifyState`; not cryptographic, but enough to
// collision-detect at game-log scale.

import { applyAction, createBattle, type CreateBattleInput, EngineError } from "./engine.js";
import { stringifyState } from "./persistence.js";
import type { Action, BattleState, Event } from "./types.js";

// ── Public types ─────────────────────────────────────────────────────

export interface ReplayStepError {
  /** 0-based action index that threw. */
  readonly index: number;
  readonly code: EngineError["code"] | "UNKNOWN";
  readonly message: string;
}

export interface ReplayResult {
  readonly state: BattleState;
  readonly events: readonly Event[];
  readonly errors: readonly ReplayStepError[];
  /** Stable fingerprint of the final state (16 hex chars / 64 bit). */
  readonly hash: string;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly state: BattleState;
  readonly errors: readonly ReplayStepError[];
}

// ── replayActions ─────────────────────────────────────────────────────

export interface ReplayInput {
  readonly init: CreateBattleInput;
  readonly actions: readonly Action[];
  /**
   * Stop replay at the first error instead of continuing. Useful when
   * an admin tool wants the engine's first complaint and not a flood
   * of cascading mismatches. Default: `false`.
   */
  readonly stopOnError?: boolean;
}

/**
 * Re-create a battle from `init`, drive `actions` through the engine
 * one at a time, and return the resulting state + every emitted event
 * + per-step errors. Errors don't roll back state — the engine simply
 * skips the offending action and continues with the next.
 */
export const replayActions = (input: ReplayInput): ReplayResult => {
  let state = createBattle(input.init);
  const events: Event[] = [];
  const errors: ReplayStepError[] = [];
  for (let i = 0; i < input.actions.length; i++) {
    const action = input.actions[i];
    if (!action) continue;
    try {
      const r = applyAction(state, action);
      state = r.state;
      events.push(...r.events);
    } catch (e) {
      const err: ReplayStepError = e instanceof EngineError
        ? { index: i, code: e.code, message: e.message }
        : { index: i, code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) };
      errors.push(err);
      if (input.stopOnError) break;
    }
  }
  return {
    state,
    events,
    errors,
    hash: hashState(state),
  };
};

// ── verifyReplay ──────────────────────────────────────────────────────

export interface VerifyInput extends ReplayInput {
  /** The hash the client claims the run ended with. */
  readonly expectedHash: string;
}

/**
 * Replay the action log and compare the resulting fingerprint against
 * the client-submitted hash. `ok=false` means the server-reconstructed
 * state diverges — the run should be flagged for review.
 */
export const verifyReplay = (input: VerifyInput): VerifyResult => {
  const { expectedHash, ...rest } = input;
  const r = replayActions(rest);
  return {
    ok: r.hash === expectedHash,
    expected: expectedHash,
    actual: r.hash,
    state: r.state,
    errors: r.errors,
  };
};

// ── hashState ─────────────────────────────────────────────────────────

/**
 * Deterministic 64-bit FNV-1a fingerprint of the stable serialized
 * state, returned as 16 lowercase hex chars. Two states whose
 * `stringifyState` outputs are equal hash identically; tiny diffs
 * (one HP off, one event reordered) produce wildly different hashes.
 *
 * Not collision-resistant for adversarial inputs in the cryptographic
 * sense — fine for game-log fingerprinting.
 */
export const hashState = (state: BattleState): string => fnv1a64(stringifyState(state));

/** Hash an arbitrary string (e.g. when you've already serialized). */
export const fnv1a64 = (s: string): string => {
  // 64-bit FNV-1a using two 32-bit halves to avoid BigInt overhead.
  // Reference: http://www.isthe.com/chongo/tech/comp/fnv/
  let lo = 0x84222325 >>> 0;
  let hi = 0xcbf29ce4 >>> 0;
  const PRIME_LO = 0x000001b3;
  const PRIME_HI = 0x00000100;
  for (let i = 0; i < s.length; i++) {
    lo ^= s.charCodeAt(i);
    // 64-bit multiply (lo:hi) by (PRIME_LO + PRIME_HI<<32). Using the
    // standard split-multiply pattern.
    const lLo = lo & 0xffff;
    const lHi = lo >>> 16;
    const hLo = hi & 0xffff;
    const hHi = hi >>> 16;
    const r0 = lLo * PRIME_LO;
    const r1 = lHi * PRIME_LO + (r0 >>> 16);
    const r2 = lLo * PRIME_HI + (r1 & 0xffff);
    const newLo = ((r1 & 0xffff) << 16) | (r0 & 0xffff);
    const r3 =
      hLo * PRIME_LO +
      (r1 >>> 16) +
      (r2 >>> 16) +
      lHi * PRIME_HI +
      hHi * PRIME_LO; // overflow above bit 64 is intentionally dropped
    const newHi = ((r3 & 0xffff) << 16) | (r2 & 0xffff);
    lo = newLo >>> 0;
    hi = newHi >>> 0;
  }
  const hex = (n: number): string => n.toString(16).padStart(8, "0");
  return `${hex(hi)}${hex(lo)}`;
};
