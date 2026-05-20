#!/usr/bin/env python3
"""Generate levels 14..100 from per-realm templates.

Output goes to packages/game-assets/levels/. Skips files that already
exist so the 13 hand-authored ones (01..13) are preserved.
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS_DIR = ROOT / "packages" / "game-assets" / "levels"

# ─── Realm templates ──────────────────────────────────────────────────

REALMS = [
    {
        "id": 1, "name": "Verdant Reach", "slug_stem": "verdant",
        "terrains": ["grass", "forest", "stone", "water", "ruins"],
        "accent": "forest", "water_cost": 3,
        "enemies": ["Verdant Spore", "Ember Husk"],
        "boss_enemy": "Tide Brute",
        "name_pool": [
            "Mossy Clearing", "Whispering Reeds", "Hollowleaf Path", "Sunlit Glade",
            "Tangled Vines", "Burrowed Roots", "Sunwood Shrine", "Bramble Maze",
            "Old Stag Watch", "Verdant Crossroads", "Mist Loom", "Lantern Falls",
            "Stoneflower Garden", "Twin Oaks", "Forgotten Watchtower",
            "Druid's Reckoning", "Bloodroot Hollow", "Aether Bloom Vale",
        ],
    },
    {
        "id": 2, "name": "Ember Wastes", "slug_stem": "ember",
        "terrains": ["stone", "ash", "lava", "ruins", "sand"],
        "accent": "lava", "water_cost": 99,
        "enemies": ["Ember Husk", "Sky Reaper"],
        "boss_enemy": "Ember Husk",
        "name_pool": [
            "Cinder Pass", "Ash Drift", "Magma Veins", "Scorch Plateau",
            "Glasswind Dunes", "Ember Spires", "Charred Caravan", "Slag Refinery",
            "Dustdevil Gulch", "Pyre Sanctum", "Lava Bridge", "Obsidian Throne",
            "Sundered Forge", "Blackrock Pit", "Crucible of Flame",
            "Wyrmsong Cradle", "Smoldering Cathedral", "Pyromancer's Tomb",
        ],
    },
    {
        "id": 3, "name": "Frostspire", "slug_stem": "frost",
        "terrains": ["ice", "stone", "water", "ruins"],
        "accent": "ice", "water_cost": 99,
        "enemies": ["Frost Wraith", "Void Stalker"],
        "boss_enemy": "Frost Wraith",
        "name_pool": [
            "Frozen Causeway", "Glacier Maw", "Wraithwall", "Cryolite Vault",
            "Snowbound Camp", "Icefang Ridge", "Aurora Span", "Blizzard Mire",
            "Frost-Glass Atrium", "Whitehorn Pass", "Howl Cavern", "Rimebound Spire",
            "Shattered Throne", "Pale Saint's Altar", "Cold Iron Bastion",
            "Glacial Choir", "The Final Drift", "Spire of First Snow",
        ],
    },
    {
        "id": 4, "name": "Tideglass", "slug_stem": "tide",
        "terrains": ["water", "stone", "ruins", "grass", "sand"],
        "accent": "water", "water_cost": 3,
        "enemies": ["Tide Brute", "Sky Reaper"],
        "boss_enemy": "Tide Brute",
        "name_pool": [
            "Coral Drift", "Sunken Causeway", "Tidehollow Reef", "Brine Halls",
            "Leviathan's Rest", "Salt Pier", "Drowning Choir", "Pearl Cathedral",
            "Stormbreak Quay", "Maelstrom Spire", "Anchor's Doom", "Reefborn Atoll",
            "Glassmaker's Forge", "Deepwatch Tower", "Coralbone Reckoning",
            "Sunken Armory", "The Whisper Vault", "Tide-Glass Sanctum",
        ],
    },
    {
        "id": 5, "name": "Voidmaw", "slug_stem": "void",
        "terrains": ["void", "ruins", "stone", "shrine", "wall"],
        "accent": "void", "water_cost": 99,
        "enemies": ["Void Stalker", "Sky Reaper"],
        "boss_enemy": "Void Stalker",
        "name_pool": [
            "Splintered Reality", "Echo Atrium", "Voidstep Maze", "Mirror Hall",
            "Null Forge", "Hollow Pact", "Reality Tear", "Silence Sanctum",
            "Aether Tomb", "Twisted Spire", "Whisper Gallery", "Forgotten Sigil",
            "Cradle of Nothing", "Anti-Light Chapel", "The Inverted Path",
            "Ouroboros Coil", "Final Mirror", "Convergence Altar",
        ],
    },
]

# ─── Per-position archetype (1..20 cycle within realm) ────────────────

LEVEL_ARCHETYPES = [
    {"idx": 1,  "type": "story",    "waves": 1, "enemy_count": 2, "label": "intro"},
    {"idx": 2,  "type": "combat",   "waves": 1, "enemy_count": 2, "label": "skirmish"},
    {"idx": 3,  "type": "combat",   "waves": 1, "enemy_count": 3, "label": "patrol"},
    {"idx": 4,  "type": "treasure", "waves": 1, "enemy_count": 2, "label": "cache",     "has_secret": True},
    {"idx": 5,  "type": "combat",   "waves": 2, "enemy_count": 3, "label": "elite"},
    {"idx": 6,  "type": "story",    "waves": 1, "enemy_count": 2, "label": "passage"},
    {"idx": 7,  "type": "combat",   "waves": 1, "enemy_count": 3, "label": "ambush"},
    {"idx": 8,  "type": "puzzle",   "waves": 1, "enemy_count": 2, "label": "puzzle",    "has_secret": True},
    {"idx": 9,  "type": "combat",   "waves": 2, "enemy_count": 4, "label": "siege"},
    {"idx": 10, "type": "boss",     "waves": 2, "enemy_count": 3, "label": "mid_boss",  "is_mid_boss": True},
    {"idx": 11, "type": "combat",   "waves": 1, "enemy_count": 3, "label": "recovery"},
    {"idx": 12, "type": "hidden",   "waves": 1, "enemy_count": 2, "label": "hidden",    "has_secret": True},
    {"idx": 13, "type": "combat",   "waves": 2, "enemy_count": 4, "label": "pressure"},
    {"idx": 14, "type": "treasure", "waves": 1, "enemy_count": 3, "label": "vault",     "has_secret": True},
    {"idx": 15, "type": "combat",   "waves": 2, "enemy_count": 4, "label": "elite2"},
    {"idx": 16, "type": "puzzle",   "waves": 1, "enemy_count": 2, "label": "puzzle2",   "has_secret": True},
    {"idx": 17, "type": "combat",   "waves": 2, "enemy_count": 4, "label": "prepare"},
    {"idx": 18, "type": "story",    "waves": 1, "enemy_count": 2, "label": "passage2"},
    {"idx": 19, "type": "combat",   "waves": 2, "enemy_count": 4, "label": "vanguard"},
    {"idx": 20, "type": "boss",     "waves": 2, "enemy_count": 4, "label": "realm_boss","is_realm_boss": True},
]


def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def difficulty_for(n: int) -> int:
    return max(1, min(10, (n + 9) // 10))


def layout_for(realm, arch):
    """Generate 6x4 tile grid with realm theme + archetype flavour."""
    T = realm["terrains"]
    accent = realm["accent"]
    label = arch["label"]

    flavour = (
        "open"     if label in ("intro", "passage", "passage2") else
        "maze"     if label in ("puzzle", "puzzle2") else
        "elevated" if label in ("elite", "elite2", "siege", "vanguard") else
        "secret"   if label in ("cache", "vault", "hidden") else
        "arena"    if label in ("mid_boss", "realm_boss") else
        "varied"
    )

    tiles = []
    for r in range(4):
        for q in range(6):
            tile = {"q": q, "r": r, "terrain": T[(q + r) % len(T)]}

            if flavour == "maze":
                if (q, r) in [(1, 0), (3, 0), (1, 3), (3, 3)]:
                    tile["terrain"] = "wall"
            elif flavour == "elevated":
                if (q in (2, 3)) and (r in (0, 1)):
                    tile["terrain"] = "stone"
                    tile["elev"] = 1
            elif flavour == "secret":
                if (q, r) in [(2, 0), (4, 3)]:
                    tile["terrain"] = "ruins"
            elif flavour == "arena":
                if (q, r) == (3, 1):
                    tile["terrain"] = "shrine"
                if (q, r) in [(0, 0), (5, 3)]:
                    tile["terrain"] = "ruins"

            # Accent sprinkle (deterministic by position)
            if (q + r * 6) % 7 == 3:
                tile["terrain"] = accent

            # Exit
            if q == 5 and r == 0:
                tile["tag"] = "exit"

            # FX flavour
            if label == "hidden" and (q + r) % 5 == 0:
                tile["fx"] = "shimmer"
            if realm["id"] == 2 and tile["terrain"] == "lava":
                tile["fx"] = "embers"
            if realm["id"] == 3 and tile["terrain"] == "ice":
                tile["fx"] = "snow"
            if realm["id"] == 5 and tile["terrain"] == "void":
                tile["fx"] = "miasma"

            tiles.append(tile)
    return tiles


def spawns_for(arch, realm):
    heroes = [
        {"kind": "player", "slot": 1, "q": 0, "r": 1},
        {"kind": "player", "slot": 2, "q": 0, "r": 2},
    ]
    positions = [(4, 1), (4, 2), (5, 1), (5, 2), (3, 1), (3, 2), (4, 3)]
    enemies = []
    for i in range(min(arch["enemy_count"], len(positions))):
        unit = realm["enemies"][i % len(realm["enemies"])]
        q, r = positions[i]
        enemies.append({
            "kind": "enemy",
            "ref": f"{slugify(unit)}-{chr(97 + i)}",
            "slot": 1,
            "q": q,
            "r": r,
        })
    return heroes + enemies


def waves_for(arch, realm, n):
    spawns = [s for s in spawns_for(arch, realm) if s["kind"] == "enemy"]
    diff = difficulty_for(n)
    waves = []
    if arch["waves"] == 1:
        waves.append({
            "index": 1,
            "enemies": [
                {
                    "id": s["ref"],
                    "unit": realm["enemies"][i % len(realm["enemies"])],
                    "level": diff,
                    "ai": "aggressive" if arch["label"].startswith("elite")
                          or arch.get("is_mid_boss") or arch.get("is_realm_boss")
                          else "patrol",
                }
                for i, s in enumerate(spawns)
            ],
        })
    else:
        half = (len(spawns) + 1) // 2
        waves.append({
            "index": 1,
            "enemies": [
                {
                    "id": s["ref"],
                    "unit": realm["enemies"][i % len(realm["enemies"])],
                    "level": diff,
                    "ai": "patrol",
                }
                for i, s in enumerate(spawns[:half])
            ],
        })
        waves.append({
            "index": 2,
            "enemies": [
                {
                    "id": s["ref"],
                    "unit": realm["enemies"][(i + half) % len(realm["enemies"])],
                    "level": diff + 1,
                    "ai": "aggressive",
                }
                for i, s in enumerate(spawns[half:])
            ],
            "trigger": {"kind": "clear", "wave": 1},
        })
    return waves


def build_level(n: int) -> dict:
    realm_idx = min(4, (n - 1) // 20)
    realm = REALMS[realm_idx]
    arch = LEVEL_ARCHETYPES[(n - 1) % 20]

    name = realm["name_pool"][(n - 1) % len(realm["name_pool"])]
    slug = f"{realm['slug_stem']}-{slugify(name)}-{n:03d}"[:48]

    is_boss = arch.get("is_realm_boss") or arch.get("is_mid_boss")
    lvl_type = "boss" if is_boss else arch["type"]

    tiles = layout_for(realm, arch)
    spawns = spawns_for(arch, realm)
    waves = waves_for(arch, realm, n)
    diff = difficulty_for(n)

    lvl = {
        "slug": slug,
        "realmId": realm["id"],
        "levelNumber": n,
        "name": name,
        "type": lvl_type,
        "difficulty": diff,
        "minAccountLevel": max(1, min(100, n - 4)),
        "version": 1,
        "map": {
            "width": 6,
            "height": 4,
            "tiles": tiles,
            "spawns": spawns,
            "exits": [{
                "q": 5, "r": 0,
                "to": "realm_hub" if arch.get("is_realm_boss") else "next",
            }],
        },
        "encounter": {
            "waves": waves,
            "scripts": [arch["label"], realm["slug_stem"]],
        },
        "rewards": {
            "xp": 60 + n * 12,
            "gold": 25 + n * 5,
            "items": [{"itemId": 100 + (n % 10), "qty": 1}] if arch.get("has_secret") else [],
            "firstClearBonus": {
                "xp": 30 + n * 5,
                "gold": 12 + n * 3,
                "items": [{"itemId": 200 + realm["id"], "qty": 1}] if arch.get("is_realm_boss") else [],
                "gems": 10 if arch.get("is_realm_boss") else 5 if arch.get("is_mid_boss") else 0,
            },
        },
    }

    if is_boss:
        lvl["encounter"]["boss"] = {
            "id": f"{realm['slug_stem']}-boss-{n}",
            "unit": "Void Lord" if arch.get("is_realm_boss") else realm["boss_enemy"],
            "level": diff + 2,
            "hpMultiplier": 2.5 if arch.get("is_realm_boss") else 1.8,
            "script": "phase_at_50" if arch.get("is_realm_boss") else "summon_at_50",
        }

    if arch.get("has_secret"):
        secret_q = 2 if arch["label"] in ("cache", "vault") else 4
        secret_r = 0 if arch["label"] in ("cache", "vault") else 3
        lvl["discoverySecrets"] = {
            "hidden": [{
                "id": f"{slug[:30]}-cache",
                "q": secret_q,
                "r": secret_r,
                "reveal": "walk" if arch["label"] == "hidden" else "search",
                "reward": {
                    "xp": 30 + n * 4,
                    "gold": 15 + n * 2,
                    "items": [],
                },
            }],
        }

    return lvl


def main():
    used_slugs = set()
    written = 0
    for n in range(14, 101):
        lvl = build_level(n)
        slug = lvl["slug"]
        # Slug uniqueness — append suffix if needed
        suffix = 0
        while slug in used_slugs:
            suffix += 1
            slug = f"{lvl['slug'][:44]}-{suffix}"
        used_slugs.add(slug)
        lvl["slug"] = slug

        # Filename: NN-<short>.json
        short = re.sub(rf"^{REALMS[min(4,(n-1)//20)]['slug_stem']}-", "", slug)
        filename = f"{n:02d}-{short[:45]}.json"
        filepath = LEVELS_DIR / filename

        if filepath.exists():
            print(f"skip {filename} (exists)", file=sys.stderr)
            continue
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(lvl, f, indent=2, ensure_ascii=False)
            f.write("\n")
        written += 1

    print(f"generated {written} levels (14..100)", file=sys.stderr)


if __name__ == "__main__":
    main()
