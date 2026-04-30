# AETHERIA - PROJECT MEMORY

> **Purpose**: Persistent memory file. If a session pauses/resumes, READ THIS FIRST.
> **Always update** this file at the end of every step or sub-task.

---

## Project Identity
- **Game name**: `Aetheria` (8 chars)
- **Genre**: Online Strategy + Exploration + Combat (Fantasy)
- **Target platform**: Web (browser) — desktop & mobile responsive
- **Output root (Linux)**: `/home/user/genz-web-games-factory/games/Aetheria/`
- **Output root (Windows mirror)**: `E:\SourceCode\GAMES\Aetheria\`
- **Git branch**: `claude/optimistic-fermat-Widt8`

## Folder Layout
```
games/Aetheria/
├── docs/        # design docs (md + pdf)
├── schedule/    # work breakdown, status, %
├── buglist/     # BugList.md (all bugs found)
├── memory/      # MEMORY.md (this file) + per-step notes
├── db/          # schema, migrations, seed scripts
├── src/         # source code (frontend + backend)
└── tests/       # unit + integration tests
```

## Step Status
| Step | Title                                          | Status      | %   |
|------|------------------------------------------------|-------------|-----|
| 1    | Game scenario + guideline (md+pdf)             | DONE        | 100 |
| 2    | Architecture, tech stack, DB design, flows     | DONE        | 100 |
| 3    | DB schema + scripts                            | NEXT        | 0   |
| 4    | Coding (sub-schedule + phased)                 | PENDING     | 0   |
| 5    | Code review (maintainability/security/logic)   | PENDING     | 0   |
| 6    | Unit + Integration tests (C0=100%, C1>90%)     | PENDING     | 0   |
| 7    | Quality gate report (security + SEO)           | PENDING     | 0   |

## Tomorrow's First Actions (must read on resume)
1. Pivot repo: USER WANTS Aetheria to live in **`https://github.com/manhdauvn09-manhds/Aetheria.git`**.
   - The session that paused (29 Apr 2026) had MCP scoped only to `genz-web-games-factory`,
     so commits sit at branch `claude/optimistic-fermat-Widt8` of that repo.
   - On resume, ensure GitHub MCP is configured with access to `manhdauvn09-manhds/Aetheria`.
   - Then either (a) `git remote set-url origin git@github.com:manhdauvn09-manhds/Aetheria.git`
     and push the entire `games/Aetheria/` tree as a fresh repo root, or (b) cherry-pick the commits.
2. Execute Step 3 (DB scripts) using `docs/02_DATABASE_DESIGN.md` as spec.
3. Then Step 4.1: write the coding sub-schedule (split into small chunks).

## Key Decisions
- Use TypeScript end-to-end (Next.js 15 + Node + tRPC) — to be confirmed in Step 2.
- 100 levels = data-driven (level definitions in DB / JSON), not 100 hand-coded files.
- 5–10 sample levels fully implemented; framework supports adding the rest.
- PDF generation: ReportLab (Python) on this Linux env. MD is canonical source.

## Resume Checklist (next session)
1. Read this file.
2. Read `schedule/SCHEDULE.md` for current sub-task progress.
3. Read latest `docs/*.md` and `buglist/BugList.md`.
4. Continue from the next PENDING step.
