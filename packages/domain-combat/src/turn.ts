// Aetheria — turn rotation, status ticking, victory check.
//
// `endTurn(state, outgoingActorId)` is the canonical "advance one turn"
// helper. It runs a four-stage cycle:
//
//   1. Tick statuses on the actor whose turn ended:
//        - burn / poison apply DOT damage = potency
//        - all status counters decrement; statuses with turns=0 expire
//        - actor with hp=0 is marked defeated, emits `actor_defeated`
//   2. Decrement that actor's cooldowns by 1 (min 0).
//   3. Pick the next active actor by initiative (spd desc, id asc).
//        - If every live actor has acted this turn already, wrap:
//          increment state.turn, rebuild initiative.
//        - If turn > turnLimit (when set), declare a draw.
//   4. Refresh the new actor's AP — banking allows up to one extra
//      AP carried over (so cap = apRegen + 1).
//   5. Emit `turn_started` for the new active actor.
//   6. Call `checkVictory`; if a side wiped or it's a draw, set phase
//      and emit `battle_ended`.
//
// `checkVictory(state)` is also exported for callers who want to peek
// without rotating a turn.

import {
  hexDistance as _unused_hexDistance, // keep import warmth so editors auto-re-export
  type Actor,
  type ActorDefeatedEvent,
  type ActorId,
  type BattleEndedEvent,
  type BattleState,
  type Event,
  type Side,
  type StatusEffect,
  type TurnStartedEvent,
} from "./types.js";

// ── Public ────────────────────────────────────────────────────────────

export type Outcome = "victory" | "defeat" | "draw";

export interface EndTurnResult {
  readonly state: BattleState;
  readonly events: readonly Event[];
}

/**
 * Returns the battle outcome if it has been decided, else `null`.
 *
 *   - All player actors defeated → "defeat"
 *   - All enemy actors defeated  → "victory"
 *   - turnLimit reached (>0)     → "draw"
 *
 * `null` when neither side has wiped and the turn limit hasn't fired.
 * Pure: peeks without mutating.
 */
export const checkVictory = (state: BattleState): Outcome | null => {
  const playerAlive = state.actors.some((a) => a.side === "player" && !a.defeated);
  const enemyAlive = state.actors.some((a) => a.side === "enemy" && !a.defeated);
  if (!playerAlive) return "defeat";
  if (!enemyAlive) return "victory";
  if (state.config.turnLimit > 0 && state.turn > state.config.turnLimit) return "draw";
  return null;
};

/**
 * Advance one turn — returns a new state with the next actor primed
 * to act, plus every event emitted along the way (status DOTs,
 * defeats, turn boundaries, possibly battle_ended).
 *
 * The caller passes the actor who just ended their turn so we know
 * whose statuses to tick (the engine's `applyEndTurn` does this — most
 * external callers should never invoke this directly).
 */
export const endTurn = (state: BattleState, outgoingActorId: ActorId): EndTurnResult => {
  const events: Event[] = [];
  let working = state;

  // 1. Tick statuses on the outgoing actor.
  const ticked = tickStatuses(working, outgoingActorId, working.log.length + events.length);
  working = ticked.state;
  events.push(...ticked.events);

  // 2. Decrement cooldowns by 1.
  working = mutateActor(working, outgoingActorId, (a) => ({
    ...a,
    cooldowns: Object.fromEntries(
      Object.entries(a.cooldowns).map(([k, v]) => [k, Math.max(0, v - 1)]),
    ),
  }));

  // Early victory check (a status tick may have killed the last enemy).
  const earlyOutcome = checkVictory(working);
  if (earlyOutcome) {
    return finishWith(working, events, earlyOutcome);
  }

  // 3. Pick the next active actor.
  const live = working.actors.filter((a) => !a.defeated);
  const initiative = [...live].sort(
    (a, b) => b.stats.spd - a.stats.spd || a.id.localeCompare(b.id),
  );

  if (initiative.length === 0) {
    return finishWith(working, events, "draw");
  }

  // Look at this round's `turn_ended` events to find who has already
  // acted. We filter by `ev.turn === working.turn` rather than walking
  // backward + breaking at turn_started — there's a same-round
  // turn_started between consecutive end-of-turns we'd miss otherwise.
  const acted = new Set<ActorId>();
  for (const ev of working.log) {
    if (ev.type === "turn_ended" && ev.turn === working.turn) acted.add(ev.actorId);
  }
  const ended = events.find(
    (e): e is Extract<Event, { type: "turn_ended" }> => e.type === "turn_ended",
  );
  if (ended) acted.add(ended.actorId);
  acted.add(outgoingActorId); // belt-and-braces

  let nextActor = initiative.find((a) => !acted.has(a.id));
  if (!nextActor) {
    // Round wraps. Bump turn, check limit, then take the first initiative.
    working = { ...working, turn: working.turn + 1 };
    const wrapped = checkVictory(working);
    if (wrapped) return finishWith(working, events, wrapped);
    nextActor = initiative[0];
    if (!nextActor) return finishWith(working, events, "draw");
  }

  // 4. Refresh AP for the incoming actor (banked cap = +1 over apRegen).
  const banked = Math.max(0, Math.min(1, nextActor.stats.ap));
  const newAp = Math.min(nextActor.stats.apRegen + 1, nextActor.stats.apRegen + banked);
  working = mutateActor(working, nextActor.id, (a) => ({
    ...a,
    stats: { ...a.stats, ap: newAp },
  }));

  // 5. Set activeActorId + phase based on the new actor's side.
  const phase: BattleState["phase"] =
    nextActor.side === "player" ? "player_turn" : nextActor.side === "enemy" ? "enemy_turn" : working.phase;
  working = { ...working, activeActorId: nextActor.id, phase };

  // 6. Emit turn_started.
  const turnStarted: TurnStartedEvent = {
    type: "turn_started",
    t: working.log.length + events.length,
    turn: working.turn,
    side: nextActor.side,
    actorId: nextActor.id,
  };
  events.push(turnStarted);
  working = appendLog(working, [turnStarted]);

  // 7. Final victory check (turn-limit may have flipped on the wrap).
  const outcome = checkVictory(working);
  if (outcome) return finishWith(working, events, outcome);

  return { state: working, events };
};

// ── Internals ─────────────────────────────────────────────────────────

interface TickStatusesResult {
  readonly state: BattleState;
  readonly events: readonly Event[];
}

const tickStatuses = (state: BattleState, actorId: ActorId, baseT: number): TickStatusesResult => {
  const actor = state.actors.find((a) => a.id === actorId);
  if (!actor || actor.defeated || actor.statuses.length === 0) {
    return { state, events: [] };
  }
  const events: Event[] = [];
  let hp = actor.stats.hp;
  const remaining: StatusEffect[] = [];
  let t = baseT;

  for (const s of actor.statuses) {
    if (s.kind === "burn" || s.kind === "poison") {
      const before = hp;
      hp = Math.max(0, hp - Math.max(1, Math.round(s.potency)));
      const dot = before - hp;
      if (dot > 0) {
        events.push({
          type: "damage_dealt",
          t: t++,
          attackerId: s.source ?? actorId,
          targetId: actorId,
          amount: dot,
          mitigated: 0,
          element: s.kind === "burn" ? "ember" : "void",
          crit: false,
        });
      }
    }
    // freeze / stagger / aether_surge have no DOT; their gameplay
    // effect is consumed elsewhere (freeze skips turn, stagger -1 AP,
    // aether_surge marks resonance window).
    const nextTurns = s.turns - 1;
    if (nextTurns > 0) {
      remaining.push({ ...s, turns: nextTurns });
    } else {
      events.push({
        type: "status_expired",
        t: t++,
        targetId: actorId,
        status: s.kind,
      });
    }
  }

  let working: BattleState = mutateActor(state, actorId, (a) => ({
    ...a,
    stats: { ...a.stats, hp },
    statuses: remaining,
    defeated: hp === 0,
  }));
  if (hp === 0) {
    const def: ActorDefeatedEvent = {
      type: "actor_defeated",
      t: t++,
      actorId,
    };
    events.push(def);
  }
  working = appendLog(working, events);
  return { state: working, events };
};

const finishWith = (state: BattleState, events: Event[], outcome: Outcome): EndTurnResult => {
  const phase: BattleState["phase"] = outcome === "draw" ? "draw" : outcome;
  const ev: BattleEndedEvent = {
    type: "battle_ended",
    t: state.log.length + events.length,
    outcome,
    turns: state.turn,
  };
  const next: BattleState = { ...state, phase, activeActorId: null };
  return {
    state: appendLog(next, [ev]),
    events: [...events, ev],
  };
};

const mutateActor = (
  state: BattleState,
  id: ActorId,
  fn: (a: Actor) => Actor,
): BattleState => ({
  ...state,
  actors: state.actors.map((a) => (a.id === id ? fn(a) : a)),
});

const appendLog = (state: BattleState, events: readonly Event[]): BattleState => ({
  ...state,
  log: [...state.log, ...events],
});

// Side type re-exported for consumers building DSLs on top.
export type { Side };

// Keep the import live; some bundlers tree-shake unused module-level
// imports and we want `hexDistance` reachable from this module's
// type-only consumers (no functional use here yet).
void _unused_hexDistance;
