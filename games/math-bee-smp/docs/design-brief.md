# Math Bee SMP — design brief

Status: implemented visual direction and intended interaction contract. Browser evidence is recorded separately; this brief is not a QA pass certificate.

## Product promise

Math Bee turns short class-7 integer/fraction problems into a friendly shared stage competition. Four to eight human guests join a private room. One player is onstage while everyone else can privately practice the same problem. The visual language should feel like a small toy-world competition, with the problem and keypad always easier to read than the world around them.

Source of truth: `prd.md`, especially K-01–K-25 and REQ-001–REQ-032. Scoring, eligibility, phase timing, and room membership come from the authoritative server; no UI presentation invents another game rule.

## Art direction: Number Garden

- Bright garden diorama with mint/teal grass, rounded trees, cream paths, little bleachers, flowerbeds, flags, and oversized math symbols.
- Focal asset: a raised cream/pink/lilac competition stage with Math Bee sign, center podium, and bunting. It reads as a stage at the actual gameplay camera scale.
- Six original block-avatar presets: Coral, Mint, Lilac, Sunny, Ocean, Peach. Their colors and accessories provide identity; world characters have animated shoulder/hip pivots, eyes, hair, clothes, and feet.
- One unnamed decorative mascot appears on the empty welcome scene. It never contributes a player count or masquerades as an online human. Inside a room, all displayed participants come from the server snapshot.
- Material palette links UI and world: dark forest ink, pastel coral/lilac, butter-yellow highlights, and warm neutral surfaces.
- System fonts keep first render self-contained. Interface icons are local authored SVG primitives; no runtime image, font, or AI service is required.

## Screen/state inventory

| State | Primary action | Information hierarchy | World behavior |
| --- | --- | --- | --- |
| Welcome | Enter nickname, pick avatar, create/join | Brand and invitation; guest form; concise rules | Quiet garden, unnamed decorative hero, no fake participants. |
| Lobby | Copy invite; host starts at ≥4 | Room code, readiness, actual participants | Free movement; other clients see replicated positions. |
| Transition | Prepare | Next actor name; room/round status | Actor automatically moves to stage; question timer has not started. |
| Answering, actor | Enter and lock answer | Question, server-derived time, input/keypad, lives/score | Actor at podium; locomotion disabled for actor. |
| Answering, spectator | Optional private practice | Same question, privacy cue, own input | Spectators can stay in the arena; submissions do not affect competition. |
| Locked answer | Wait for result | Locked state and submitted value | No second competitive submission. |
| Feedback | Read solution | Correct answer, short steps, own private outcome | Stage actor stays visible during five-second review. |
| Tiebreak | Eligible candidates answer same problem | One shared problem, deadline, role cue | No extra main round or fake participant. |
| Results | Host rematches or player leaves | Winner(s), reason, own score | Static presentation; movement disabled while reading results. |
| Connection recovery | Wait/reconnect or leave | Connection status, ongoing timer | No local simulation pretending to be online. |
| Help | Read concise rules, return | Rules and a single primary return action | Focus trapped; locomotion disabled until closed. |

## Responsive interaction contract

- Laptop: compact participant list left, stage at center, active question card right, joystick/emotes outside the problem input zone.
- Phone: header and room information top, compact player-list toggle, question or lobby card at bottom, joystick on open world area. Long content can scroll inside the card rather than hiding the submit action permanently.
- Keypad digits, fraction shortcut, backspace, avatar choices, submit, and header icon buttons target at least 44 CSS px. Focus/pressed/disabled states are explicit.
- Touch movement uses pointer capture, cancellation, lost capture, window blur, and document visibility cleanup. Keyboard controls use the same movement intent; answer typing cannot also move the onstage actor.
- Safe-area insets are accounted for; numbers use stable layouts. Wrong/correct/connection states use labels or icons in addition to color.
- Reduced motion respects system preference for UI animations. World animation budget is kept modest and measured separately.

## Rendering budget and diagnostics

Starting mobile contract: DPR ≤1.5, ≤150 draw calls, ≤300k triangles, ≤200 geometries, ≤40 textures, one shadow-casting light and 1024 shadow map. These are targets until measured in the integrated scene.

Static nontextured objects are batched into vertex-colored meshes; avatar bodies and each articulated limb are batched separately; flowers use instancing. Repeated roles share geometry/materials. Runtime diagnostics are exposed as `window.__THREE_GAME_DIAGNOSTICS__`, including render calls/triangles, memory counts, FPS, DPR, renderer identity, and actual player positions. Diagnostics do not expose keys or hidden questions.

Required verification: desktop/mobile screenshots for each relevant state, real pointer/keyboard input, participant position replication, timer/feedback transitions, text-fit and target-size measurements, console/page errors, and actual diagnostics with eight participants. Simulated viewports do not prove phone GPU performance.

## Scope discipline

No accounts, free chat, monetization, player bots, generated runtime questions from an LLM, cosmetic economy, public matchmaking, or unrelated marketing pages. Remaining product-policy choices are maintained in `implementation-decisions.md`; this design brief does not approve unresolved policies.
