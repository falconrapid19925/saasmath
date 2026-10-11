# SaasMath

[![CI](https://github.com/falconrapid19925/saasmath/actions/workflows/ci.yml/badge.svg)](https://github.com/falconrapid19925/saasmath/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/falconrapid19925/saasmath?include_prereleases&sort=semver)](https://github.com/falconrapid19925/saasmath/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-26-339933?logo=node.js&logoColor=white)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

SaasMath is a web app (PWA) that gives Indonesian children in kelas 4-6 SD a daily 10-15 minute timed math drill, built the way Kumon works: a fine-grained ladder of small-step sets, a Standard Completion Time (SCT) target per set, and mastery before advancing. Sets generate on demand from parameterized templates, grading is instant, wrong answers trigger same-session self-correction, and failed gates trigger automatic repetition with freshly generated variants. When a child gets stuck, a Singapore-math CPA layer intervenes — the same problem appears as a pictorial bar model ("model batang") or a light manipulative before the abstract form returns. The loop is wrapped in gamification (streaks, stars, a shop), aligned to Kurikulum Merdeka Fase B/C, and sold direct to parents in Bahasa Indonesia at Rp33.000-89.000/month depending on plan. (References like "plan 6" point at the internal design document that seeded this repo; it ships as part of the public git history but not the working tree.)

## Running it

Requirements: Node 26 (the seed script uses Node's native TypeScript stripping), npm.

```bash
npm install
npm run db:push   # create/update dev.db (SQLite, repo root) from src/db/schema.ts
npm run db:seed   # idempotent: 59 skills, 12 shop items, demo account
npm run dev       # Next.js dev server
```

The seed prints the demo login (parent `demo@saasmath.id`, child Budi, PIN 123456). Children log in with name + PIN, and the PIN is 6 digits everywhere — the server schema (`lib/server/schemas.ts:pinSchema`), the server actions, the API routes, the `PinPad` component, and the seed all share that one policy. Re-running `db:seed` upserts content by stable id and never resets demo state.

Optional env (all stub-safe without them): `DB_PATH` (default `dev.db`), `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

Other scripts: `npm run build`, `npm start`, `npm run db:generate` (drizzle-kit SQL migrations into `drizzle/`). Test and check commands are in [Tests](#tests) below.

## Architecture

```
src/
  data/            authored content: skill graph (kelas4/kelas5), zod step-param
                   schemas + monotonicity rules (skills/params.ts), shop, demo account
  db/              schema.ts (all tables) + index.ts (lazy better-sqlite3 client)
  lib/engine/      the drill engine, pure and framework-free:
                     families-*.ts   12 generator families (addsub, mult, div, ...)
                     placement.ts    10-rung diagnostic ladder
                     set.ts          canonical (skillId, step, seed) -> items
                     gates.ts        mastery-gate rules + ladder-state folding
                     sct.ts          SCT math + 75th-percentile recalibration
                     answers.ts      grading (answersEqual), formatting, rng
  lib/server/      the API layer: attempts.ts (shared submit/sync pipeline),
                   family-params.ts (authored -> engine param bridge),
                   curriculum.ts + island.ts (paywall gating), gate.ts, elo.ts,
                   sm2.ts, sct.ts, streak.ts, authz.ts, midtrans.ts, whatsapp.ts
  lib/client/      browser-side view models, API client, hint normalizer
  app/api/         route handlers (auth, session/next, session/submit, sync,
                   placement, checkout, digest/preview, sets/[id]/pdf)
  app/anak|orangtua|masuk/   child home, parent dashboard, login screens
  components/      drill player, hint SVGs (hints/HintView.tsx), answer inputs
```

**Request flow for one drill session.** `POST /api/session/next` resolves the child's island access (`curriculum.ts` -> `island.ts`), picks the next task (`nexttask.ts`: progression / CPA mode / SM-2 review), regenerates the exact set server-side from (skillId, step, seed) via `engine.ts:generateSetItems` — authored params from the skills table pass through `family-params.ts` into the engine family — and returns items plus the tightened SCT (`sct.ts:servedSctSeconds`). The child plays in `components/drill` (timer, hints, self-correction). `POST /api/session/submit` (or `POST /api/sync` for offline-queued sets — same pipeline) runs `attempts.ts:processAttempt`: regenerate, re-grade server-side with `answers.ts:gradeItems`, decide the gate (`gate.ts` over engine `gates.ts`), then in one transaction write the attempt row, mastery update (step/state/CPA/Elo/SM-2), streak, and stars. Nothing the client sends is trusted: items, grades, and streaks are recomputed server-side, and `implausibility.ts` flags statistically implausible syncs (plan 6).

**Placement.** `GET/POST /api/placement` over `lib/engine/placement.ts`: 10 rungs x 2 items, stop on the first failed rung, place on the last cleanly passed rung (deliberately low), clamped to a rung whose skill exists and is island-accessible.

**Offline.** The last offered drill set is cached per child, so a cold start with no network replays it, clearly labeled (`components/drill/useDrillSession.ts`, `lib/client/outbox.ts`). Submissions made offline queue in the outbox and drain through `POST /api/sync` when connectivity returns; a record the server permanently rejects stops retrying after the outbox's cap, dead-letters, and surfaces in the sync indicator (`components/SyncIndicator.tsx`) as **gagal disinkronkan**.

**Determinism rule** (plan 6): a set is fully determined by (skillId, step, seed). Generators derive every random choice from the passed Rng, so any worksheet — including a past attempt's — regenerates identically for replay and PDF export (`sets/[id]/pdf`, pdf-lib).

### Why SQLite/Drizzle now, and the Supabase move

Launch runs on local SQLite via `better-sqlite3` + Drizzle ORM: zero infra, WAL for concurrent readers, request-time connections only (`db/index.ts` — never at build time). The schema (`src/db/schema.ts`) is written 1:1 portable to Postgres (plan 6 targets Supabase: Postgres, Auth, Edge Functions, Storage). To move:

1. In `src/db/schema.ts` swap the `drizzle-orm/sqlite-core` imports for `pg-core`; per the header notes: `text({ mode: "json" })` -> `jsonb`, `integer({ mode: "boolean" })` -> `boolean`, `integer({ mode: "timestamp" })` -> `timestamp`. Text UUID primary keys and column names carry over unchanged.
2. Replace `db/index.ts`'s better-sqlite3 client with `drizzle-orm/node-postgres` (or the Supabase pooler) pointed at the Supabase connection string; the `getDb()` request-scoped singleton stays.
3. `npm run db:generate` to emit SQL migrations, apply them to Supabase (Singapore region per plan 6), and re-run `db:seed` — content upserts by stable id, so the seed moves the graph as-is.
4. Replace the app's cookie auth with Supabase Auth for parents (children keep name+PIN linking), or keep the current scrypt auth (`lib/auth.ts`) initially — no schema change needed either way.
5. Point the Next.js frontend at Vercel/Cloudflare (plan 6 hosting note).

## Payments and WhatsApp status

- **Midtrans (`lib/server/midtrans.ts`)** — with `MIDTRANS_SERVER_KEY` set, checkout performs the documented Snap call (QRIS/VA/e-wallet per plan 6 fees), and the payment webhook at `POST /api/webhooks/midtrans` activates the subscription after signature verification (`verifyNotificationSignature` -> `applyMidtransNotification`). Without a key, checkout runs in stub mode: it records a `pending` subscription row and returns a placeholder payload documenting where the Snap call goes, and the webhook accepts one documented dev-only `{"dev_simulate": true, "order_id", "transaction_status"}` payload so the activation boundary stays exercisable locally — the flag is ignored the moment a server key is configured. Either way, a free child's first checkout starts the 7-day trial in the same transaction (`createOrder`: only a `free` plan with no trial end picks one up, exactly once).
- **WhatsApp (`lib/server/whatsapp.ts`)** — without `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`, `sendWhatsAppText` is a no-op that logs the rendered digest, so `/api/digest/preview` and the parent dashboard are exercisable end-to-end with zero external calls. With creds it posts a free-form Cloud API text; production should use an approved *utility* template (template categorization is an open risk, plan risk 12), and the schema does not store parent phone numbers yet, so the preview route passes `null` as recipient.

## Drill loop -> plan sections 3.1 / 3.2

| Plan step | Where |
|---|---|
| 3.1 step 1 — placement diagnostic, conservative low placement | `lib/engine/placement.ts`, `app/api/placement/route.ts` |
| 3.1 step 2 — on-demand sets, small-step ladders | `lib/engine/set.ts`, `lib/engine/families-*.ts`, authored ladders in `data/skills/`, bridge `lib/server/family-params.ts` |
| 3.1 step 3 — SCT target; recalibrate to the 75th percentile after ~100 completing attempts per skill (all children) | `lib/engine/sct.ts` (`computeSct`, `calibrateSct`), `lib/server/sct.ts` (`servedSctSeconds`, tightening), `attempts.ts:sctCalibrationSample` |
| 3.1 step 5 — mastery gates: advance >=95% within SCT; accurate-but-over -> tighten ~10% (3 cycles, then promote with fluency flag); <80% -> CPA mode; two clean CPA passes exit | `lib/engine/gates.ts` (`GATES`, `decideGate`, `foldGateHistory`), applied in `attempts.ts:processAttempt` via `lib/server/gate.ts` |
| 3.1 step 6 — CPA hint models (five fixed: part-whole, comparison, fraction-bar, number-line, base-ten) | payloads built by `lib/engine/families-shared.ts` constructors, validated by `lib/client/hints.ts:normalizeHint`, rendered as SVG in `components/hints/HintView.tsx` |
| 3.1 step 8 — review scheduling (SM-2) and Elo on mastered skills | `lib/server/sm2.ts`, `lib/server/elo.ts`, woven into `attempts.ts` and `nexttask.ts` |
| Gamification (plan 4) — streaks, stars ledger, shop | `lib/server/streak.ts`, `attempts.ts:applyStreakAndStars`, `db/schema.ts` (`streaks`, `stars_ledger`, `shop_items`), `app/anak/toko` |
| Offline + sync integrity (plan 6) | `app/api/sync/route.ts` reusing `processAttempt`, duplicate detection (409), `lib/server/implausibility.ts` |

## Tests

```bash
npm test            # vitest: unit and seam tests, colocated with the code under src/
npm run test:e2e    # Playwright suite in tests/e2e/
npm run typecheck   # tsc --noEmit
npm run lint
```

The vitest suite covers the engine generators, the authored content graph (`src/data/content.test.ts`), the server write path on an in-memory SQLite harness (`src/lib/server/test-db.ts`), route handlers, and the client layer. `tests/helpers/verifyItem.ts` re-derives each generated item's expected answer from its own prompt and compares it with `answersEqual`; the authored→engine bridge is probed skill-by-skill in `src/lib/server/family-params.test.ts`, with generated hint payloads run through the client normalizer (`normalizeHint`).

The Playwright suite (`tests/e2e`: journey, offline-sync, paywall, pdf, shop) runs against a fresh temp SQLite DB and serves a **production** build (`tests/e2e/web-server.mjs`), because the PWA service worker registers only in a production build and the offline journey depends on it.

## CI & releases

Every push and PR runs the [CI workflow](.github/workflows/ci.yml): lint + typecheck, unit tests with v8 coverage (summary table on the run page, lcov/json as artifacts), a production build, and the Playwright e2e suite. Dependabot keeps npm dependencies and pinned action versions current.

Releases are tag-driven: push a `v*` tag and the [Release workflow](.github/workflows/release.yml) re-runs the full gate, then publishes a GitHub release with generated notes. `workflow_dispatch` on either workflow is the dry run — same checks, nothing published. See [Releases](https://github.com/falconrapid19925/saasmath/releases).

## Contributing & license

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the pre-PR checklist, and commit/release conventions. MIT — see [LICENSE](LICENSE).
