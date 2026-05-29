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
import { findLevelByNumber } from "@aetheria/game-assets";
import { applyAccountXp } from "@aetheria/progression-runtime";
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
  "run" | "profile" | "inventory" | "item" | "userCharacter" | "$transaction"
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
  readonly partyConfig: unknown;
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

    // ── RESUME (#4) ──────────────────────────────────────────────────
    // If combat was already started for this run (snapshot present) and
    // is mid-fight, return the existing state instead of rebuilding —
    // leaving + re-entering /play/[N] no longer wipes progress. Only
    // rebuild when the battle has actually ended (or no snapshot yet).
    if (run.snapshot !== null && run.snapshot !== undefined) {
      try {
        const existing = hydrate(run.snapshot);
        const live = existing.phase === "player_turn"
          || existing.phase === "enemy_turn"
          || existing.phase === "resolving"
          || existing.phase === "setup";
        if (live) {
          return { state: existing };
        }
      } catch {
        // Corrupt snapshot — fall through to a fresh start below.
      }
    }

    // ── FRESH START ──────────────────────────────────────────────────
    // Resolve the party: selectedTeam ∩ owned heroes, fallback to
    // rotation. Persist the resolved IDs so combat.replay rebuilds the
    // identical init even if preferences change later.
    const partyIds = await this.resolveOwnedParty(ref.userId);
    const init = synthesiseInit(ref, run.level, partyIds);
    const fresh = createBattle(init);
    const cas = await this.deps.mysql.run.updateMany({
      where: { id: ref.runId, revision: run.revision },
      data: {
        snapshot: serializeState(fresh) as unknown as MysqlPrisma.Prisma.InputJsonValue,
        actionLog: [] as unknown as MysqlPrisma.Prisma.InputJsonValue,
        partyConfig: (partyIds ?? null) as unknown as MysqlPrisma.Prisma.InputJsonValue,
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
      payload: { battleId: fresh.battleId, levelNumber: run.level.levelNumber, party: partyIds },
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

  // ── Owned-party resolver (#3) ───────────────────────────────────────
  //
  // The party is the intersection of the player's chosen team and the
  // heroes they actually OWN. Ownership = a user_characters row whose
  // character.codename matches a roster id, UNION the always-unlocked
  // starter set (so brand-new accounts with zero unlocks still play and
  // pre-migration accounts aren't bricked). Returns null → rotation.
  private async resolveOwnedParty(userId: bigint): Promise<readonly string[] | null> {
    // Starters are always available even without a user_characters row.
    const STARTERS = new Set(["aevra", "kyo", "lyra", "brann"]);
    const owned = new Set<string>(STARTERS);
    try {
      const rows = await this.deps.mysql.userCharacter.findMany({
        where: { userId },
        select: { character: { select: { codename: true } } },
      });
      for (const row of rows) {
        const code = row.character?.codename;
        if (code && HERO_ROSTER.some((h) => h.id === code)) owned.add(code);
      }
    } catch {
      // user_characters unreadable (fresh DB) — starters only.
    }
    const selected = await this.loadSelectedTeam(userId);
    // No preference → default to the starter trio (always owned). This
    // keeps the party owned-consistent + deterministic for replay,
    // instead of falling back to a rotation that could field unowned
    // heroes.
    const wanted = selected ?? ["aevra", "kyo", "lyra"];
    const filtered = wanted.filter((id) => owned.has(id));
    return filtered.length >= 1 ? filtered : ["aevra", "kyo", "lyra"];
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
      // Gold via direct increment. XP via applyAccountXp (#2) so
      // accountLevel is RECOMPUTED and level-up milestones fire —
      // previously a raw accountXp increment left accountLevel stuck.
      if (rewards.gold > 0) {
        await tx.profile.update({
          where: { userId },
          data: { gold: { increment: rewards.gold } },
        });
      }
      if (rewards.xp > 0) {
        await applyAccountXp(tx, userId, rewards.xp);
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
    // Rebuild from the EXACT party persisted at start time (party_config)
    // so a profile change between play + replay can't false-flag a tamper.
    const partyIds = parsePartyConfig(run.partyConfig);
    const init = synthesiseInit(ref, run.level, partyIds);
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
        partyConfig: true,
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

// Map the authored TerrainKind (game-assets) → engine BattleTerrain.
// Engine has no grass/sand/ash/ruins, so collapse those to the nearest
// mechanical equivalent (grass/sand/ash → plain, ruins → stone).
const TERRAIN_MAP: Record<string, Tile["terrain"]> = {
  grass: "plain", forest: "forest", stone: "stone", sand: "plain",
  ash: "plain", water: "water", ice: "ice", lava: "lava",
  void: "void", ruins: "stone", shrine: "shrine", wall: "wall",
};

/** Resolve an authored enemy `unit` string to an ENEMY_ARCHETYPES spec. */
const resolveEnemySpec = (unit: string): typeof ENEMY_ARCHETYPES[number] => {
  // Exact match first.
  const exact = ENEMY_ARCHETYPES.find((e) => e.unit === unit);
  if (exact) return exact;
  // Keyword heuristic for hand-authored unit names (dire_wolf, ice_wight…).
  const u = unit.toLowerCase();
  const byKw = (kw: string[], id: string): typeof ENEMY_ARCHETYPES[number] | undefined =>
    kw.some((k) => u.includes(k)) ? ENEMY_ARCHETYPES.find((e) => e.id === id) : undefined;
  return (
    byKw(["wolf", "spore", "verdant", "thorn", "druid"], "verdant_spore") ??
    byKw(["husk", "ember", "cinder", "bandit", "flame"], "ember_husk") ??
    byKw(["wraith", "ice", "wight", "frost", "shade"], "frost_wraith") ??
    byKw(["brute", "leviath", "tide", "warden", "reef"], "tide_brute") ??
    byKw(["reaper", "sky", "wind", "storm"], "sky_reaper") ??
    byKw(["stalker", "void", "null", "shadow"], "void_stalker") ??
    ENEMY_ARCHETYPES[0]! // safe default
  );
};

/**
 * Resolve the party hero specs from a list of roster IDs. Unknown IDs are
 * dropped; short lists are filled by level rotation so the party is always
 * exactly PARTY_SIZE. Deterministic given (partyIds, levelNumber).
 */
const resolvePartySpecs = (
  partyIds: readonly string[] | null,
  levelNumber: number,
): typeof HERO_ROSTER[number][] => {
  const baseIdx = Math.max(0, levelNumber - 1) % HERO_ROSTER.length;
  const specs: typeof HERO_ROSTER[number][] = [];
  for (const id of partyIds ?? []) {
    const spec = HERO_ROSTER.find((h) => h.id === id);
    if (spec && !specs.find((s) => s.id === spec.id)) specs.push(spec);
    if (specs.length >= PARTY_SIZE) break;
  }
  let pad = 0;
  while (specs.length < PARTY_SIZE && pad <= HERO_ROSTER.length) {
    const fill = HERO_ROSTER[(baseIdx + pad) % HERO_ROSTER.length]!;
    if (!specs.find((s) => s.id === fill.id)) specs.push(fill);
    pad++;
  }
  return specs;
};

const synthesiseInit = (
  ref: RunRef,
  level: { levelNumber: number; name: string },
  /** Resolved party hero IDs (already ownership-filtered by the caller).
   *  null → level rotation. */
  partyIds: readonly string[] | null = null,
): CreateBattleInput => {
  const n = level.levelNumber;
  const isBoss = n > 0 && n % 20 === 0;
  const partySpecs = resolvePartySpecs(partyIds, n);

  // ── Load authored geometry from game-assets (same source the
  // ── map-view uses, so combat matches what the player saw). ──
  const asset = findLevelByNumber(n);
  const heroSpawns: { q: number; r: number }[] = [];
  const enemySpawns: { q: number; r: number; unit?: string }[] = [];
  let tiles: Tile[];
  let width = 6;
  let height = 4;

  if (asset?.map?.tiles?.length) {
    width = asset.map.width;
    height = asset.map.height;
    tiles = asset.map.tiles.map((t) => ({
      q: t.q,
      r: t.r,
      terrain: TERRAIN_MAP[t.terrain] ?? "plain",
      elev: t.elev ?? 0,
    }));
    for (const sp of asset.map.spawns ?? []) {
      if (sp.kind === "player") heroSpawns.push({ q: sp.q, r: sp.r });
      else if (sp.kind === "enemy") {
        const wave1 = asset.encounter?.waves?.[0]?.enemies ?? [];
        const ref2 = (sp as { ref?: string }).ref;
        const matched = ref2 ? wave1.find((e) => e.id === ref2) : undefined;
        // exactOptionalPropertyTypes: only set `unit` when defined.
        enemySpawns.push(
          matched?.unit !== undefined
            ? { q: sp.q, r: sp.r, unit: matched.unit }
            : { q: sp.q, r: sp.r },
        );
      }
    }
  } else {
    // Fallback flat 6×4 grid (asset missing — shouldn't happen for 1..100).
    tiles = [];
    for (let q = 0; q < 6; q++) {
      for (let r = 0; r < 4; r++) {
        tiles.push({ q, r, terrain: "plain", elev: 0 });
      }
    }
  }

  // Default spawn positions when the asset omits them.
  if (heroSpawns.length === 0) {
    heroSpawns.push({ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 0, r: 2 });
  }
  if (enemySpawns.length === 0) {
    enemySpawns.push({ q: width - 1, r: 1 }, { q: width - 1, r: 2 });
  }

  // Ensure NO two actors share a tile and there are enough distinct
  // positions for the whole party. Authored levels may declare fewer
  // player spawns than PARTY_SIZE (level 1 has 2, party is 3), which
  // would otherwise stack heroes on one hex and break targeting.
  const passable = new Set(
    tiles
      .filter((t) => t.terrain !== "wall" && t.terrain !== "void")
      .map((t) => `${String(t.q)},${String(t.r)}`),
  );
  const used = new Set<string>();
  const claim = (q: number, r: number): boolean => {
    const k = `${String(q)},${String(r)}`;
    if (used.has(k) || !passable.has(k)) return false;
    used.add(k);
    return true;
  };
  const padSpawns = (
    list: { q: number; r: number; unit?: string }[],
    need: number,
    fromRight: boolean,
  ): void => {
    // First, de-dupe the authored spawns against already-claimed tiles.
    for (const sp of list) {
      if (!claim(sp.q, sp.r)) {
        // collided — find nearest free tile
        const free = nearestFreeTile(sp.q, sp.r, passable, used);
        if (free) { sp.q = free.q; sp.r = free.r; claim(free.q, free.r); }
      }
    }
    // Then append extra distinct tiles until we have `need`.
    let guard = 0;
    while (list.length < need && guard++ < 200) {
      const colOrder = fromRight
        ? Array.from({ length: width }, (_, i) => width - 1 - i)
        : Array.from({ length: width }, (_, i) => i);
      let placed = false;
      for (const q of colOrder) {
        for (let r = 0; r < height && !placed; r++) {
          if (claim(q, r)) { list.push({ q, r }); placed = true; }
        }
        if (placed) break;
      }
      if (!placed) break;
    }
  };
  padSpawns(heroSpawns, partySpecs.length, false);
  // Enemy spawns claimed AFTER heroes so they never overlap. Boss needs
  // only 1 position; non-boss keeps its authored count (min 1).
  padSpawns(enemySpawns, isBoss ? 1 : Math.max(1, enemySpawns.length), true);

  // ── Heroes ──
  const heroes: Actor[] = partySpecs.map((spec, i) => {
    const pos = heroSpawns[i] ?? heroSpawns[heroSpawns.length - 1]!;
    const hp = spec.hp + Math.floor(n * 1.5);
    return synthActor(
      `${spec.id}_${String(i)}`, spec.unit, "player", spec.element,
      pos, hp,
      { atk: spec.atk, def: spec.def, spd: spec.spd },
      ROLE_TO_SKILLS[spec.role],
    );
  });

  // ── Enemies ──
  const enemies: Actor[] = [];
  if (isBoss) {
    // Boss levels: one strong Void Lord at the first enemy spawn.
    const pos = enemySpawns[0] ?? { q: width - 1, r: 1 };
    const ehp = BOSS_ARCHETYPE.hp + Math.min(200, n * 5);
    enemies.push(synthActor(
      BOSS_ARCHETYPE.id, BOSS_ARCHETYPE.unit, "enemy", BOSS_ARCHETYPE.element,
      pos, ehp,
      { atk: BOSS_ARCHETYPE.atk + Math.floor(n / 2), def: BOSS_ARCHETYPE.def, spd: BOSS_ARCHETYPE.spd },
      [],
    ));
  } else {
    enemySpawns.forEach((sp, i) => {
      const spec = sp.unit
        ? resolveEnemySpec(sp.unit)
        : ENEMY_ARCHETYPES[(Math.max(0, n - 1) + i) % ENEMY_ARCHETYPES.length]!;
      const ehp = spec.hp + Math.min(120, n * 3);
      enemies.push(synthActor(
        `${spec.id}_${String(i)}`, spec.unit, "enemy", spec.element,
        { q: sp.q, r: sp.r }, ehp,
        { atk: spec.atk + Math.floor(n / 2), def: spec.def, spd: spec.spd },
        [],
      ));
    });
  }

  return {
    battleId: `run-${ref.runId.toString()}`,
    config: { width, height, turnLimit: 30, defaultApRegen: 3 },
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
/** Find the closest passable, unclaimed tile to (q,r) by ring search. */
const nearestFreeTile = (
  q: number,
  r: number,
  passable: ReadonlySet<string>,
  used: ReadonlySet<string>,
): { q: number; r: number } | null => {
  for (let radius = 1; radius <= 8; radius++) {
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dq) !== radius && Math.abs(dr) !== radius) continue;
        const nq = q + dq;
        const nr = r + dr;
        const k = `${String(nq)},${String(nr)}`;
        if (passable.has(k) && !used.has(k)) return { q: nq, r: nr };
      }
    }
  }
  return null;
};

/** Parse the run's persisted party_config JSON → hero-id array or null. */
const parsePartyConfig = (raw: unknown): readonly string[] | null => {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((x): x is string => typeof x === "string");
  return ids.length >= 1 ? ids : null;
};

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
