// Aetheria — roster + skill-tree domain types.
//
// Pure data shapes. The service layer (`service.ts`) maps Prisma rows into
// these and the router (`router.ts`) serialises BigInts → string.

import type { Level } from "@aetheria/domain-progression";

/** A0..A3 — see GAME_GUIDELINE §8 "Character ascension". */
export type AscensionTier = 0 | 1 | 2 | 3;

/**
 * Discriminated union encoded in `characters.unlock_requirement` JSON.
 * Spec from `docs/01_GAME_GUIDELINE.md` §5: characters unlock via
 * default ownership, account-level quests, or PvP rank gates.
 */
export type UnlockRequirement =
  | { readonly kind: "default" }
  | { readonly kind: "account_level"; readonly level: Level }
  | { readonly kind: "quest"; readonly questId: string }
  | { readonly kind: "pvp_rank"; readonly tier: string }
  | { readonly kind: "secret" };

export interface RosterCharacter {
  readonly characterId: string;
  readonly codename: string;
  readonly name: string;
  readonly class: string;
  readonly role: string;
  /** Server-canonical unlock rule for the catalog row. */
  readonly unlock: UnlockRequirement;
}

export interface RosterEntry {
  readonly userCharacterId: string;
  readonly character: RosterCharacter;
  readonly ascension: AscensionTier;
  readonly characterXp: number;
  readonly equippedSkinId: string | null;
  readonly unlockedAt: Date;
}

export interface RosterListResult {
  readonly entries: readonly RosterEntry[];
  /** Catalog rows the user *can* unlock right now. */
  readonly unlockable: readonly RosterCharacter[];
  /** Catalog rows that exist but are still locked behind unmet requirements. */
  readonly locked: readonly RosterCharacter[];
}

export interface SkillNode {
  readonly skillId: string;
  readonly name: string;
  readonly type: "active" | "passive";
  readonly apCost: number;
  readonly cooldown: number;
  /** Player-invested level (0 if not unlocked). */
  readonly investedLevel: number;
  /** Hard cap from `MAX_SKILL_LEVEL`. */
  readonly maxLevel: number;
}

export interface SkillTreeView {
  readonly characterId: string;
  readonly userCharacterId: string;
  readonly nodes: readonly SkillNode[];
  readonly skillPointsAvailable: number;
  readonly skillPointsTotal: number;
  readonly skillPointsSpent: number;
}

export interface RosterUnlockInput {
  readonly userId: bigint;
  readonly characterId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface RosterAscendInput {
  readonly userId: bigint;
  readonly userCharacterId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface RosterEquipSkinInput {
  readonly userId: bigint;
  readonly userCharacterId: bigint;
  /** `null` to unequip. Otherwise must be an Item with `type = "skin"` owned by the user. */
  readonly skinItemId: bigint | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface SkillsTreeInput {
  readonly userId: bigint;
  readonly userCharacterId: bigint;
}

export interface SkillsInvestInput {
  readonly userId: bigint;
  readonly userCharacterId: bigint;
  readonly skillId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface SkillsRespecInput {
  readonly userId: bigint;
  readonly userCharacterId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}
