# Math Bee SMP — core loop contract

Source: `prd.md`. This file connects frontend intent to server state; it does not replace the product decision register.

## Loop

1. Guest joins a private 4–8-human room.
2. Host starts a match with an authoritative frozen roster.
3. Server selects the next actor and transition phase. World animates actor to the podium.
4. Server opens a class-7 integer/fraction question for at most 30 seconds. Actor gets a competitive keypad; others get optional private practice.
5. Actor locks one valid numerical answer or reaches the deadline. Client sends answer, turn ID, and idempotency key; it does not send correctness, score, role, or trusted elapsed time.
6. Server grades exact numerical equivalence, updates score/life once, and opens five-second feedback. Everyone sees the correct answer and short steps; spectators see only their own private result.
7. Server advances through the round roster, then evaluates whether to continue, finish, or run one shared tiebreak.
8. Results identify winner(s), score, and completion reason. A later match uses a new authoritative match identity.

## Inputs

- Guest form: nickname and avatar index; create or join by room code.
- Answer: bounded text composed from digits, minus, fraction slash, and decimal separator. Equivalent rational values are accepted server-side.
- Movement: finite local x/z target, throttled to at most one request every 600 ms in the frontend; server bounds and speed limits remain authoritative.
- Emote: allowed preset ID only (`cheer`, `nice`, `again`); no arbitrary chat text.
- Lifecycle: host start/rematch, leave, snapshot/reconnect. Product policies are documented separately.

## Feedback and identity

- Base scoring is 100 for a correct answer, with a server-calculated speed bonus of at most 20. Wrong/timeout gives no score and removes one of three lives.
- Elimination removes future main turns but leaves private practice available.
- The question card labels competitive vs private role based on `yourRole` from the server, including tiebreak candidates.
- HTTP-only/session credentials identify the guest. Browser storage contains only convenience fields such as nickname, avatar choice, and last room code; never authoritative score/life.
- Snapshots reconcile by monotonic version; older equal-version server timestamps are ignored. No client answer key or hidden bank is required.

## Termination

- Evaluate early termination after a complete round, never midway through remaining roster turns.
- One surviving eligible participant wins at a checkpoint.
- All eliminated or four main rounds complete: authoritative score selects eligible leaders.
- One shared tiebreak at most; correct fastest wins under the declared timing policy. No unique winner means shared champions.
- Disconnect does not pause the match; 60-second reconnect grace does not extend a turn deadline.

## Evidence needed

Domain tests cover exact grading, score/life invariants, phase transitions, races/idempotency, winner logic, privacy, and deadline boundaries. Browser tests additionally prove guest create/join, actual independent sessions, keypad interaction, replication, feedback, reconnect, results, mobile layout, and console health. A screenshot cannot prove authoritative multiplayer.
