# Math Bee SMP — arena and encounter plan

## One authored arena

The first release contains one Number Garden arena. The challenge changes through four mathematical difficulty bands; adding multiple biomes or adventure levels is not in scope.

### Spatial hierarchy

- **Focal/play layer:** stage at the far center (approximately x0/z−5.8), podium, sign, and active avatar. This is the next-turn destination and primary world focus.
- **Movement layer:** small open audience garden, visual bounds roughly x−8.7…8.7 and z−1.6…7.9. Server movement bounds contain this area. Client collision proxies are separate from decorative detail.
- **Audience layer:** bleachers and seating at the sides; actual player labels remain legible without covering the question.
- **Near detail:** path stones, flowerbeds, math sculptures, flags, and low foliage frame the arena without obstructing travel or keypad.
- **Far layer:** rounded trees and garden silhouette provide depth. They should not outcompete the stage in contrast or draw-call cost.
- **Motion layer:** avatar limb animation, subtle foliage/bunting, and restrained UI state transitions. No enemy/hazard/reward mechanics are invented to fill the scene.

### Camera

An orthographic diorama view keeps the stage and audience readable. Desktop composition leaves room for left participant list and right question panel. Narrow-phone framing is adjusted using observed container aspect; landing uses a scene window between title and guest form. No orbit gesture is required to access the core game.

## Four-round encounter progression

Exact family counts/ranges remain controlled by the domain bank and the product decision register. The intended progression from the PRD is:

| Round | Challenge role | Read/input constraints |
| --- | --- | --- |
| 1 | Integer foundation and direct operations | Short, immediately readable; low typing burden. |
| 2 | Negative integers and order of operations | Comparable step count and sign complexity per player. |
| 3 | Exact fraction arithmetic | Small, manageable denominators; answer fits fraction/decimal grammar. |
| 4 | Mixed practice or short contextual problem | Greater reasoning while remaining viable within 30 seconds including reading/typing. |

Different numbers do not by themselves prove equal difficulty. Review family/operator/step structure, magnitude, denominator complexity, answer length, and reading load. Every practice viewer receives the current actor's question; later actors may learn from earlier feedback, so rotation and fairness claims must remain honest.

## State transitions as encounters

- **Preparation:** roster is ready; actor animation reaches stage before answering time begins.
- **Question:** the game decision is the exact numerical answer. UI prioritizes reading and keypad over decorations.
- **Resolution:** clear correct/wrong/timeout state without visual ambiguity; score/life mutation happens once server-side.
- **Learning beat:** five-second solution, readable at phone scale.
- **Checkpoint:** evaluate complete round, continue or determine result.
- **Climax:** optional single same-question tiebreak for tied leaders.
- **Closure:** authoritative winner or shared champions with reason; no endless sudden death.

## Art/performance allocation

Spend silhouette/detail budget on the stage, hero avatar presets, and recognizable math props. Batch static colored meshes and avatar subparts; use one shadow light. Decorative density can be reduced where measured drawcalls/FPS require it, while preserving real avatar movement and readable stage identity.

No performance measurement is claimed by this plan. Actual integrated diagnostics and screenshots must be attached to release evidence.
