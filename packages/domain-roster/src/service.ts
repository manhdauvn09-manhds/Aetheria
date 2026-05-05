// Aetheria — RosterService.
//
// Owns the post-auth roster + skill-tree lifecycle:
//   - list             every owned UserCharacter + the catalog rows the
//                      user can / cannot still unlock.
//   - unlockCharacter  obey UnlockRequirement, then create UserCharacter.
//   - ascend           A0→A3, gated by account level.
//   - equipSkin        write `equippedSkinId` after validating ownership.
//   - getSkillTree     enumerate the character's skills + the user's
//                      invested levels + spendable SP.
//   - investSkill      raise UserSkill.level by 1 (subject to MAX_SKILL_LEVEL
//                      and SP availability).
//   - respec           wipe the user's skill rows for the character; SP
//                      are derived from account level so refund is implicit.

import { audit } from "@aetheria/core";
import { AppError } from "@aetheria/schema-api";
import type { MysqlClient, MysqlPrisma } from "@aetheria/schema-db/mysql";

import {
  MAX_ASCENSION,
  MAX_SKILL_LEVEL,
  ascensionLevelGate,
  canUnlock,
  parseUnlockRequirement,
  skillPointsForLevel,
  totalSpSpent,
} from "./rules.js";
import type {
  AscensionTier,
  RosterAscendInput,
  RosterCharacter,
  RosterEntry,
  RosterEquipSkinInput,
  RosterListResult,
  RosterUnlockInput,
  SkillTreeView,
  SkillsInvestInput,
  SkillsRespecInput,
  SkillsTreeInput,
} from "./types.js";

/**
 * Subset of the Prisma client this service touches. Narrowing the
 * dependency keeps unit-tests easy to mock and prevents accidental
 * coupling to unrelated tables.
 */
export type RosterMysqlClient = Pick<
  MysqlClient,
  | "character"
  | "userCharacter"
  | "skill"
  | "userSkill"
  | "inventory"
  | "item"
  | "profile"
  | "$transaction"
>;

export interface RosterDeps {
  readonly mysql: RosterMysqlClient;
}

const toAscensionTier = (n: number): AscensionTier => {
  if (n <= 0) return 0;
  if (n >= MAX_ASCENSION) return MAX_ASCENSION;
  return n as AscensionTier;
};

export class RosterService {
  constructor(private readonly deps: RosterDeps) {}

  // ── Roster ────────────────────────────────────────────────────────

  async list(userId: bigint): Promise<RosterListResult> {
    const [profile, owned, catalog] = await Promise.all([
      this.deps.mysql.profile.findUnique({
        where: { userId },
        select: { accountLevel: true },
      }),
      this.deps.mysql.userCharacter.findMany({
        where: { userId },
        include: {
          character: {
            select: {
              id: true,
              codename: true,
              name: true,
              class: true,
              role: true,
              unlockRequirement: true,
            },
          },
        },
        orderBy: { unlockedAt: "asc" },
      }),
      this.deps.mysql.character.findMany({
        select: {
          id: true,
          codename: true,
          name: true,
          class: true,
          role: true,
          unlockRequirement: true,
        },
        orderBy: { id: "asc" },
      }),
    ]);

    if (!profile) throw AppError.notFound("user", userId);

    const ownedIds = new Set(owned.map((u) => u.characterId.toString()));
    const ctx = {
      accountLevel: profile.accountLevel,
      completedQuests: new Set<string>(),
      pvpTier: null,
    };

    const entries: RosterEntry[] = owned.map((u) => ({
      userCharacterId: u.id.toString(),
      character: toRosterCharacter(u.character),
      ascension: toAscensionTier(u.ascension),
      characterXp: u.xp,
      equippedSkinId: u.equippedSkinId !== null ? u.equippedSkinId.toString() : null,
      unlockedAt: u.unlockedAt,
    }));

    const unlockable: RosterCharacter[] = [];
    const locked: RosterCharacter[] = [];
    for (const c of catalog) {
      if (ownedIds.has(c.id.toString())) continue;
      const view = toRosterCharacter(c);
      if (canUnlock(view.unlock, ctx).ok) unlockable.push(view);
      else locked.push(view);
    }

    return { entries, unlockable, locked };
  }

  async unlockCharacter(input: RosterUnlockInput): Promise<RosterEntry> {
    const { userId, characterId } = input;

    const [profile, character, existing] = await Promise.all([
      this.deps.mysql.profile.findUnique({
        where: { userId },
        select: { accountLevel: true },
      }),
      this.deps.mysql.character.findUnique({
        where: { id: characterId },
        select: {
          id: true,
          codename: true,
          name: true,
          class: true,
          role: true,
          unlockRequirement: true,
        },
      }),
      this.deps.mysql.userCharacter.findUnique({
        where: { userId_characterId: { userId, characterId } },
        select: { id: true },
      }),
    ]);

    if (!profile) throw AppError.notFound("user", userId);
    if (!character) throw AppError.notFound("character", characterId);
    if (existing) throw AppError.conflict("Character already unlocked");

    const view = toRosterCharacter(character);
    const evaluation = canUnlock(view.unlock, {
      accountLevel: profile.accountLevel,
      completedQuests: new Set<string>(),
      pvpTier: null,
    });
    if (!evaluation.ok) {
      throw AppError.forbidden("Unlock requirement not met", { reason: evaluation.reason });
    }

    const created = await this.deps.mysql.userCharacter.create({
      data: { userId, characterId, ascension: 0, xp: 0 },
      select: { id: true, ascension: true, xp: true, equippedSkinId: true, unlockedAt: true },
    });

    await audit.write({
      actor: userId,
      action: "roster.character.unlock",
      targetType: "character",
      targetId: characterId,
      payload: { codename: character.codename },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      userCharacterId: created.id.toString(),
      character: view,
      ascension: toAscensionTier(created.ascension),
      characterXp: created.xp,
      equippedSkinId: created.equippedSkinId !== null ? created.equippedSkinId.toString() : null,
      unlockedAt: created.unlockedAt,
    };
  }

  async ascend(input: RosterAscendInput): Promise<RosterEntry> {
    const { userId, userCharacterId } = input;

    const [profile, owned] = await Promise.all([
      this.deps.mysql.profile.findUnique({
        where: { userId },
        select: { accountLevel: true },
      }),
      this.deps.mysql.userCharacter.findUnique({
        where: { id: userCharacterId },
        include: {
          character: {
            select: {
              id: true,
              codename: true,
              name: true,
              class: true,
              role: true,
              unlockRequirement: true,
            },
          },
        },
      }),
    ]);

    if (!profile) throw AppError.notFound("user", userId);
    if (!owned) throw AppError.notFound("userCharacter", userCharacterId);
    if (owned.userId !== userId) throw AppError.forbidden("Not the owner of this character");

    if (owned.ascension >= MAX_ASCENSION) {
      throw AppError.conflict("Character is already at MAX_ASCENSION", { ascension: MAX_ASCENSION });
    }
    const targetTier = (owned.ascension + 1) as AscensionTier;
    const gate = ascensionLevelGate(targetTier);
    if (profile.accountLevel < gate) {
      throw AppError.forbidden("Account level too low for this ascension tier", {
        currentLevel: profile.accountLevel,
        requiredLevel: gate,
        targetTier,
      });
    }

    const updated = await this.deps.mysql.userCharacter.update({
      where: { id: userCharacterId },
      data: { ascension: targetTier },
      select: { id: true, ascension: true, xp: true, equippedSkinId: true, unlockedAt: true },
    });

    await audit.write({
      actor: userId,
      action: "roster.character.ascend",
      targetType: "userCharacter",
      targetId: userCharacterId,
      payload: { from: owned.ascension, to: targetTier },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      userCharacterId: updated.id.toString(),
      character: toRosterCharacter(owned.character),
      ascension: toAscensionTier(updated.ascension),
      characterXp: updated.xp,
      equippedSkinId: updated.equippedSkinId !== null ? updated.equippedSkinId.toString() : null,
      unlockedAt: updated.unlockedAt,
    };
  }

  async equipSkin(input: RosterEquipSkinInput): Promise<RosterEntry> {
    const { userId, userCharacterId, skinItemId } = input;

    const owned = await this.deps.mysql.userCharacter.findUnique({
      where: { id: userCharacterId },
      include: {
        character: {
          select: {
            id: true,
            codename: true,
            name: true,
            class: true,
            role: true,
            unlockRequirement: true,
          },
        },
      },
    });
    if (!owned) throw AppError.notFound("userCharacter", userCharacterId);
    if (owned.userId !== userId) throw AppError.forbidden("Not the owner of this character");

    if (skinItemId !== null) {
      const inventory = await this.deps.mysql.inventory.findUnique({
        where: { userId_itemId: { userId, itemId: skinItemId } },
        include: { item: { select: { id: true, type: true } } },
      });
      if (!inventory || inventory.quantity <= 0) {
        throw AppError.forbidden("Skin not in inventory", { itemId: skinItemId.toString() });
      }
      if (inventory.item.type !== "skin" && inventory.item.type !== "cosmetic") {
        throw AppError.badRequest("Item is not a skin", { type: inventory.item.type });
      }
    }

    const updated = await this.deps.mysql.userCharacter.update({
      where: { id: userCharacterId },
      data: { equippedSkinId: skinItemId },
      select: { id: true, ascension: true, xp: true, equippedSkinId: true, unlockedAt: true },
    });

    await audit.write({
      actor: userId,
      action: "roster.character.equipSkin",
      targetType: "userCharacter",
      targetId: userCharacterId,
      payload: { skinItemId: skinItemId !== null ? skinItemId.toString() : null },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      userCharacterId: updated.id.toString(),
      character: toRosterCharacter(owned.character),
      ascension: toAscensionTier(updated.ascension),
      characterXp: updated.xp,
      equippedSkinId: updated.equippedSkinId !== null ? updated.equippedSkinId.toString() : null,
      unlockedAt: updated.unlockedAt,
    };
  }

  // ── Skill tree ────────────────────────────────────────────────────

  async getSkillTree(input: SkillsTreeInput): Promise<SkillTreeView> {
    const { userId, userCharacterId } = input;

    const owned = await this.deps.mysql.userCharacter.findUnique({
      where: { id: userCharacterId },
      select: { id: true, userId: true, characterId: true },
    });
    if (!owned) throw AppError.notFound("userCharacter", userCharacterId);
    if (owned.userId !== userId) throw AppError.forbidden("Not the owner of this character");

    const profile = await this.deps.mysql.profile.findUnique({
      where: { userId },
      select: { accountLevel: true },
    });
    if (!profile) throw AppError.notFound("user", userId);

    const [skills, userSkills] = await Promise.all([
      this.deps.mysql.skill.findMany({
        where: { characterId: owned.characterId },
        select: { id: true, name: true, type: true, apCost: true, cooldown: true },
        orderBy: { id: "asc" },
      }),
      this.deps.mysql.userSkill.findMany({
        where: { userId, skill: { characterId: owned.characterId } },
        select: { skillId: true, level: true },
      }),
    ]);

    const investedById = new Map(userSkills.map((u) => [u.skillId.toString(), u.level]));
    const nodes = skills.map((s) => {
      const investedLevel = investedById.get(s.id.toString()) ?? 0;
      return {
        skillId: s.id.toString(),
        name: s.name,
        type: toSkillType(s.type),
        apCost: s.apCost,
        cooldown: s.cooldown,
        investedLevel,
        maxLevel: MAX_SKILL_LEVEL,
      };
    });

    const skillPointsTotal = skillPointsForLevel(profile.accountLevel);
    const skillPointsSpent = totalSpSpent(nodes.map((n) => ({ level: n.investedLevel })));
    const skillPointsAvailable = Math.max(0, skillPointsTotal - skillPointsSpent);

    return {
      characterId: owned.characterId.toString(),
      userCharacterId: owned.id.toString(),
      nodes,
      skillPointsAvailable,
      skillPointsTotal,
      skillPointsSpent,
    };
  }

  async investSkill(input: SkillsInvestInput): Promise<SkillTreeView> {
    const { userId, userCharacterId, skillId } = input;

    const [owned, profile, skill] = await Promise.all([
      this.deps.mysql.userCharacter.findUnique({
        where: { id: userCharacterId },
        select: { id: true, userId: true, characterId: true },
      }),
      this.deps.mysql.profile.findUnique({
        where: { userId },
        select: { accountLevel: true },
      }),
      this.deps.mysql.skill.findUnique({
        where: { id: skillId },
        select: { id: true, characterId: true },
      }),
    ]);
    if (!owned) throw AppError.notFound("userCharacter", userCharacterId);
    if (owned.userId !== userId) throw AppError.forbidden("Not the owner of this character");
    if (!profile) throw AppError.notFound("user", userId);
    if (!skill) throw AppError.notFound("skill", skillId);
    if (skill.characterId !== owned.characterId) {
      throw AppError.badRequest("Skill does not belong to this character");
    }

    const skillPointsTotal = skillPointsForLevel(profile.accountLevel);

    await this.deps.mysql.$transaction(
      async (tx: MysqlPrisma.Prisma.TransactionClient) => {
        const allUserSkills = await tx.userSkill.findMany({
          where: { userId, skill: { characterId: owned.characterId } },
          select: { skillId: true, level: true },
        });
        const spent = totalSpSpent(allUserSkills.map((u) => ({ level: u.level })));
        const available = skillPointsTotal - spent;
        if (available <= 0) {
          throw AppError.forbidden("No skill points available", {
            skillPointsTotal,
            skillPointsSpent: spent,
          });
        }

        const current = allUserSkills.find((u) => u.skillId === skillId)?.level ?? 0;
        if (current >= MAX_SKILL_LEVEL) {
          throw AppError.conflict("Skill is already at MAX_SKILL_LEVEL", {
            maxLevel: MAX_SKILL_LEVEL,
          });
        }

        await tx.userSkill.upsert({
          where: { userId_skillId: { userId, skillId } },
          create: { userId, skillId, level: 1 },
          update: { level: { increment: 1 } },
        });
      },
    );

    await audit.write({
      actor: userId,
      action: "skills.invest",
      targetType: "skill",
      targetId: skillId,
      payload: { userCharacterId: userCharacterId.toString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return this.getSkillTree({ userId, userCharacterId });
  }

  async respec(input: SkillsRespecInput): Promise<SkillTreeView> {
    const { userId, userCharacterId } = input;

    const owned = await this.deps.mysql.userCharacter.findUnique({
      where: { id: userCharacterId },
      select: { id: true, userId: true, characterId: true },
    });
    if (!owned) throw AppError.notFound("userCharacter", userCharacterId);
    if (owned.userId !== userId) throw AppError.forbidden("Not the owner of this character");

    await this.deps.mysql.userSkill.deleteMany({
      where: { userId, skill: { characterId: owned.characterId } },
    });

    await audit.write({
      actor: userId,
      action: "skills.respec",
      targetType: "userCharacter",
      targetId: userCharacterId,
      payload: { characterId: owned.characterId.toString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return this.getSkillTree({ userId, userCharacterId });
  }
}

const toRosterCharacter = (c: {
  id: bigint;
  codename: string;
  name: string;
  class: string;
  role: string;
  unlockRequirement: unknown;
}): RosterCharacter => ({
  characterId: c.id.toString(),
  codename: c.codename,
  name: c.name,
  class: c.class,
  role: c.role,
  unlock: parseUnlockRequirement(c.unlockRequirement),
});

const toSkillType = (raw: string): "active" | "passive" =>
  raw === "passive" ? "passive" : "active";
