# AETHERIA — Game Guideline & Lore Bible
*Step 1 deliverable · Source of truth for all subsequent phases*

---

## 1. Concept Pitch (Elevator)
> A thousand years after the Aether — the world's living energy — shattered into seven Shards, the realm of **Aetheria** drifts apart on floating islands. Heroes of the **Aetherbound** must explore lost continents, reclaim the Shards, outwit rival factions, and master the broken sky before the Void devours what remains.

**Core loop:** *Explore → Discover → Strategize → Battle → Loot → Level up → Compete (PvE & PvP).*

## 2. Genre & Pillars
- **Genre**: Online turn-based strategy with real-time exploration & live PvP arenas.
- **Design pillars**:
  1. **Discovery is reward** — every level hides a secret (lore fragment, rare item, hidden boss).
  2. **Mastery, not grinding** — clever party composition & terrain use beat raw stats.
  3. **Always saved, always returnable** — auto-save mid-action; resume anywhere.
  4. **Social by default** — global ranking, guilds, co-op raids, seasonal tournaments.

## 3. World & Setting
- **Setting**: High-fantasy archipelago of floating islands suspended over the Voidsea.
- **Era**: Post-Cataclysm "Age of Drift".
- **Tone**: Mystical, hopeful, with grim undertones; visually painterly (think *Octopath Traveler* x *Slay the Spire* x *Genshin Impact* lite).

### Six Realms (campaign acts, ~16 levels each)
| # | Realm            | Theme                       | Climate / Hazard          |
|---|------------------|-----------------------------|---------------------------|
| 1 | **Verdant Reach**| Awakening forests           | Bloom storms              |
| 2 | **Ember Wastes** | Volcanic ruins              | Lava tides, ash gales     |
| 3 | **Frostspire**   | Ice citadels & wraiths      | Blizzards, frozen rivers  |
| 4 | **Tideglass**    | Sunken cathedrals           | Floods, leviathans        |
| 5 | **Skyfall Vault**| Cloud fortresses, gravity   | Wind shears, anti-gravity |
| 6 | **Voidmaw**      | The shattered core          | Reality glitches          |

(Realms 1–6 = 96 levels; 4 bonus "Rift" levels reach 100.)

## 4. Story Arc (Acts)
1. **Awakening** (lvl 1–10) — protagonist Aevra wakes in a ruined shrine; learns of the Aether.
2. **Bonds** (lvl 11–25) — recruit Kyo (samurai monk), Lyra (storm mage).
3. **Betrayal** (lvl 26–45) — the Council of Thrones is fractured; one Shard is stolen.
4. **Schism** (lvl 46–70) — guilds clash; first PvP-tier unlock; rival faction "Obsidian Choir".
5. **Descent** (lvl 71–90) — into the Voidmaw; companions can permanently fall.
6. **Convergence** (lvl 91–100) — reforge the Aether; multiple endings based on choices.

## 5. Characters (initial roster of 8 — expandable via gacha-free unlock)
| Codename | Class      | Role        | Signature skill       | Unlock              |
|----------|------------|-------------|------------------------|---------------------|
| Aevra    | Aetherwalker | Hybrid DPS | *Shardstep* (teleport+strike) | Default |
| Kyo      | Bladepriest | Tank/DPS   | *Stillpoint* (parry chain)    | Lv 11 quest |
| Lyra     | Stormcaller | AoE Mage   | *Tempest Sigil*               | Lv 18 quest |
| Brann    | Earthwarden | Tank       | *Bulwark*                     | Lv 25 quest |
| Mira     | Lifebinder  | Healer     | *Verdant Pact*                | Lv 32 quest |
| Vex      | Shadowblade | Assassin   | *Voidstep*                    | Lv 40 PvP rank D |
| Solen    | Sunoracle   | Support    | *Daybreak*                    | Lv 55 raid |
| Null     | Voidchild   | Wildcard   | *Entropy*                     | Lv 80 secret |

Each character has: 4 active skills, 2 passives, 3 ascension tiers, cosmetic skins.

## 6. Combat & Strategy System
- **Grid-based** turn combat on 6×8 hex maps with elevation & elemental tiles.
- **Action Points (AP)**: 3/turn; movement, attack, skills consume AP; banked AP = 1 only.
- **Elements**: Verdant, Ember, Frost, Tide, Sky, Void. Wheel weak/strong relations.
- **Status**: Burn, Freeze, Poison, Stagger, Aether-Surge (combo trigger).
- **Combo**: Two characters chaining matching elements trigger **Resonance** (+50% dmg, AoE).

## 7. Exploration Layer
- **Overworld** = node graph per realm; nodes are: Story / Combat / Puzzle / Treasure / Boss / Hidden.
- **Discovery meter** per realm — fill 100% to unlock secret realm boss & cosmetic.
- **Dynamic events** — weather/time-of-day changes spawn rare encounters.
- **Photo Mode** — players capture vistas for social feed (engagement hook).

## 8. Progression
- **Account level** 1–100 (mirrors campaign).
- **Character ascension** A0–A3 (gear + Aether-cores).
- **Skill tree** branching: each character 12 nodes, respec at any town.
- **Loot tiers**: Common → Rare → Epic → Mythic → Aether-Forged.
- **Crafting** at Forge: combine duplicates + shards to upgrade.

## 9. Online & Social Features
- **Account system** — email/OAuth (Google, Discord). JWT sessions.
- **Cloud save** — every action snapshotted; offline edits reconciled on reconnect.
- **Live leaderboards** — Global, Regional, Guild, Friends.
- **Ranked PvP** — Bronze→Mythic, seasonal reset.
- **Guilds** — up to 30 members; guild raids weekly.
- **Co-op** — 3-player synchronous raids (Realtime via WebSocket).
- **Marketplace** — soft-currency only; no pay-to-win.
- **Chat** — global, party, guild, whisper; profanity filter + report.

## 10. Engagement & Retention Hooks
- **Daily login** rewards (7-day streak boost).
- **Weekly quests** + **Seasonal pass** (free + premium tracks; cosmetic only).
- **Mystery Caches** opened with in-game currency only.
- **Level-up surprises** every 5 levels: new mechanic (e.g. lvl 15 unlocks Photo Mode, lvl 25 unlocks Co-op).
- **Mid-realm twists** — narrative reveal at the 50% mark of each realm.
- **End-game** Endless Tower (procedural) + Weekly Rifts.

## 11. Save & Session UX (critical requirement)
- **Auto-save** triggers: turn end, node enter/exit, menu open, idle 10s.
- **Resume banner** on launch: "Continue Lv 24 — Frostspire Bridge (8 min ago)".
- **Multi-slot manual save** (3 slots) for storyline branching.
- **Seamless server sync** — local IndexedDB cache + delta to server every 30 s.

## 12. Menu Architecture (high level)
1. **Splash → Login**
2. **Main Menu**: Continue · New Journey · Codex · Multiplayer · Shop · Settings · Quit
3. **In-game HUD**: Map · Party · Inventory · Quests · Skills · Pause (auto-save indicator)
4. **End-of-mission**: Rewards · Replay · Map · Continue
5. **Settings**: Audio · Graphics (Low/Med/High) · Controls · Language · Account · Privacy

## 13. Art & Audio Direction
- **Art**: 2.5D painterly tiles + vector UI; character art = anime-influenced semi-realistic.
- **Color palette**: realm-coded (verdant green, ember crimson, frost cyan, tide indigo, sky gold, void violet).
- **VFX**: particle-rich aether effects, screen-shake on Resonance.
- **Audio**: orchestral + ethnic instruments; adaptive music intensifies in combat; SFX for every UI tap.
- **Accessibility**: colorblind palettes, dyslexia font, subtitle, reduced motion toggle.

## 14. Monetization (ethical)
- One-time premium **Founders Pack**.
- Cosmetic-only Battle Pass.
- No loot boxes affecting balance.

## 15. KPIs / Success Metrics
- D1 retention ≥ 45%, D7 ≥ 22%, D30 ≥ 10%
- Avg session ≥ 18 min
- PvP queue time < 30 s at peak
- 100-level completion rate of top 10% within 90 days

## 16. Glossary
- **Aether** — life-energy of the world.
- **Shard** — fragment of the broken Aether core.
- **Aetherbound** — heroes attuned to a Shard.
- **Resonance** — combo system trigger.
- **Drift** — server region.

---

### Hand-off contract for Step 2
This document is the **canonical scenario**. Step 2 must produce:
- Tech-stack choice that supports: realtime multiplayer, persistent saves, 100 data-driven levels, leaderboards, guilds, marketplace.
- Database that holds: users, characters, levels, runs/saves, inventory, skills, guilds, matches, leaderboards, chat logs, audit.
- Flows for: auth, save/resume, combat turn, level-up, matchmaking, ranking update.
