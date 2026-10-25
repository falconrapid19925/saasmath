# Math Bee SMP

Read docs/prd.md and docs/code-review-spec.md before changing product behavior.
This is an isolated class-7 SMP multiplayer game, not the existing SaasMath SD app.
Browser frontend: React/Three.js. Authoritative server: Worker + shared D1 state.
Never trust client scores, clocks, roles, expected answers, or room membership.
Keep private spectator submissions out of public snapshots and logs.
Run npm test, npm run typecheck, and npm run build for substantial gameplay changes.
Record product defaults/open decisions in docs/implementation-decisions.md.
No paid model calls, bots disguised as humans, accounts required for play, free chat,
or changes to the 25 interview decisions without an explicit product decision.
