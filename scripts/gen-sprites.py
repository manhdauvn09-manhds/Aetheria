#!/usr/bin/env python3
"""Generate 15 character SVG sprites (8 heroes + 6 enemies + 1 boss).

Output: apps/web/public/sprites/*.svg
Each SVG is 128x128 with a stylized silhouette + element-tinted accents.
Pixi loads them via Assets.load(url) and renders as Sprites.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps" / "web" / "public" / "sprites"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Color palette ─────────────────────────────────────────────────────
# Side fill = main body color. Accent = element-tinted weapon/feature.
SIDE = {"player": "#3aa0ff", "enemy": "#d6463f"}

ELEMENT = {
    "ember":   "#ff7a3a",
    "frost":   "#a8d5e2",
    "verdant": "#6cd66c",
    "tide":    "#4fb6c0",
    "sky":     "#b6c7ff",
    "void":    "#c59cff",
}

# ── SVG building blocks ───────────────────────────────────────────────
# Each character: body + head + 1-2 distinguishing features. Drawn from
# scratch with paths so the file stays under 2KB each.

def svg(content: str, w: int = 128, h: int = 128) -> str:
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" shape-rendering="geometricPrecision">\n'
        f'{content}\n'
        f'</svg>\n'
    )

def gradient(name: str, start: str, end: str) -> str:
    return (
        f'  <defs><radialGradient id="{name}" cx="0.5" cy="0.4" r="0.6">'
        f'<stop offset="0%" stop-color="{start}"/>'
        f'<stop offset="100%" stop-color="{end}"/></radialGradient></defs>'
    )

def darken(hex_color: str, factor: float = 0.6) -> str:
    """Crude RGB darken by factor (0..1)."""
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    r = int(r * factor)
    g = int(g * factor)
    b = int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"

# ── Per-archetype renderers ───────────────────────────────────────────
# Each returns SVG inner content. All assume 128×128 canvas centered.

def hero_swordsman(elem: str) -> str:
    """Aevra — fast DPS, sword raised."""
    body = SIDE["player"]; accent = ELEMENT[elem]; dark = darken(body)
    return svg(
        gradient("aevra", body, dark)
        + f'\n  <!-- shadow -->\n  <ellipse cx="64" cy="120" rx="28" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- cloak -->\n  <path d="M30 64 Q40 100 64 110 Q88 100 98 64 L94 116 Q64 122 34 116 Z" fill="{dark}"/>'
        + f'\n  <!-- body -->\n  <ellipse cx="64" cy="78" rx="22" ry="28" fill="url(#aevra)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="40" r="16" fill="#f4d4a0" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- hood -->\n  <path d="M48 38 Q48 24 64 22 Q80 24 80 38 L78 32 Q64 26 50 32 Z" fill="{dark}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- eyes -->\n  <circle cx="58" cy="42" r="1.6" fill="#000"/><circle cx="70" cy="42" r="1.6" fill="#000"/>'
        + f'\n  <!-- sword blade -->\n  <path d="M96 76 L114 16 L118 18 L102 80 Z" fill="#e8e8ee" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- crossguard -->\n  <rect x="92" y="74" width="20" height="6" fill="#8b5e3c" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- hilt -->\n  <rect x="98" y="80" width="8" height="14" fill="#5a3a20" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- element gem -->\n  <circle cx="102" cy="74" r="3" fill="{accent}" stroke="#000" stroke-width="0.5"/>'
    )

def hero_tank(elem: str) -> str:
    """Kyo — bruiser, holds large shield."""
    body = SIDE["player"]; accent = ELEMENT[elem]; dark = darken(body)
    return svg(
        gradient("kyo", body, dark)
        + f'\n  <ellipse cx="64" cy="120" rx="32" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- broad body -->\n  <rect x="40" y="56" width="48" height="50" rx="10" fill="url(#kyo)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="40" r="17" fill="#d4a980" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- topknot -->\n  <path d="M58 20 Q64 12 70 20 L66 28 Q64 26 62 28 Z" fill="#2a1a14"/>'
        + f'\n  <!-- eyes -->\n  <path d="M55 42 L62 42" stroke="#000" stroke-width="2"/><path d="M66 42 L73 42" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- big shield (left side) -->\n  <path d="M14 50 Q14 38 22 36 L36 36 Q44 38 44 50 L44 92 Q30 102 14 92 Z" fill="{dark}" stroke="#000" stroke-width="2.5"/>'
        + f'\n  <!-- shield cross -->\n  <rect x="26" y="56" width="6" height="32" fill="{accent}"/>'
        + f'\n  <rect x="16" y="68" width="26" height="6" fill="{accent}"/>'
        + f'\n  <!-- sword on right -->\n  <rect x="92" y="62" width="4" height="40" fill="#888" stroke="#000" stroke-width="1"/>'
        + f'\n  <rect x="86" y="100" width="16" height="4" fill="#5a3a20" stroke="#000" stroke-width="0.5"/>'
    )

def hero_mage(elem: str) -> str:
    """Lyra — robed mage with staff."""
    body = SIDE["player"]; accent = ELEMENT[elem]; dark = darken(body)
    return svg(
        gradient("lyra", body, dark)
        + f'\n  <ellipse cx="64" cy="120" rx="26" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- robe -->\n  <path d="M44 60 Q44 80 36 110 L92 110 Q84 80 84 60 Q74 50 64 50 Q54 50 44 60 Z" fill="url(#lyra)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- robe folds -->\n  <path d="M50 70 L48 100 M64 72 L64 108 M78 70 L80 100" stroke="{dark}" stroke-width="1" fill="none" opacity=".6"/>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="38" r="14" fill="#f0d6b8" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- pointy hat -->\n  <path d="M50 30 L64 6 L78 30 Q64 32 50 30 Z" fill="{dark}" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- hat band -->\n  <rect x="48" y="28" width="32" height="4" fill="{accent}" stroke="#000" stroke-width="1"/>'
        + f'\n  <!-- eyes -->\n  <circle cx="59" cy="40" r="1.4" fill="#000"/><circle cx="69" cy="40" r="1.4" fill="#000"/>'
        + f'\n  <!-- staff -->\n  <rect x="96" y="40" width="3" height="80" fill="#6a4520" stroke="#000" stroke-width="1"/>'
        + f'\n  <!-- staff orb -->\n  <circle cx="97" cy="34" r="7" fill="{accent}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <circle cx="95" cy="32" r="2" fill="#fff" opacity=".7"/>'
    )

def hero_guardian(elem: str) -> str:
    """Brann — earthwarden, huge shield + plate armor."""
    body = SIDE["player"]; accent = ELEMENT[elem]; dark = darken(body)
    return svg(
        gradient("brann", body, dark)
        + f'\n  <ellipse cx="64" cy="120" rx="34" ry="6" fill="#000" opacity=".3"/>'
        + f'\n  <!-- plate body -->\n  <rect x="34" y="52" width="60" height="58" rx="6" fill="url(#brann)" stroke="#000" stroke-width="2.5"/>'
        + f'\n  <!-- plate seams -->\n  <line x1="64" y1="52" x2="64" y2="110" stroke="{dark}" stroke-width="1"/>'
        + f'\n  <line x1="34" y1="78" x2="94" y2="78" stroke="{dark}" stroke-width="1"/>'
        + f'\n  <!-- helmet -->\n  <path d="M48 36 Q48 22 64 20 Q80 22 80 36 L80 48 L48 48 Z" fill="{dark}" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- visor slit -->\n  <rect x="54" y="36" width="20" height="3" fill="{accent}"/>'
        + f'\n  <!-- emblem on chest -->\n  <circle cx="64" cy="78" r="9" fill="{accent}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <path d="M60 74 L68 82 M68 74 L60 82" stroke="{dark}" stroke-width="2"/>'
        + f'\n  <!-- hammer (right hand) -->\n  <rect x="100" y="64" width="4" height="46" fill="#5a3a20" stroke="#000" stroke-width="1"/>'
        + f'\n  <rect x="92" y="56" width="20" height="14" rx="3" fill="#777" stroke="#000" stroke-width="1.5"/>'
    )

def hero_healer(elem: str) -> str:
    """Mira — healer in white robe with cross."""
    body = "#e8e8f0"; accent = ELEMENT[elem]; dark = "#a8a8b8"
    return svg(
        gradient("mira", "#fff", dark)
        + f'\n  <ellipse cx="64" cy="120" rx="26" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <path d="M44 60 Q44 80 38 110 L90 110 Q84 80 84 60 Q74 50 64 50 Q54 50 44 60 Z" fill="url(#mira)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- chest cross -->\n  <rect x="60" y="68" width="8" height="28" fill="{accent}" stroke="#000" stroke-width="1"/>'
        + f'\n  <rect x="50" y="76" width="28" height="8" fill="{accent}" stroke="#000" stroke-width="1"/>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="38" r="14" fill="#f0d6b8" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- veil -->\n  <path d="M50 28 Q50 18 64 16 Q78 18 78 28 L76 40 Q64 42 52 40 Z" fill="{dark}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- eyes -->\n  <circle cx="59" cy="40" r="1.4" fill="#000"/><circle cx="69" cy="40" r="1.4" fill="#000"/>'
        + f'\n  <!-- aura glow halo -->\n  <circle cx="64" cy="38" r="20" fill="none" stroke="{accent}" stroke-width="1" opacity=".5"/>'
        + f'\n  <!-- healing wisps -->\n  <circle cx="42" cy="70" r="3" fill="{accent}" opacity=".7"/>'
        + f'\n  <circle cx="92" cy="80" r="3" fill="{accent}" opacity=".7"/>'
        + f'\n  <circle cx="86" cy="64" r="2" fill="{accent}" opacity=".6"/>'
    )

def hero_rogue(elem: str) -> str:
    """Vex — assassin with dual daggers."""
    body = SIDE["player"]; accent = ELEMENT[elem]; dark = darken(body, 0.4)
    return svg(
        gradient("vex", body, dark)
        + f'\n  <ellipse cx="64" cy="122" rx="22" ry="4" fill="#000" opacity=".3"/>'
        + f'\n  <!-- slim body -->\n  <path d="M50 56 Q48 80 52 110 L76 110 Q80 80 78 56 Q72 48 64 48 Q56 48 50 56 Z" fill="url(#vex)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- belt -->\n  <rect x="46" y="78" width="36" height="4" fill="{dark}"/>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="38" r="13" fill="#d8b896" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- mask -->\n  <rect x="48" y="36" width="32" height="6" fill="{dark}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- mask eyes -->\n  <ellipse cx="58" cy="39" rx="2.5" ry="1.5" fill="{accent}"/>'
        + f'\n  <ellipse cx="70" cy="39" rx="2.5" ry="1.5" fill="{accent}"/>'
        + f'\n  <!-- left dagger -->\n  <path d="M30 88 L18 60 L22 58 L34 86 Z" fill="#e8e8ee" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <rect x="28" y="84" width="10" height="4" fill="#5a3a20"/>'
        + f'\n  <!-- right dagger -->\n  <path d="M94 88 L110 60 L106 58 L92 86 Z" fill="#e8e8ee" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <rect x="90" y="84" width="10" height="4" fill="#5a3a20"/>'
    )

def hero_support(elem: str) -> str:
    """Solen — sunoracle, golden circlet, orb."""
    body = "#f8e0a0"; accent = ELEMENT[elem]; dark = "#c8a050"
    return svg(
        gradient("solen", body, dark)
        + f'\n  <ellipse cx="64" cy="120" rx="26" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- robe -->\n  <path d="M44 60 Q44 84 40 110 L88 110 Q84 84 84 60 Q74 50 64 50 Q54 50 44 60 Z" fill="url(#solen)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- sun emblem -->\n  <circle cx="64" cy="78" r="10" fill="{accent}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <g stroke="{accent}" stroke-width="2">'
        + f'<line x1="64" y1="64" x2="64" y2="60"/><line x1="64" y1="92" x2="64" y2="96"/>'
        + f'<line x1="50" y1="78" x2="46" y2="78"/><line x1="78" y1="78" x2="82" y2="78"/>'
        + f'<line x1="54" y1="68" x2="51" y2="65"/><line x1="74" y1="68" x2="77" y2="65"/>'
        + f'<line x1="54" y1="88" x2="51" y2="91"/><line x1="74" y1="88" x2="77" y2="91"/></g>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="38" r="14" fill="#f0d6b8" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- circlet -->\n  <path d="M50 30 Q64 24 78 30 L76 34 Q64 30 52 34 Z" fill="{accent}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <circle cx="64" cy="28" r="3" fill="{accent}" stroke="#000" stroke-width="1"/>'
        + f'\n  <!-- eyes -->\n  <circle cx="59" cy="40" r="1.4" fill="#000"/><circle cx="69" cy="40" r="1.4" fill="#000"/>'
        + f'\n  <!-- orb in hand -->\n  <circle cx="100" cy="78" r="7" fill="{accent}" opacity=".85" stroke="#000" stroke-width="1"/>'
    )

def hero_wildcard(elem: str) -> str:
    """Null — voidchild with mask, swirling cloak."""
    body = "#2a2a3a"; accent = ELEMENT[elem]; dark = "#14141a"
    return svg(
        gradient("null", body, dark)
        + f'\n  <ellipse cx="64" cy="120" rx="28" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- cloak (jagged hem) -->\n  <path d="M36 56 L32 110 L40 100 L48 110 L56 102 L64 112 L72 102 L80 110 L88 100 L96 110 L92 56 Q64 44 36 56 Z" fill="url(#null)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- inner robe swirl -->\n  <path d="M48 70 Q64 76 80 70 Q70 92 64 96 Q58 92 48 70 Z" fill="{accent}" opacity=".4"/>'
        + f'\n  <!-- head -->\n  <circle cx="64" cy="40" r="15" fill="#1a1a24" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- mask (full face void) -->\n  <ellipse cx="64" cy="40" rx="13" ry="11" fill="#0a0a14"/>'
        + f'\n  <!-- glowing eyes -->\n  <ellipse cx="58" cy="40" rx="3" ry="2" fill="{accent}"/>'
        + f'\n  <ellipse cx="70" cy="40" rx="3" ry="2" fill="{accent}"/>'
        + f'\n  <!-- third-eye sigil -->\n  <circle cx="64" cy="30" r="2" fill="{accent}"/>'
        + f'\n  <!-- void wisps -->\n  <circle cx="38" cy="74" r="2" fill="{accent}" opacity=".5"/>'
        + f'\n  <circle cx="90" cy="80" r="2" fill="{accent}" opacity=".5"/>'
    )

# ── Enemy archetypes ──────────────────────────────────────────────────

def enemy_wraith() -> str:
    """Frost Wraith — translucent ghost with frost crown."""
    body = SIDE["enemy"]; accent = ELEMENT["frost"]
    return svg(
        gradient("wraith", body, darken(body))
        + f'\n  <ellipse cx="64" cy="122" rx="26" ry="4" fill="#000" opacity=".25"/>'
        + f'\n  <!-- ghostly bottom -->\n  <path d="M36 50 L36 100 L44 90 L52 102 L60 92 L68 102 L76 92 L84 102 L92 90 L92 50 Z" fill="url(#wraith)" opacity=".85" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- frost crown -->\n  <path d="M42 36 L48 26 L54 36 L60 22 L64 38 L68 22 L74 36 L80 26 L86 36 Z" fill="{accent}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- glowing eye sockets -->\n  <ellipse cx="56" cy="56" rx="5" ry="7" fill="#000"/>'
        + f'\n  <ellipse cx="72" cy="56" rx="5" ry="7" fill="#000"/>'
        + f'\n  <circle cx="56" cy="56" r="2" fill="{accent}"/>'
        + f'\n  <circle cx="72" cy="56" r="2" fill="{accent}"/>'
        + f'\n  <!-- mouth -->\n  <path d="M56 76 Q64 80 72 76" stroke="#000" stroke-width="1.5" fill="none"/>'
        + f'\n  <!-- frost wisps -->\n  <circle cx="32" cy="68" r="2" fill="{accent}" opacity=".7"/>'
        + f'\n  <circle cx="96" cy="74" r="2" fill="{accent}" opacity=".7"/>'
    )

def enemy_husk() -> str:
    """Ember Husk — cracked stone/ember body."""
    body = SIDE["enemy"]; accent = ELEMENT["ember"]
    return svg(
        gradient("husk", body, darken(body))
        + f'\n  <ellipse cx="64" cy="120" rx="32" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- chunky body -->\n  <path d="M32 56 Q28 88 36 108 L92 108 Q100 88 96 56 Q88 44 64 42 Q40 44 32 56 Z" fill="url(#husk)" stroke="#000" stroke-width="2.5"/>'
        + f'\n  <!-- cracks (ember veins) -->\n  <path d="M40 70 L52 78 L48 92 M88 64 L78 76 L84 90 M64 56 L60 86" stroke="{accent}" stroke-width="2.5" fill="none" opacity=".9"/>'
        + f'\n  <!-- eye-pits -->\n  <ellipse cx="54" cy="64" rx="5" ry="4" fill="#000"/>'
        + f'\n  <ellipse cx="74" cy="64" rx="5" ry="4" fill="#000"/>'
        + f'\n  <circle cx="54" cy="64" r="2" fill="{accent}"/>'
        + f'\n  <circle cx="74" cy="64" r="2" fill="{accent}"/>'
        + f'\n  <!-- jagged jaw -->\n  <path d="M50 82 L54 92 L58 84 L62 92 L66 84 L70 92 L74 84 L78 92" stroke="#000" stroke-width="1.5" fill="none"/>'
    )

def enemy_stalker() -> str:
    """Void Stalker — sharp triangular shadow with claws."""
    body = SIDE["enemy"]; accent = ELEMENT["void"]
    return svg(
        gradient("stalker", body, darken(body, 0.4))
        + f'\n  <ellipse cx="64" cy="124" rx="24" ry="4" fill="#000" opacity=".3"/>'
        + f'\n  <!-- triangular body -->\n  <path d="M64 30 L100 100 L28 100 Z" fill="url(#stalker)" stroke="#000" stroke-width="2.5"/>'
        + f'\n  <!-- inner glyph -->\n  <path d="M64 58 L84 92 L44 92 Z" fill="{accent}" opacity=".3"/>'
        + f'\n  <!-- eye slits -->\n  <rect x="44" y="72" width="14" height="3" fill="#ffea61" transform="rotate(-12 51 73)"/>'
        + f'\n  <rect x="70" y="72" width="14" height="3" fill="#ffea61" transform="rotate(12 77 73)"/>'
        + f'\n  <!-- mouth (jagged) -->\n  <path d="M52 88 L56 94 L60 88 L64 94 L68 88 L72 94 L76 88" stroke="#fff" stroke-width="1" fill="none"/>'
        + f'\n  <!-- claws below -->\n  <path d="M28 100 L20 116 L24 116 L30 102 M100 100 L108 116 L104 116 L98 102" fill="{darken(body, 0.4)}" stroke="#000" stroke-width="1.5"/>'
    )

def enemy_brute() -> str:
    """Tide Brute — wide squat creature with horns."""
    body = SIDE["enemy"]; accent = ELEMENT["tide"]
    return svg(
        gradient("brute", body, darken(body))
        + f'\n  <ellipse cx="64" cy="122" rx="40" ry="6" fill="#000" opacity=".3"/>'
        + f'\n  <!-- wide squat body -->\n  <rect x="24" y="56" width="80" height="58" rx="8" fill="url(#brute)" stroke="#000" stroke-width="2.5"/>'
        + f'\n  <!-- horns -->\n  <path d="M24 56 L14 30 L34 50 Z" fill="url(#brute)" stroke="#000" stroke-width="2"/>'
        + f'\n  <path d="M104 56 L114 30 L94 50 Z" fill="url(#brute)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- eyes -->\n  <circle cx="46" cy="76" r="6" fill="#000"/>'
        + f'\n  <circle cx="82" cy="76" r="6" fill="#000"/>'
        + f'\n  <circle cx="46" cy="76" r="2.5" fill="#ff3030"/>'
        + f'\n  <circle cx="82" cy="76" r="2.5" fill="#ff3030"/>'
        + f'\n  <!-- tusks -->\n  <path d="M52 96 L48 110 L54 108 Z" fill="#fff" stroke="#000" stroke-width="1"/>'
        + f'\n  <path d="M76 96 L80 110 L74 108 Z" fill="#fff" stroke="#000" stroke-width="1"/>'
        + f'\n  <!-- chest emblem -->\n  <circle cx="64" cy="90" r="5" fill="{accent}" stroke="#000" stroke-width="1"/>'
    )

def enemy_reaper() -> str:
    """Sky Reaper — winged scythe figure."""
    body = SIDE["enemy"]; accent = ELEMENT["sky"]
    return svg(
        gradient("reaper", body, darken(body))
        + f'\n  <ellipse cx="64" cy="124" rx="22" ry="4" fill="#000" opacity=".3"/>'
        + f'\n  <!-- wings -->\n  <path d="M30 50 Q14 60 8 90 L28 80 L34 70 Z" fill="{darken(body, 0.5)}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <path d="M98 50 Q114 60 120 90 L100 80 L94 70 Z" fill="{darken(body, 0.5)}" stroke="#000" stroke-width="1.5"/>'
        + f'\n  <!-- robed body -->\n  <path d="M44 46 Q40 90 50 116 L78 116 Q88 90 84 46 Q74 40 64 40 Q54 40 44 46 Z" fill="url(#reaper)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- hood -->\n  <path d="M44 46 Q44 26 64 22 Q84 26 84 46 L80 54 Q64 48 48 54 Z" fill="{darken(body)}" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- void inside hood -->\n  <ellipse cx="64" cy="50" rx="12" ry="10" fill="#000"/>'
        + f'\n  <!-- single accent eye -->\n  <circle cx="64" cy="50" r="3" fill="{accent}"/>'
        + f'\n  <!-- scythe handle (right) -->\n  <rect x="98" y="40" width="3" height="80" fill="#5a3a20" stroke="#000" stroke-width="1" transform="rotate(15 100 80)"/>'
        + f'\n  <!-- scythe blade -->\n  <path d="M88 28 Q120 30 116 60 L104 50 Q98 38 88 28 Z" fill="#e8e8ee" stroke="#000" stroke-width="1.5"/>'
    )

def enemy_spore() -> str:
    """Verdant Spore — cluster of organic bumps."""
    body = SIDE["enemy"]; accent = ELEMENT["verdant"]
    return svg(
        gradient("spore", body, darken(body))
        + f'\n  <ellipse cx="64" cy="120" rx="32" ry="5" fill="#000" opacity=".3"/>'
        + f'\n  <!-- cluster of bumps -->\n  <circle cx="64" cy="50" r="22" fill="url(#spore)" stroke="#000" stroke-width="2"/>'
        + f'\n  <circle cx="40" cy="78" r="20" fill="url(#spore)" stroke="#000" stroke-width="2"/>'
        + f'\n  <circle cx="88" cy="78" r="20" fill="url(#spore)" stroke="#000" stroke-width="2"/>'
        + f'\n  <circle cx="64" cy="98" r="18" fill="url(#spore)" stroke="#000" stroke-width="2"/>'
        + f'\n  <!-- glowing pustules -->\n  <circle cx="64" cy="44" r="5" fill="{accent}" opacity=".85"/>'
        + f'\n  <circle cx="38" cy="76" r="4" fill="{accent}" opacity=".85"/>'
        + f'\n  <circle cx="90" cy="76" r="4" fill="{accent}" opacity=".85"/>'
        + f'\n  <!-- spore puffs -->\n  <circle cx="20" cy="60" r="3" fill="{accent}" opacity=".5"/>'
        + f'\n  <circle cx="108" cy="60" r="3" fill="{accent}" opacity=".5"/>'
        + f'\n  <circle cx="64" cy="116" r="2" fill="{accent}" opacity=".5"/>'
    )

def enemy_lord() -> str:
    """Void Lord — boss tier, crowned shadow figure."""
    body = "#1a1a2a"; accent = ELEMENT["void"]
    return svg(
        gradient("lord", body, "#000")
        + f'\n  <ellipse cx="64" cy="124" rx="38" ry="6" fill="#000" opacity=".5"/>'
        + f'\n  <!-- large body -->\n  <path d="M26 60 L26 116 L40 110 L52 116 L64 110 L76 116 L88 110 L102 116 L102 60 Q64 42 26 60 Z" fill="url(#lord)" stroke="#000" stroke-width="3"/>'
        + f'\n  <!-- jagged crown -->\n  <path d="M22 50 L26 28 L38 46 L48 18 L58 44 L64 14 L70 44 L80 18 L90 46 L102 28 L106 50 Q64 40 22 50 Z" fill="url(#lord)" stroke="#000" stroke-width="2.5"/>'
        + f'\n  <!-- crown gems -->\n  <circle cx="48" cy="34" r="3" fill="{accent}"/>'
        + f'\n  <circle cx="64" cy="28" r="4" fill="{accent}"/>'
        + f'\n  <circle cx="80" cy="34" r="3" fill="{accent}"/>'
        + f'\n  <!-- giant central eye -->\n  <ellipse cx="64" cy="76" rx="20" ry="14" fill="#000"/>'
        + f'\n  <ellipse cx="64" cy="76" rx="12" ry="8" fill="{accent}"/>'
        + f'\n  <ellipse cx="64" cy="76" rx="5" ry="4" fill="#fff"/>'
        + f'\n  <circle cx="64" cy="76" r="2" fill="#000"/>'
        + f'\n  <!-- aura wisps -->\n  <circle cx="18" cy="80" r="3" fill="{accent}" opacity=".6"/>'
        + f'\n  <circle cx="110" cy="80" r="3" fill="{accent}" opacity=".6"/>'
        + f'\n  <circle cx="14" cy="100" r="2" fill="{accent}" opacity=".4"/>'
        + f'\n  <circle cx="114" cy="100" r="2" fill="{accent}" opacity=".4"/>'
    )

# ── Write all sprites ─────────────────────────────────────────────────

SPRITES = {
    "aevra.svg":         hero_swordsman("ember"),
    "kyo.svg":           hero_tank("void"),
    "lyra.svg":          hero_mage("sky"),
    "brann.svg":         hero_guardian("verdant"),
    "mira.svg":          hero_healer("verdant"),
    "vex.svg":           hero_rogue("void"),
    "solen.svg":         hero_support("sky"),
    "null.svg":          hero_wildcard("void"),
    "frost_wraith.svg":  enemy_wraith(),
    "ember_husk.svg":    enemy_husk(),
    "void_stalker.svg":  enemy_stalker(),
    "tide_brute.svg":    enemy_brute(),
    "sky_reaper.svg":    enemy_reaper(),
    "verdant_spore.svg": enemy_spore(),
    "void_lord.svg":     enemy_lord(),
}

for name, content in SPRITES.items():
    (OUT_DIR / name).write_text(content, encoding="utf-8")

print(f"wrote {len(SPRITES)} sprites to {OUT_DIR}")
