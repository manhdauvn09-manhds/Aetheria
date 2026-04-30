# AETHERIA — Master Schedule & Status
*Updated continuously. Each step writes its progress here.*

## Legend
- ⬜ pending · 🟨 in progress · ✅ done · ⚠️ blocked

## Top-Level Plan
| # | Step                                       | Status | %  | Notes                                            |
|---|--------------------------------------------|--------|----|--------------------------------------------------|
| 1 | Game scenario + guideline (md+pdf)         | ✅     | 100| name=Aetheria, guideline + lore done             |
| 2 | Architecture / Tech-stack / DB design      | ✅     | 100| 5 docs (arch, stack, db, fn, flows) + 5 PDFs     |
| 3 | Database schema + scripts                  | ✅     | 100| Hybrid SQLite + MySQL; Prisma schemas + SQL init |
| 4 | Coding (sub-schedule below)                | 🟨     | 0  | NEXT: write Step 4.1 sub-schedule                |
| 5 | Code review                                | ⬜     | 0  |                                                  |
| 6 | Unit + Integration tests                   | ⬜     | 0  |                                                  |
| 7 | Quality gate                               | ⬜     | 0  |                                                  |

## Step 1 — sub tasks
| # | Task                                | Status | Output                                |
|---|-------------------------------------|--------|---------------------------------------|
| 1.1 | Pick game name (<10 chars)        | ✅     | `Aetheria`                            |
| 1.2 | Write guideline MD                | ✅     | `docs/01_GAME_GUIDELINE.md`           |
| 1.3 | Generate PDF                      | ✅     | `docs/01_GAME_GUIDELINE.pdf`          |
| 1.4 | Create memory + schedule + buglist scaffolding | ✅ | `memory/`, `schedule/`, `buglist/`  |

## Step 2 — sub tasks
| # | Task                                | Status | Output                                |
|---|-------------------------------------|--------|---------------------------------------|
| 2.1 | Architecture (layers, modules, deploy) | ✅ | `docs/02_ARCHITECTURE.md/.pdf`        |
| 2.2 | Tech stack with rationale         | ✅     | `docs/02_TECH_STACK.md/.pdf`          |
| 2.3 | Database design (logical + indexing) | ✅  | `docs/02_DATABASE_DESIGN.md/.pdf`     |
| 2.4 | Function / module list            | ✅     | `docs/02_FUNCTION_LIST.md/.pdf`       |
| 2.5 | Flows: auth/save/combat/levelup/MMR/quest/raid/shop/anti-cheat/state-machine | ✅ | `docs/02_FLOWS.md/.pdf` |

## Step 3 — sub tasks
| # | Task                                                | Status | Output                                                  |
|---|-----------------------------------------------------|--------|---------------------------------------------------------|
| 3.1 | Decide DB stack (deviation from spec)             | ✅     | Hybrid SQLite (per-user) + MySQL 8 (shared)             |
| 3.2 | Prisma schema for MySQL (29 models)               | ✅     | `prisma/mysql/schema.prisma`                            |
| 3.3 | Prisma schema for SQLite (catalog cache + state)  | ✅     | `prisma/sqlite/schema.prisma`                           |
| 3.4 | Raw SQL init scripts (DDL + indexes)              | ✅     | `db/mysql/01_init.sql`, `db/sqlite/01_init.sql`         |
| 3.5 | DB bootstrap + seed                               | ✅     | `db/mysql/00_create_database.sql`, `db/mysql/02_seed.sql`, `db/sqlite/02_seed.sql` |
| 3.6 | Prisma migrations (0001_init for both)            | ✅     | `prisma/{mysql,sqlite}/migrations/0001_init/`           |
| 3.7 | Architecture explainer / runbook                  | ✅     | `db/README.md`                                          |
| 3.8 | Update MEMORY + SCHEDULE                          | ✅     | this file + `memory/MEMORY.md`                          |

## Step 4 — sub-schedule (to be expanded in Step 4.1)
*Will be filled when we reach Step 4.*

## Bug counters (rolling)
- Review:     0
- UT:         0
- IT:         0
- QualityGate: 0
