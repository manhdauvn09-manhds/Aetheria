// Aetheria — level-up resolution.
//
// Pure functions over the `Progression` value. The server is authoritative:
// after persisting an XP grant it calls `addXp`, writes the resulting
// progression, and emits the returned events to the audit log + event bus.
// The client runs the exact same code for optimistic UI.

import { MAX_LEVEL, MIN_LEVEL, xpForLevel } from "./curve.js";
import { milestoneAtLevel } from "./milestones.js";
import type {
  AddXpResult,
  LeveledUpEvent,
  Level,
  Progression,
  Xp,
} from "./types.js";

const isNonNegInt = (n: number): boolean =>
  Number.isFinite(n) && Number.isInteger(n) && n >= 0;

/** Build a fresh progression for a brand-new account (level 1, 0 XP). */
export const initialProgression = (): Progression => ({
  level: MIN_LEVEL,
  xpIntoLevel: 0,
  totalXp: 0,
});

/** Validate a `Progression` value as if loaded from the DB / wire. */
export const assertValidProgression = (p: Progression): void => {
  if (!Number.isInteger(p.level) || p.level < MIN_LEVEL || p.level > MAX_LEVEL) {
    throw new RangeError(`progression.level out of range: ${String(p.level)}`);
  }
  if (!isNonNegInt(p.xpIntoLevel)) {
    throw new RangeError(`progression.xpIntoLevel invalid: ${String(p.xpIntoLevel)}`);
  }
  if (!isNonNegInt(p.totalXp)) {
    throw new RangeError(`progression.totalXp invalid: ${String(p.totalXp)}`);
  }
  if (p.level >= MAX_LEVEL && p.xpIntoLevel !== 0) {
    throw new RangeError(`progression.xpIntoLevel must be 0 at MAX_LEVEL`);
  }
  if (p.level < MAX_LEVEL && p.xpIntoLevel >= xpForLevel(p.level)) {
    throw new RangeError(
      `progression.xpIntoLevel ${String(p.xpIntoLevel)} >= xpForLevel(${String(p.level)})=${String(xpForLevel(p.level))}`,
    );
  }
};

/**
 * Inspect a progression after an external mutation: returns the level-up
 * delta if `xpIntoLevel` is at or above the curve threshold, else `null`.
 *
 * This is the building block for `addXp` but is exported so callers that
 * mutate progression through other paths (e.g. dev-tool grants, season
 * end refunds) can reuse the same level-up logic.
 */
export const checkLevelUp = (
  p: Progression,
): { delta: number; nextLevel: Level; remainder: Xp } | null => {
  if (p.level >= MAX_LEVEL) return null;

  let level = p.level;
  let banked = p.xpIntoLevel;
  while (level < MAX_LEVEL) {
    const need = xpForLevel(level);
    if (banked < need) break;
    banked -= need;
    level += 1;
  }
  if (level === p.level) return null;
  const remainder = level >= MAX_LEVEL ? 0 : banked;
  return { delta: level - p.level, nextLevel: level, remainder };
};

/**
 * Award XP to a progression and resolve any level-ups in order.
 *
 * Behaviour:
 * - `amount` must be a non-negative finite integer; `0` is a no-op.
 * - Level-ups stack: a single huge grant can advance multiple levels and
 *   yields one `LeveledUpEvent` per level reached.
 * - At MAX_LEVEL the input is fully reflected in `totalXp` but XP into the
 *   level stays 0 and the excess is reported via `overflowXp`.
 *
 * The function never throws on `amount = 0`. It throws `RangeError` for
 * malformed inputs (negative, non-integer, NaN) — those are bugs, not
 * domain failures.
 */
export const addXp = (p: Progression, amount: Xp): AddXpResult => {
  if (!isNonNegInt(amount)) {
    throw new RangeError(`addXp: amount must be a non-negative integer (got ${String(amount)})`);
  }

  // Fast path: at max level any grant is pure overflow.
  if (p.level >= MAX_LEVEL) {
    return {
      progression: { ...p, totalXp: p.totalXp + amount },
      events: [],
      overflowXp: amount,
    };
  }

  // Drain the granted XP one level at a time so we can emit one event per
  // level crossed and pick up milestones individually.
  let level = p.level;
  let banked = p.xpIntoLevel + amount;
  const events: LeveledUpEvent[] = [];
  let overflow: Xp = 0;

  while (level < MAX_LEVEL) {
    const need = xpForLevel(level);
    if (banked < need) break;
    banked -= need;
    const from = level;
    const to: Level = level + 1;
    const milestone = milestoneAtLevel(to);
    events.push({
      type: "leveled_up",
      from,
      to,
      milestones: milestone ? [milestone] : [],
    });
    level = to;
  }

  if (level >= MAX_LEVEL && banked > 0) {
    overflow = banked;
    banked = 0;
  }

  return {
    progression: {
      level,
      xpIntoLevel: banked,
      totalXp: p.totalXp + amount,
    },
    events,
    overflowXp: overflow,
  };
};
