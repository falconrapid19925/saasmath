# Contributing to SaasMath

Thanks for your interest in contributing!

## Getting set up

Requirements: Node 26 (the seed script uses Node's native TypeScript
stripping) and npm.

```bash
git clone https://github.com/falconrapid19925/saasmath.git
cd saasmath
npm install
npm run db:push   # create/update dev.db (SQLite, repo root)
npm run db:seed   # idempotent: 59 skills, 12 shop items, demo account
npm run dev
```

The seed prints the demo login (parent `demo@saasmath.id`, child Budi, PIN
`123456`). `AUTH_SECRET` and all integration envs are optional in
development — see `.env.example` and the README for what each unlocks.

## Before you open a PR

Run the same gate CI runs:

```bash
npm run lint
npm run typecheck
npm test               # vitest unit/seam tests
npm run build          # production build
npm run test:e2e       # Playwright, slow: builds and serves a production bundle
```

Notes:

- Colocate tests with the code under `src/` and test the public seam (an
  engine function, a route handler, `processAttempt`), not internals.
  `src/lib/server/attempts.test.ts` is the worked example for server
  write-path tests on the in-memory SQLite harness.
- After any change to `src/db/schema.ts`, mirror it in the test harness
  `src/lib/server/test-db.ts`, then `npm run db:push` for the real dev.db.
- The PWA service worker registers only in production builds — offline
  behavior never appears under `npm run dev`. Verify offline changes with
  `npm run build && npm start` or the e2e offline spec.

## Commit style

Conventional Commits (`feat:`, `fix:`, `chore:`, `ci:`, `docs:` …), one
logical change per commit. Releases are cut by pushing a `v*` tag; the
Release workflow runs the full gate before publishing GitHub release notes.

## Reporting bugs

Open an issue with the bug template and include the spec/step to reproduce
where possible.
