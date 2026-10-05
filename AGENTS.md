# AGENTS.md

SaasMath is a Next.js PWA of timed, Kumon-style daily math drills for Indonesian kelas 4-6 SD (Bahasa Indonesia UI). Sets regenerate deterministically from (skillId, step, seed) and are re-graded server-side; mastery gates, streaks, and stars are written in one transaction per attempt. Architecture and request flow: `README.md`.

## Checks

- `npm test` — vitest unit/seam tests, colocated under `src/`.
- `npm run typecheck` — tsc over the whole app.
- `npm run lint` — eslint.
- `npm run build` — the production build.
- `npm run test:e2e` — Playwright journeys in `tests/e2e/`; builds and serves a production bundle against a fresh temp SQLite DB, so it is the slow check — run it when the change touches a user-visible flow.

## Test conventions

- Test the public seam (`processAttempt`, a route handler, an engine function), not internals; colocate the test next to the code.
- Server write-path tests run on the shared in-memory SQLite harness in `src/lib/server/test-db.ts`; `src/lib/server/attempts.test.ts` is the worked example to copy.
- The harness mirrors `src/db/schema.ts` by hand: after a schema change, update both, then `npm run db:push` for the real dev.db.

## Seeded demo account

`npm run db:seed` upserts the demo login: parent `demo@saasmath.id`, child Budi, PIN 123456 — the one 6-digit PIN policy shared by the schema, actions, API routes, and PinPad. Re-seeding refreshes the PIN policy without resetting demo state.

## Gotcha

The PWA service worker registers only in production builds, so offline behavior (set replay, outbox sync) never appears under `npm run dev` — verify offline changes with `npm run build && npm start` or `npm run test:e2e`.
