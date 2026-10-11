## What

<!-- What this PR changes and why. Link the issue it closes, if any. -->

## How

<!-- The approach in one or two paragraphs: which seams changed, invariants kept. -->

## Checklist

- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm test` passes (new behavior has a colocated seam test)
- [ ] `npm run build` passes
- [ ] E2E run if the change touches a user-visible flow (`npm run test:e2e`)
- [ ] If `src/db/schema.ts` changed: test harness mirrored + `npm run db:push`
