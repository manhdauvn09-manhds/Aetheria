#!/usr/bin/env python3
"""Rewrite packages/game-assets/src/levels.ts to import every JSON file."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS_DIR = ROOT / "packages" / "game-assets" / "levels"
LEVELS_TS = ROOT / "packages" / "game-assets" / "src" / "levels.ts"

# Discover all level files, sort by numeric prefix
files = []
for f in LEVELS_DIR.glob("*.json"):
    m = re.match(r"^(\d+)-(.+)\.json$", f.name)
    if m:
        files.append((int(m.group(1)), f.name))
files.sort()

# Build import lines + array literal
imports = []
array_items = []
for n, fname in files:
    var = f"lv{n:03d}"
    imports.append(f'import {var} from "../levels/{fname}" with {{ type: "json" }};')
    array_items.append(var)

# Group array into lines of 8 for readability
def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]

array_lines = ["  " + ", ".join(chunk) + "," for chunk in chunked(array_items, 8)]
array_lines[-1] = array_lines[-1].rstrip(",")  # trailing comma cleanup not needed in TS but neat

# Read current levels.ts
src = LEVELS_TS.read_text(encoding="utf-8")

# Replace the static import block (between schema import and `const RAW_LEVELS`)
import_block = "\n".join(imports)
new_block = f"""import {{ type Level, levelSchema }} from "./level-schema.js";

{import_block}

const RAW_LEVELS: readonly unknown[] = [
{chr(10).join(array_lines)}
];
"""

# Use regex to replace from `import { type Level` up through the closing `];` of RAW_LEVELS
pattern = re.compile(
    r"import \{ type Level.*?const RAW_LEVELS: readonly unknown\[\] = \[.*?\];",
    re.DOTALL,
)
if not pattern.search(src):
    raise SystemExit("could not find import + RAW_LEVELS block")

new_src = pattern.sub(new_block.rstrip(), src, count=1)
LEVELS_TS.write_text(new_src, encoding="utf-8")
print(f"wrote {LEVELS_TS} with {len(files)} imports")
