# Math Bee SMP — continuation checkpoint

Updated 25 October 2026, Asia/Jakarta.

## Intent and constraints

Implement the game described in docs/prd.md, not the existing SaasMath SD project. 4–8 human guests in coded private rooms, mobile first, class-7 integers/fractions, typed keypad, three lives, 30-second turns, five-second explanations, maximum four rounds, private spectator practice, one tiebreak, procedural bright 3D garden. No bots disguised as humans, accounts, free chat, paid services, or runtime inference. Hosting provider is explicitly Sites.

## Confirmed additional decisions

Rounded linear speed bonus 0–20; correct tiebreak answers within100ms share victory;60-second reconnect expiry forfeits winner eligibility but allows spectator return; host migrates to oldest connected eligible member. Full record: docs/implementation-decisions.md.

## Source and Site identity

- Project checkout: `/workspace/sites/math-bee-smp`.
- Site project_id: `appgprj_6ade008dd4308191bb53e8c736610797` — already created. DO NOT create a second Site.
- Title: Math Bee — Arena Matematika SMP.
- Source repository is configured as origin in this checkout; use the native source credential tool for this same project when needed.
- No source token is persisted. Retained credentials expire and must be refreshed; do not look for a token file.
- Site was created private/unpublished. No saved version or deployment exists at this checkpoint. Do not describe expected_url as live.

## Completed

- React/Three client and batched procedural arena, six avatar styles, walking/stage animation, touch joystick.
- Authoritative JSON state machine, exact rational parser, eight deterministic math families.
- Guest cookie/hash session, D1-compatible SQL store with CAS, bounded requests, private snapshots, idempotency, streaming-body deadline protection.
- Lobbies, actual room members, scores/lives, all main phases, tie and result UI, forfeit/reconnect, host succession.
- Source/build scripts, real Drizzle migration, embedded Worker ESM artifact under dist/.
- Final browser run qa-browser-03 and two-room/16-session full HTTP run pass; see machine reports.
- Independent review closed streaming timestamp, refresh restore, and lobby-host deadlock issues. See artifacts/code-review.md.
- Vendored official Three r183 runtime and real declarations with licenses/provenance, using an authorized GitHub connector because environment egress failed.

## Current checks

See artifacts/final-evidence.md for exact latest counts/results. Client hash287fa4b35b65. Final Node39-tests/typecheck/build passed. Voluntary return preserves forfeit/score/lives and is covered by four additional regressions.

## Blocking external dependency

Required HTTP proxy returns503 with safe response body `VPN DNS or routing is unavailable` for npm registry and Git Sites host. User said they would restore environment connectivity. Native Sites metadata tools work, but source push cannot connect. Do not bypass proxy, disable TLS, switch providers, invent a remote SHA, or call save/deploy pretending source is pushed.

Official Sites root helpers and full Vinext starter were unavailable. Supported Worker ESM starter/reference material is retained in `/workspace/work/sites-plugin`; do not claim it is a complete installed plugin. App bundles frontend responses into one Worker and includes migrations.

## Resume once networking is healthy

1. Read this file and docs/implementation-decisions.md; preserve existing implementation.
2. Verify actual HTTPS Git transport through the inherited required proxy.
3. Obtain a fresh native Sites source write credential for the existing project. Pass only through stdin to the hidden-input helper or available official workflow; never persist it.
4. Push exact final source, record the actual remote SHA, and rebuild/package the artifact from it.
5. Validate native D1 manifest/migrations; the current logical declaration has not been accepted by hosted deployment yet.
6. Use Sites access/deployment operations appropriate to the authorized anonymous-player requirement. Native tool approval checks apply. No invitations/messages should be sent.
7. Deploy saved version, confirm native success, then smoke-test anonymous session and actual shared hosted room state. Report the real URL only after success.

## Remaining verification limits

No physical Android/iOS hardware test, hardware FPS claim, teacher/classroom trial, or hosted D1/capacity test has been completed. SwiftShader functional captures are not physical-phone performance data. Expiry is logical and physical cleanup is opportunistic.
