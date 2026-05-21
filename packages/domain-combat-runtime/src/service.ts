// Aetheria — combat runtime service.
//
// Bridges the pure-domain engine (`@aetheria/domain-combat`) to the shared
// MySQL `runs` table. Three flows:
//
//   start({runId})         build a fresh BattleState from the run's
//                          level + a synthesised party / encounter,
//                          persist into runs.snapshot + reset action_log
//   submitAction({runId, action})
//                          load → hydrate → applyAction → persist;
//                          server-authoritative validation (illegal
//                          actions reject without state change)
//   replay({runId})        re-run runs.action_log against a fresh init
//                          and compare the final hash to the stored
//                          snapshot's hash; flags tampering
//
// We treat the run row as the canonical source of truth: snapshot is the
// live BattleState (serialized to a stable JSON envelope), action_log is
// the append-only history. Both columns are MySQL `JSON` type.
//
// Authorisation note: every query is scoped by `userId` so a user can't
// touch another user's run even if they discover a numeric runId.
//
// B13 note (integrity): the replay-hash check defeats client-driven
// tampering of action_log + snapshot — they have to remain self-
// consistent under deterministic replay, which is intractable without
// knowing the engine seed. Operator-level tampering (DB row edit) is out
// of scope for this layer.

import { audit } from "@aetheria/core";
import { events as defaultEventBus, type EventBus } from "@aetheria/domain-events";
import {
  applyAction,
  createBattle,
  EngineError,
  HEX_DIRS,
  hashState,
  hexDistance,
  hydrate,
  replayActions,
  serializeState,
  type Action,
  type Actor,
  type BattleState,
  type Coord,
  type CreateBattleInput,
  type Event,
  type Tile,
} from "@aetheria/domain-combat";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

export type CombatMysqlClient = Pick<
  MysqlClient,
  "run" | "profile" | "inventory" | "item" | "$transaction"
>;

export interface CombatRunDeps {
  readonly mysql: CombatMysqlClient;
  /** Optional event bus for quest/battle-pass progress. Defaults to the
   *  module-level `events` singleton when not provided so existing
   *  callers don't need to wire anything. */
  readonly events?: EventBus;
}

export interface RunRef {
  readonly userId: bigint;
  readonly runId: bigint;
}

export interface CombatStartResult {
  readonly state: BattleState;
}

export interface CombatSubmitResult {
  readonly state: BattleState;
  readonly events: ReturnType<typeof applyAction>["events"];
  readonly runStatus: RunStatus;
  /** Present only when runStatus transitioned to "completed" this call. */
  readonly rewards?: GrantedRewards;
}

export interface CombatReplayResult {
  readonly ok: boolean;
  readonly expected: string;
  readonly actual: string;
}

type RunStatus = "in_progress" | "completed" | "failed" | "abandoned";

interface RunRow {
  readonly id: bigint;
  readonly levelId: bigint;
  readonly status: string;
  readonly actionLog: unknown;
  readonly snapshot: unknown;
  readonly revision: number;
  readonly level: {
    readonly levelNumber: number;
    readonly name: string;
    /** rewards JSON: { xp, gold, items[], firstClearBonus? } */
    readonly rewards: unknown;
  };
}

/** Reward payload server emits to the client after a victorious submitAction. */
export interface GrantedRewards {
  readonly xp: number;
  readonly gold: number;
  readonly items: ReadonlyArray<{ itemId: number; qty: number }>;
}

export class CombatRunService {
  constructor(private readonly deps: CombatRunDeps) {}

  // ── Public flows ──────────────────────────────────────────────────

  async start(ref: RunRef): Promise<CombatStartResult> {
    const run = await this.loadRun(ref);
    if (run.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: run.status });
    }
    // Read the user's chosen team from profile.preferences (if any).
    // Falls back to the level-rotation default in synthesiseInit() when
    // empty. Picked here (vs in synth) to keep synth pure.
    const selectedTeam = await this.loadSelectedTeam(ref.userId);
    const init = synthesiseInit(ref, run.level, selectedTeam);
    const fresh = createBattle(init);
    // Optimistic concurrency: only update if the row's revision still
    // matches what we loaded. updateMany returns a count of 0 if some
    // other request raced ahead — we surface that as a conflict so the
    // client can retry with a fresh load.
    const cas = await this.deps.mysql.run.updateMany({
      where: { id: ref.runId, revision: run.revision },
      data: {
        // hydrate() expects the SerializedState envelope `{schemaVersion, state}`,
        // not raw BattleState. Use serializeState() to keep the contract.
        snapshot: serializeState(fresh) as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: [] as unknown as MysqlPrisma.Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
    if (cas.count === 0) {
      throw AppError.conflict("Combat state changed concurrently — retry");
    }
    await audit.write({
      actor: ref.userId,
      action: "combat.start",
      targetType: "run",
      targetId: ref.runId,
      payload: { battleId: fresh.battleId, levelNumber: run.level.levelNumber },
    });
    return { state: fresh };
  }

  async submitAction(ref: RunRef, action: Action): Promise<CombatSubmitResult> {
    const run = await this.loadRun(ref);
    if (run.status !== "in_progress") {
      throw AppError.invalidAction("Run is not in progress", { status: run.status });
    }
    const state = this.hydrateOrThrow(run);
    const log = parseActionLog(run.actionLog);

    let result: ReturnType<typeof applyAction>;
    try {
      result = applyAction(state, action);
    } catch (e) {
      if (e instanceof EngineError) {
        throw AppError.invalidAction(`combat: ${e.code}`, {
          code: e.code,
          message: e.message,
          details: e.details ?? null,
        });
      }
      throw AppError.internal("combat engine failure", e);
    }

    const appendedActions: Action[] = [action];
    const aggregatedEvents: Event[] = [...result.events];

    // ── Server-side enemy AI ─────────────────────────────────────────
    // While it's the enemy's turn, pick + apply one action per enemy
    // actor until we either bounce back to the player or the battle
    // ends. AI is intentionally simple (chase → attack-if-adjacent →
    // end-turn fallback) so the player has a moving opponent without
    // depending on a real-time client tick.
    let aiSafetyBudget = 24; // worst-case 6 enemies × 4 actions
    while (
      aiSafetyBudget-- > 0 &&
      result.state.phase === "enemy_turn" &&
      result.state.activeActorId
    ) {
      const enemyAction = pickEnemyAction(result.state, result.state.activeActorId);
      if (!enemyAction) break;
      let aiResult: ReturnType<typeof applyAction>;
      try {
        aiResult = applyAction(result.state, enemyAction);
      } catch {
        // AI picked something the engine rejected — fall back to
        // ending the enemy's turn so we don't loop forever.
        try {
          aiResult = applyAction(result.state, {
            kind: "end_turn",
            actorId: result.state.activeActorId,
          });
        } catch {
          break;
        }
      }
      appendedActions.push(enemyAction);
      aggregatedEvents.push(...aiResult.events);
      result = aiResult;
    }

    const nextLog = [...log, ...appendedActions];
    const phase = result.state.phase;
    const runStatus: RunStatus =
      phase === "victory" ? "completed"
        : phase === "defeat" ? "failed"
        : phase === "draw" ? "completed"
        : "in_progress";

    // CAS write — only commit if revision still matches the one we
    // loaded above. Prevents concurrent submitAction calls from
    // clobbering each other's snapshot/actionLog/status.
    const cas = await this.deps.mysql.run.updateMany({
      where: { id: ref.runId, revision: run.revision },
      data: {
        snapshot: serializeState(result.state) as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: nextLog as unknown as MysqlPrisma.Prisma.InputJsonValue,
        status: runStatus,
        revision: { increment: 1 },
        ...(runStatus === "in_progress" ? {} : { endedAt: new Date() }),
      },
    });
    if (cas.count === 0) {
      throw AppError.conflict(
        "Combat state changed concurrently — refresh and retry",
        { runId: String(ref.runId), atRevision: run.revision },
      );
    }

    // ── Reward grant on victory transition ───────────────────────────
    // We grant ONLY on victory (not draw — draws don't unlock the next
    // level either). Failures (defeat) award nothing.
    let granted: GrantedRewards | undefined;
    if (phase === "victory") {
      try {
        granted = await this.grantRewards(ref.userId, run.level.rewards);
      } catch (e) {
        // Don't fail the whole submitAction if rewards crash — the
        // combat result is already authoritative. Log + carry on; an
        // operator can manually backfill from the audit log.
        await audit.write({
          actor: ref.userId,
          action: "combat.rewards_grant_failed",
          targetType: "run",
          targetId: ref.runId,
          payload: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }

    // ── Domain events for quest/battle-pass progress ─────────────────
    // Publish LevelCompleted + RunFinished + EnemyDefeated when relevant.
    // QuestService.start() subscribes via @aetheria/domain-events bus.
    if (phase === "victory" || phase === "defeat" || phase === "draw") {
      const bus = this.deps.events ?? defaultEventBus;
      const runStatusForEvent: "completed" | "failed" | "abandoned" =
        phase === "victory" ? "completed"
          : phase === "defeat" ? "failed"
          : "completed"; // draw counts as completed for finish-runs quests
      try {
        if (phase === "victory") {
          await bus.emit("LevelCompleted", {
            userId: ref.userId.toString(),
            runId: ref.runId.toString(),
            levelId: run.levelId.toString(),
            score: 0,
            stars: 1,
          });
        }
        await bus.emit("RunFinished", {
          userId: ref.userId.toString(),
          runId: ref.runId.toString(),
          levelId: run.levelId.toString(),
          status: runStatusForEvent,
          score: 0,
          stars: phase === "victory" ? 1 : 0,
        });
      } catch (e) {
        // Event bus failures must not break combat — log + continue.
        await audit.write({
          actor: ref.userId,
          action: "combat.event_publish_failed",
          targetType: "run",
          targetId: ref.runId,
          payload: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }
    // Also: emit EnemyDefeated for each killed enemy in this submit.
    // The engine emits actor_defeated events; we map them to domain.
    for (const ev of aggregatedEvents) {
      if (ev.type === "actor_defeated") {
        const killed = result.state.actors.find((a) => a.id === ev.actorId);
        if (killed && killed.side === "enemy") {
          try {
            const bus = this.deps.events ?? defaultEventBus;
            await bus.emit("EnemyDefeated", {
              userId: ref.userId.toString(),
              runId: ref.runId.toString(),
              enemyId: killed.id,
              archetype: killed.unit,
            });
          } catch {
            // Swallow — combat already committed
          }
        }
      }
    }

    await audit.write({
      actor: ref.userId,
      action: "combat.submit_action",
      targetType: "run",
      targetId: ref.runId,
      payload: {
        kind: action.kind,
        actorId: action.actorId,
        events: aggregatedEvents.length,
        aiActions: appendedActions.length - 1,
        phase,
        rewardsGranted: granted ?? null,
      },
    });
    return {
      state: result.state,
      events: aggregatedEvents,
      runStatus,
      ...(granted ? { rewards: granted } : {}),
    };
  }

  // ── Reward grant helper ─────────────────────────────────────────────
  //
  // Pulled out so the submitAction flow stays linear. Reads the level's
  // rewards JSON (xp/gold/items), credits the user's profile in one
  // update, and upserts each item stack. Single transaction so partial
  // grants can't happen if the DB hiccups mid-loop.

  // ── Selected-team reader ────────────────────────────────────────────
  //
  // Pulls `preferences.selectedTeam` from the user's profile if it's
  // a valid 1..3-length array of known hero IDs. Anything malformed
  // returns null and the synth falls back to its level rotation.

  private async loadSelectedTeam(userId: bigint): Promise<readonly string[] | null> {
    const profile = await this.deps.mysql.profile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    if (!profile?.preferences || typeof profile.preferences !== "object") return null;
    const team = (profile.preferences as { selectedTeam?: unknown }).selectedTeam;
    if (!Array.isArray(team)) return null;
    const validIds = new Set(HERO_ROSTER.map((h) => h.id));
    const filtered: string[] = [];
    for (const t of team) {
      if (typeof t === "string" && validIds.has(t) && !filtered.includes(t)) {
        filtered.push(t);
      }
      if (filtered.length >= 3) break;
    }
    return filtered.length >= 1 ? filtered : null;
  }

  private async grantRewards(
    userId: bigint,
    rewardsJson: unknown,
  ): Promise<GrantedRewards> {
    const rewards = normaliseRewards(rewardsJson);
    if (rewards.xp <= 0 && rewards.gold <= 0 && rewards.items.length === 0) {
      return rewards;
    }

    await this.deps.mysql.$transaction(async (tx: MysqlPrisma.Prisma.TransactionClient) => {
      // Profile increments — gold + accountXp. tolerateDbMiss isn't
      // needed because rewards only fire on a successful combat.
      if (rewards.gold > 0 || rewards.xp > 0) {
        await tx.profile.update({
          where: { userId },
          data: {
            ...(rewards.gold > 0 ? { gold: { increment: rewards.gold } } : {}),
            ...(rewards.xp > 0 ? { accountXp: { increment: rewards.xp } } : {}),
          },
        });
      }
      for (const it of rewards.items) {
        const itemId = BigInt(it.itemId);
        // Skip unknown items quietly so a placeholder reward (itemId
        // referencing a not-yet-seeded catalog entry) doesn't crash
        // the whole grant.
        const known = await tx.item.findUnique({
          where: { id: itemId },
          select: { id: true },
        });
        if (!known) continue;
        await tx.inventory.upsert({
          where: { userId_itemId: { userId, itemId } },
          create: { userId, itemId, quantity: it.qty },
          update: { quantity: { increment: it.qty } },
        });
      }
    });

    await audit.write({
      actor: userId,
      action: "combat.rewards_granted",
      targetType: "user",
      targetId: userId,
      payload: rewards as unknown as Record<string, unknown>,
    });
    return rewards;
  }

  async replay(ref: RunRef): Promise<CombatReplayResult> {
    const run = await this.loadRun(ref);
    const log = parseActionLog(run.actionLog);
    const stored = this.hydrateOrThrow(run);
    const init = synthesiseInit(ref, run.level);
    // Replay against the same init seed, then compare against the
    // snapshot's serialized hash. Mismatch ⇒ tampered run.
    const replayed = replayActions({ init, actions: log });
    const expected = hashState(stored);
    return {
      ok: replayed.hash === expected,
      expected,
      actual: replayed.hash,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────

  private async loadRun(ref: RunRef): Promise<RunRow> {
    const row = await this.deps.mysql.run.findFirst({
      where: { id: ref.runId, userId: ref.userId },
      select: {
        id: true,
        levelId: true,
        status: true,
        actionLog: true,
        snapshot: true,
        revision: true,
        level: { select: { levelNumber: true, name: true, rewards: true } },
      },
    });
    if (!row) throw AppError.notFound("run", ref.runId);
    return row;
  }

  private hydrateOrThrow(run: RunRow): BattleState {
    if (run.snapshot === null || run.snapshot === undefined) {
      throw AppError.invalidAction("Combat hasn't started for this run", {
        runId: String(run.id),
      });
    }
    try {
      return hydrate(run.snapshot);
    } catch (e) {
      throw AppError.internal("Run snapshot is corrupted", e);
    }
  }
}

// ── Synthesis helpers ─────────────────────────────────────────────────
//
// 4.27 ships a server-authoritative shell. Real per-level encounter
// data + party loading lands in 4-E (`progression`). For now we
// synthesise a 6×4 plain grid with one player + one enemy so the
// engine has a valid starting state that's deterministic per run.

// Roster used for the synthesised encounter. Indexes 0..7 mirror the
// 8-character roster from docs/01_GAME_GUIDELINE.md §5. Stats below are
// the "real" balance pass — derived from the role wheel (tank, dps,
// healer, support, assassin) so each hero feels distinct in combat.
//
// Balance philosophy:
//   - Tank   : highest HP+DEF, lowest SPD; absorbs damage, slow to act.
//   - Bruiser: tanky DPS, moderate everything.
//   - DPS    : medium HP, high ATK, mid SPD; the steady killer.
//   - Mage   : low HP, highest ATK, high SPD; glass cannon.
//   - Healer : low ATK, mid HP + DEF, mid SPD; outpaces tanks, not assassins.
//   - Asn    : lowest HP, very high SPD, high ATK; turn-1 burst.
//   - Support: medium everything, slightly tankier than DPS.
//   - Wild   : averages between Aevra and Vex; "tempo" pick.
//
// AP/move are uniform (3 AP, 2 move) for the synth encounter so the
// engine spec doesn't fork; per-skill scaling lands when skill data
// hits the catalog.
const HERO_ROSTER: ReadonlyArray<{
  readonly id: string;
  readonly unit: string;
  readonly role:
    | "tank" | "bruiser" | "dps" | "mage" | "healer" | "assassin" | "support" | "wildcard";
  readonly element: "verdant" | "ember" | "frost" | "tide" | "sky" | "void";
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}> = [
  // 0  Aevra    — Aetherwalker, hybrid DPS. The flagship; balanced.
  { id: "aevra", unit: "Aevra",  role: "dps",      element: "ember",   hp: 92,  atk: 32, def: 12, spd: 65 },
  // 1  Kyo      — Bladepriest, tank/DPS. Frontline bruiser.
  { id: "kyo",   unit: "Kyo",    role: "bruiser",  element: "void",    hp: 112, atk: 26, def: 20, spd: 50 },
  // 2  Lyra     — Stormcaller, AoE mage. Glass cannon.
  { id: "lyra",  unit: "Lyra",   role: "mage",     element: "sky",     hp: 76,  atk: 40, def:  8, spd: 60 },
  // 3  Brann    — Earthwarden, pure tank.
  { id: "brann", unit: "Brann",  role: "tank",     element: "verdant", hp: 134, atk: 20, def: 28, spd: 40 },
  // 4  Mira     — Lifebinder, healer. Mid stats, low ATK.
  { id: "mira",  unit: "Mira",   role: "healer",   element: "verdant", hp: 88,  atk: 18, def: 16, spd: 55 },
  // 5  Vex      — Shadowblade, assassin. Highest SPD, fragile.
  { id: "vex",   unit: "Vex",    role: "assassin", element: "void",    hp: 72,  atk: 38, def: 10, spd: 80 },
  // 6  Solen    — Sunoracle, support. Modest stats, gameplay value via buffs.
  { id: "solen", unit: "Solen",  role: "support",  element: "sky",     hp: 90,  atk: 22, def: 16, spd: 58 },
  // 7  Null     — Voidchild, wildcard. Average between Aevra + Vex.
  { id: "null",  unit: "Null",   role: "wildcard", element: "void",    hp: 96,  atk: 30, def: 14, spd: 62 },
];

// Enemy archetypes — one per element, plus a boss-tier "Void Lord" for
// final-trial levels. Stats are intentionally slightly weaker than the
// matching-role hero so level-1 is winnable for a fresh player; level
// scaling adds depth as the player progresses.
const ENEMY_ARCHETYPES: ReadonlyArray<{
  readonly id: string;
  readonly unit: string;
  readonly element: "verdant" | "ember" | "frost" | "tide" | "sky" | "void";
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}> = [
  { id: "verdant_spore", unit: "Verdant Spore", element: "verdant", hp: 62, atk: 20, def: 14, spd: 42 },
  { id: "ember_husk",    unit: "Ember Husk",    element: "ember",   hp: 68, atk: 22, def: 12, spd: 44 },
  { id: "frost_wraith",  unit: "Frost Wraith",  element: "frost",   hp: 56, atk: 24, def:  8, spd: 50 },
  { id: "tide_brute",    unit: "Tide Brute",    element: "tide",    hp: 82, atk: 18, def: 16, spd: 36 },
  { id: "sky_reaper",    unit: "Sky Reaper",    element: "sky",     hp: 58, atk: 26, def:  8, spd: 54 },
  { id: "void_stalker",  unit: "Void Stalker",  element: "void",    hp: 52, atk: 28, def:  6, spd: 56 },
];

const BOSS_ARCHETYPE = {
  id: "void_lord", unit: "Void Lord", element: "void" as const,
  hp: 180, atk: 36, def: 18, spd: 55,
};

// Role → signature skill mapping. Each hero gets one or two skills
// from this table at synth time. IDs must match SKILL_CATALOG in
// domain-combat. DPS and Assassin now carry a status-applying skill
// alongside their burst attack so combat plays with actual DOT depth.
const ROLE_TO_SKILLS: Record<typeof HERO_ROSTER[number]["role"], readonly string[]> = {
  tank:     ["bulwark"],
  bruiser:  ["bulwark"],
  dps:      ["power_strike", "firebolt"],       // burst + burn DOT
  mage:     ["power_strike"],
  healer:   ["heal"],
  assassin: ["power_strike", "venom_dart"],     // burst + poison DOT
  support:  ["bless"],
  wildcard: ["power_strike", "firebolt"],
};

const PARTY_SIZE = 3;

const synthesiseInit = (
  ref: RunRef,
  level: { levelNumber: number; name: string },
  /** User-chosen team (1..3 hero IDs). When null, falls back to the
   *  per-level rotation so existing tests + new players still work. */
  selectedTeam: readonly string[] | null = null,
): CreateBattleInput => {
  const tiles: Tile[] = [];
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 4; r++) {
      const terrain: Tile["terrain"] =
        r === 0 && (q === 1 || q === 4) ? "forest" :
        r === 3 && q === 5             ? "shrine" :
                                         "plain";
      tiles.push({ q, r, terrain, elev: 0 });
    }
  }
  // Boss every 20th level → final trial of each realm.
  const isBoss = level.levelNumber > 0 && level.levelNumber % 20 === 0;
  const baseHeroIdx = Math.max(0, (level.levelNumber - 1)) % HERO_ROSTER.length;
  const baseEnemyIdx = Math.max(0, (level.levelNumber - 1)) % ENEMY_ARCHETYPES.length;

  // Build the party. Player-chosen team wins if present, otherwise
  // rotate through the roster by level. Always positioned in the left
  // column (q=0, r=0..2).
  const heroPositions = [
    { q: 0, r: 0 },
    { q: 0, r: 1 },
    { q: 0, r: 2 },
  ];
  const partySpecs: typeof HERO_ROSTER[number][] = [];
  if (selectedTeam && selectedTeam.length > 0) {
    for (const id of selectedTeam) {
      const spec = HERO_ROSTER.find((h) => h.id === id);
      if (spec) partySpecs.push(spec);
      if (partySpecs.length >= PARTY_SIZE) break;
    }
    // If user picked < 3 heroes, fill remaining slots with rotation.
    let pad = 0;
    while (partySpecs.length < PARTY_SIZE) {
      const fillSpec = HERO_ROSTER[(baseHeroIdx + pad) % HERO_ROSTER.length]!;
      if (!partySpecs.find((p) => p.id === fillSpec.id)) {
        partySpecs.push(fillSpec);
      }
      pad++;
      if (pad > HERO_ROSTER.length) break;
    }
  } else {
    for (let i = 0; i < PARTY_SIZE; i++) {
      partySpecs.push(HERO_ROSTER[(baseHeroIdx + i) % HERO_ROSTER.length]!);
    }
  }

  const heroes: Actor[] = [];
  for (let i = 0; i < partySpecs.length; i++) {
    const spec = partySpecs[i]!;
    const skillIds = ROLE_TO_SKILLS[spec.role];
    const hp = spec.hp + Math.floor(level.levelNumber * 1.5);
    heroes.push(synthActor(
      `${spec.id}_${String(i)}`, spec.unit, "player", spec.element,
      heroPositions[i]!, hp,
      { atk: spec.atk, def: spec.def, spd: spec.spd },
      skillIds,
    ));
  }

  // Enemies: boss gets 1 strong; non-boss gets 2 (paired). Right column.
  const enemies: Actor[] = [];
  if (isBoss) {
    const ehp = BOSS_ARCHETYPE.hp + Math.min(200, level.levelNumber * 5);
    enemies.push(synthActor(
      BOSS_ARCHETYPE.id, BOSS_ARCHETYPE.unit, "enemy", BOSS_ARCHETYPE.element,
      { q: 5, r: 1 }, ehp,
      {
        atk: BOSS_ARCHETYPE.atk + Math.floor(level.levelNumber / 2),
        def: BOSS_ARCHETYPE.def,
        spd: BOSS_ARCHETYPE.spd,
      },
      [],
    ));
  } else {
    const enemyPositions = [{ q: 5, r: 1 }, { q: 5, r: 2 }];
    for (let i = 0; i < enemyPositions.length; i++) {
      const spec = ENEMY_ARCHETYPES[(baseEnemyIdx + i) % ENEMY_ARCHETYPES.length]!;
      const ehp = spec.hp + Math.min(120, level.levelNumber * 3);
      enemies.push(synthActor(
        `${spec.id}_${String(i)}`, spec.unit, "enemy", spec.element,
        enemyPositions[i]!, ehp,
        {
          atk: spec.atk + Math.floor(level.levelNumber / 2),
          def: spec.def,
          spd: spec.spd,
        },
        [],
      ));
    }
  }

  return {
    battleId: `run-${ref.runId.toString()}`,
    config: { width: 6, height: 4, turnLimit: 30, defaultApRegen: 3 },
    tiles,
    actors: [...heroes, ...enemies],
    firstTurn: "player",
  };
};

const synthActor = (
  id: string,
  unit: string,
  side: "player" | "enemy",
  element: "verdant" | "ember" | "frost" | "tide" | "sky" | "void",
  pos: { q: number; r: number },
  hp: number,
  combat: { atk: number; def: number; spd: number },
  skills: readonly string[] = [],
): Actor => ({
  id,
  side,
  unit,
  element,
  stats: {
    hp,
    maxHp: hp,
    ap: 3,
    apRegen: 3,
    atk: combat.atk,
    def: combat.def,
    spd: combat.spd,
    move: 2,
  },
  pos,
  facing: 0,
  statuses: [],
  skills: [...skills],
  cooldowns: {},
  defeated: false,
});

/**
 * Coerce the level row's `rewards` JSON into a typed { xp, gold, items }
 * payload. Tolerates missing/null fields — the synthesised levels and
 * the seed placeholder rows can both have empty objects.
 */
const normaliseRewards = (raw: unknown): GrantedRewards => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { xp: 0, gold: 0, items: [] };
  }
  const r = raw as Record<string, unknown>;
  const xp = typeof r.xp === "number" && r.xp >= 0 ? Math.floor(r.xp) : 0;
  const gold = typeof r.gold === "number" && r.gold >= 0 ? Math.floor(r.gold) : 0;
  const items: { itemId: number; qty: number }[] = [];
  if (Array.isArray(r.items)) {
    for (const it of r.items) {
      if (it === null || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const itemId = typeof o.itemId === "number" ? Math.floor(o.itemId) : null;
      const qty = typeof o.qty === "number" ? Math.floor(o.qty) : null;
      if (itemId !== null && itemId > 0 && qty !== null && qty > 0 && qty <= 999) {
        items.push({ itemId, qty });
      }
    }
  }
  return { xp, gold, items };
};

const parseActionLog = (raw: unknown): readonly Action[] => {
  // MySQL JSON column returns a parsed value already, but tolerate the
  // legacy string form in case a stale row lingers from before the
  // 1-DB consolidation.
  if (Array.isArray(raw)) return raw as readonly Action[];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as readonly Action[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

// serializeState is now used in start() + submitAction() (snapshot must be the
// `{schemaVersion, state}` envelope, not raw BattleState).

// ── Enemy AI ──────────────────────────────────────────────────────────
//
// Pick the next action for a single enemy actor. Strategy:
//   1. Find the closest live player-side actor.
//   2. If adjacent → attack.
//   3. If we have AP + move budget → step one hex toward the target along
//      a hex direction that brings us closer and lands on a tile that
//      isn't occupied.
//   4. Otherwise → end_turn.
//
// This is intentionally one of the simplest AIs that actually puts
// pressure on the player. Better behaviours (kiting, status synergy,
// element-wheel preference) land later.

const pickEnemyAction = (state: BattleState, actorId: string): Action | null => {
  const me = state.actors.find((a) => a.id === actorId);
  if (!me || me.defeated || me.side !== "enemy") {
    return { kind: "end_turn", actorId };
  }
  const target = nearestPlayer(state, me);
  if (!target) {
    return { kind: "end_turn", actorId };
  }
  const dist = hexDistance(me.pos, target.pos);

  // Adjacent + has AP for attack: strike.
  if (dist === 1 && me.stats.ap >= 1) {
    return { kind: "attack", actorId, targetId: target.id };
  }

  // Try to move one hex closer if we have AP + at least one move budget.
  if (me.stats.ap >= 1 && me.stats.move >= 1) {
    const step = stepToward(state, me, target.pos);
    if (step) {
      return { kind: "move", actorId, path: [step] };
    }
  }

  return { kind: "end_turn", actorId };
};

const nearestPlayer = (state: BattleState, from: Actor): Actor | null => {
  let best: Actor | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of state.actors) {
    if (a.side !== "player" || a.defeated) continue;
    const d = hexDistance(from.pos, a.pos);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
};

const stepToward = (state: BattleState, me: Actor, target: Coord): Coord | null => {
  const occupied = new Set<string>();
  for (const a of state.actors) {
    if (!a.defeated && a.id !== me.id) {
      occupied.add(`${String(a.pos.q)},${String(a.pos.r)}`);
    }
  }
  const tileSet = new Set<string>(
    state.tiles.map((t) => `${String(t.q)},${String(t.r)}`),
  );
  let best: Coord | null = null;
  let bestDist = hexDistance(me.pos, target);
  for (const d of HEX_DIRS) {
    const next: Coord = { q: me.pos.q + d.q, r: me.pos.r + d.r };
    const key = `${String(next.q)},${String(next.r)}`;
    if (!tileSet.has(key)) continue;          // off-map
    if (occupied.has(key)) continue;          // blocked by another actor
    const nd = hexDistance(next, target);
    if (nd < bestDist) {
      bestDist = nd;
      best = next;
    }
  }
  return best;
};
