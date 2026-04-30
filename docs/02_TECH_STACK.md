# AETHERIA — Tech Stack
*Step 2 · choices + rationale + version pin policy*

## 1. Frontend
| Concern          | Choice                          | Why                                         |
|------------------|---------------------------------|---------------------------------------------|
| Framework        | **Next.js 15** (App Router)     | SSR for SEO menus, RSC, route-based code-split |
| Language         | **TypeScript 5.6**              | end-to-end type safety with backend         |
| UI lib           | **React 19**                    | Server Components, transitions              |
| Styling          | **Tailwind CSS 4** + shadcn/ui  | utility-first, theme tokens                 |
| Game canvas      | **PixiJS 8** (WebGL/WebGPU)     | 60 fps 2.5D, sprite batching, filters       |
| Audio            | **Howler.js 2**                 | spatial audio, sprite-sheet sounds          |
| State            | **Zustand 5** + TanStack Query  | minimal boilerplate, server cache           |
| Forms / validation | **react-hook-form** + **Zod**  | shared schema with backend                  |
| i18n             | **next-intl**                   | route-based locale, ICU                     |
| PWA / Offline    | **next-pwa** + **idb**          | install-to-home, IndexedDB cache            |
| Animations       | **framer-motion**               | menu transitions                            |

## 2. Backend
| Concern        | Choice                       | Why                                         |
|----------------|------------------------------|---------------------------------------------|
| Runtime        | **Node.js 22 LTS**           | stable LTS                                  |
| HTTP framework | **Fastify 5**                | fast, schema-first, plugin model            |
| API protocol   | **tRPC 11**                  | end-to-end types, no codegen                |
| Realtime       | **Socket.IO 4** + Redis adapter | rooms, broadcasting, horizontal scale     |
| Auth           | **NextAuth.js v5 (Auth.js)**  | OAuth + email magic + JWT                   |
| ORM            | **Prisma 5**                  | type-safe, migrations, introspection        |
| Validation     | **Zod 3**                     | shared with client                          |
| Background jobs| **BullMQ 5**                 | Redis-backed cron + queues                  |
| Logging        | **pino**                     | fast structured logs                        |
| Tracing        | **OpenTelemetry SDK**         | vendor-neutral                              |
| Rate limit     | **@fastify/rate-limit**       | per IP + per user                           |
| Email          | **Resend**                   | transactional + verification                |

## 3. Data
| Layer        | Choice                                          | Why                                         |
|--------------|-------------------------------------------------|---------------------------------------------|
| RDBMS        | **PostgreSQL 16**                               | JSONB for flexible level/payload data       |
| Cache        | **Redis 7**                                     | sessions, leaderboards (ZSET), pub/sub      |
| Object store | **Cloudflare R2** (S3-compatible)               | cheap, no egress fee                        |
| Search       | Postgres FTS (later: Meilisearch)               | start simple                                |
| Analytics    | **ClickHouse** (optional later)                 | event funnels, retention                    |
| Schema mgmt  | **Prisma Migrate**                              | single source of truth                      |
| Backup       | Neon PITR (7 days) + nightly logical to R2      | RPO ≤ 5 min                                 |

## 4. DevOps
| Concern            | Choice                           |
|--------------------|----------------------------------|
| Package manager    | **pnpm 9** (workspace)           |
| Monorepo           | **Turborepo 2**                  |
| Lint               | **ESLint 9 (flat) + Prettier 3** |
| Pre-commit         | **lefthook**                     |
| CI                 | **GitHub Actions**               |
| CD                 | Vercel (web) + Fly.io (api/realtime/worker) |
| Container          | **Docker** (multi-stage)         |
| Secrets            | **Doppler** (dev) + provider env (prod) |
| Testing            | **Vitest** (unit) + **Playwright** (e2e) + **Pact** (contract) |
| Coverage           | **vitest --coverage** (target C0=100%, C1>90% per spec) |
| Error monitoring   | **Sentry**                       |
| Feature flags      | **OpenFeature** + LaunchDarkly Flagsmith fallback |

## 5. Why NOT (rejected alternatives)
- **Unity / Unreal** → heavyweight; web build is awkward; we want PWA-first.
- **Phaser** → fine for 2D, but PixiJS gives better fine-grained control + smaller bundle.
- **MongoDB** → relational integrity matters (inventory, ranking); JSONB in Postgres covers flex needs.
- **Express** → slower; Fastify is the modern default.
- **GraphQL** → overhead unjustified; tRPC fits a single TS team better.
- **Kafka** → too heavy for current scale; BullMQ + Redis pubsub is enough until 100 k DAU.

## 6. Version pin policy
- All major versions pinned in `package.json` (no `^` for majors).
- Renovate bot opens PRs weekly; CI must pass before merge.
- Node + pnpm versions pinned in `.nvmrc`, `package.json#packageManager`, and Dockerfile.

## 7. Browser support matrix
| Browser     | Min version | Notes                       |
|-------------|-------------|-----------------------------|
| Chrome      | 120         | primary                     |
| Edge        | 120         |                             |
| Firefox     | 120         |                             |
| Safari      | 17          | iOS audio quirks tested     |
| Mobile Chrome / Safari | latest 2 | Touch controls          |
