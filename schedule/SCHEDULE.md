# AETHERIA — Master Schedule & Status
*Updated continuously. Each step writes its progress here.*

## Legend
- ⬜ pending · 🟨 in progress · ✅ done · ⚠️ blocked

## Top-Level Plan
| # | Step                                       | Status | %  | Notes                                            |
|---|--------------------------------------------|--------|----|--------------------------------------------------|
| 1 | Game scenario + guideline (md+pdf)         | ✅     | 100| name=Aetheria, guideline + lore done             |
| 2 | Architecture / Tech-stack / DB design      | ✅     | 100| 5 docs (arch, stack, db, fn, flows) + 5 PDFs     |
| 3 | Database schema + scripts                  | 🟨     | 0  | NEXT (tomorrow): write Prisma schema + SQL init  |
| 4 | Coding (sub-schedule below)                | ⬜     | 0  |                                                  |
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

## Step 4 — sub-schedule (to be expanded in Step 4.1)
*Will be filled when we reach Step 4.*

## Bug counters (rolling)
- Review:     0
- UT:         0
- IT:         0
- QualityGate: 0
