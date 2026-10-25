import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, joinRoom, startMatch, advanceRoom, submitAnswer, publicSnapshot,
  heartbeat, movePlayer, sendEmote, leaveRoom, calculateBonus, GameError,
} from '../src/game/engine.ts';
import type { Room } from '../src/game/types.ts';

const T = 1_000_000;
const identities = Array.from({ length: 9 }, (_, i) => ({ id: `player-${i}`, name: `Siswa ${i}`, avatar: i % 6 }));
function roomOf(count = 4): Room {
  const room = createRoom(identities[0], 'MATH42', T);
  for (let i = 1; i < count; i += 1) joinRoom(room, identities[i], T);
  return room;
}
function keep(room: Room, now: number): void {
  for (const p of room.players) if (!p.left) heartbeat(room, p.id, now);
}
function openFirst(room: Room): number {
  startMatch(room, room.hostId, T);
  const now = room.transitionEndsAt!;
  keep(room, now);
  advanceRoom(room, now);
  assert.equal(room.phase, 'answering');
  return now;
}
let requests = 0;
function answer(room: Room, raw: string, now: number, actor = room.actorId!): void {
  submitAnswer(room, actor, raw, `request-${requests++}`, now, room.turnId);
}
function advanceFeedback(room: Room): number {
  const at = room.feedbackEndsAt!;
  keep(room, at);
  advanceRoom(room, at);
  return at;
}
function run(room: Room, response: (room: Room) => string, cap = 200): void {
  for (let i = 0; i < cap && room.phase !== 'results'; i += 1) {
    if (room.phase === 'transition') {
      const at = room.transitionEndsAt!;
      keep(room, at); advanceRoom(room, at);
    } else if (room.phase === 'answering') {
      const at = room.startsAt! + 5_000;
      keep(room, at); answer(room, response(room), at);
    } else if (room.phase === 'feedback') advanceFeedback(room);
    else if (room.phase === 'tiebreak') {
      const at = room.startsAt! + 5_000;
      keep(room, at);
      for (const id of [...room.tiebreakPlayers]) answer(room, '999999', at, id);
    } else throw new Error(`Unexpected phase ${room.phase}`);
  }
  assert.equal(room.phase, 'results');
}

test('room is JSON safe and capacity/start/host boundaries are enforced', () => {
  const room = roomOf(3);
  assert.throws(() => startMatch(room, room.hostId, T), (e: unknown) => e instanceof GameError && e.code === 'NOT_ENOUGH_PLAYERS');
  joinRoom(room, identities[3], T);
  assert.throws(() => startMatch(room, identities[1].id, T), (e: unknown) => e instanceof GameError && e.status === 403);
  for (let i = 4; i < 8; i += 1) joinRoom(room, identities[i], T);
  assert.throws(() => joinRoom(room, identities[8], T), /penuh/);
  assert.deepEqual(JSON.parse(JSON.stringify(room)), room);
  startMatch(room, room.hostId, T);
  assert.throws(() => startMatch(room, room.hostId, T), /sudah berjalan/);
  assert.throws(() => joinRoom(room, identities[8], T), /berlangsung/);
});

test('question is released only after transition and receives a fresh 30 seconds', () => {
  const room = roomOf();
  startMatch(room, room.hostId, T);
  assert.equal(room.question, null);
  advanceRoom(room, T + 5_000);
  assert.equal(room.phase, 'answering');
  assert.equal(room.startsAt, T + 5_000);
  assert.equal(room.deadlineAt, T + 35_000);
  assert.ok((room as Room).question?.prompt);
});

test('bonus examples obey approved rounded linear formula and bounds', () => {
  assert.deepEqual([0, 7_500, 15_000, 22_500, 29_999].map((t) => 100 + calculateBonus(t)), [120, 115, 110, 105, 100]);
  let previous = 20;
  for (let elapsed = 0; elapsed <= 30_000; elapsed += 123) {
    const bonus = calculateBonus(elapsed);
    assert.ok(bonus >= 0 && bonus <= 20 && bonus <= previous);
    previous = bonus;
  }
  assert.equal(calculateBonus(-100), 20);
  assert.equal(calculateBonus(100_000), 0);
});

test('one valid correct answer produces one score and feedback for five seconds', () => {
  const room = roomOf(); const start = openFirst(room); const actor = room.actorId!;
  answer(room, room.question!.expected, start + 7_500);
  assert.equal(room.phase, 'feedback');
  assert.equal(room.players.find((p) => p.id === actor)!.score, 115);
  assert.equal(room.players.find((p) => p.id === actor)!.lives, 3);
  assert.equal(room.feedbackEndsAt, start + 12_500);
  const snapshot = publicSnapshot(room, actor, start + 7_500);
  assert.ok(snapshot.feedback?.answer);
  assert.equal(snapshot.feedback?.actorCorrect, true);
  assert.equal(snapshot.feedback?.yours?.correct, true);
});

test('private spectator answers neither resolve turn nor affect scores/lives or leak', () => {
  const room = roomOf(); const start = openFirst(room);
  const spectator = room.players.find((p) => p.id !== room.actorId)!;
  const another = room.players.find((p) => p.id !== room.actorId && p.id !== spectator.id)!;
  answer(room, room.question!.expected, start + 1_000, spectator.id);
  assert.equal(room.phase, 'answering');
  assert.equal(spectator.score, 0); assert.equal(spectator.lives, 3);
  const own = publicSnapshot(room, spectator.id, start + 1_000);
  const others = publicSnapshot(room, another.id, start + 1_000);
  assert.equal(own.yourAnswer.submitted, true);
  assert.equal(others.yourAnswer.submitted, false);
  assert.equal(own.feedback, null);
  assert.ok(!('expected' in own.question!));
  assert.ok(!('steps' in own.question!));
  assert.ok(!JSON.stringify(others).includes('request-'));
  answer(room, room.question!.expected, start + 2_000);
  assert.equal(publicSnapshot(room, spectator.id, start + 2_000).feedback?.yours?.correct, true);
});

test('invalid grammar leaves turn active and does not consume a life', () => {
  const room = roomOf(); const start = openFirst(room); const actor = room.actorId!;
  for (const value of ['', '1/0', 'NaN', '1+1', '1e4', '<script>']) {
    assert.throws(() => answer(room, value, start + 1_000), (e: unknown) => e instanceof GameError && e.code === 'INVALID_ANSWER');
  }
  assert.equal(room.phase, 'answering');
  assert.equal(room.players.find((p) => p.id === actor)!.lives, 3);
  assert.equal(room.outcomes.length, 0);
});

test('duplicate request is idempotent and conflicting payload cannot overwrite', () => {
  const room = roomOf(); const start = openFirst(room); const actor = room.actorId!;
  const turn = room.turnId; const raw = room.question!.expected;
  submitAnswer(room, actor, raw, 'duplicate-request', start + 1_000, turn);
  const score = room.players.find((p) => p.id === actor)!.score;
  submitAnswer(room, actor, raw, 'duplicate-request', start + 2_000, turn);
  assert.equal(room.outcomes.length, 1);
  assert.equal(room.players.find((p) => p.id === actor)!.score, score);
  assert.throws(() => submitAnswer(room, actor, '999999', 'duplicate-request', start + 2_000, turn), (e: unknown) => e instanceof GameError && e.code === 'IDEMPOTENCY_CONFLICT');
  advanceFeedback(room);
  submitAnswer(room, actor, raw, 'duplicate-request', start + 20_000, turn);
  assert.equal(room.outcomes.length, 1);
});

test('deadline wins at exact boundary and repeated scheduler cannot penalize twice', () => {
  const room = roomOf(); const start = openFirst(room); const actor = room.actorId!;
  const expected = room.question!.expected; const deadline = room.deadlineAt!;
  keep(room, deadline);
  assert.throws(() => answer(room, expected, deadline), (e: unknown) => e instanceof GameError && e.code === 'TURN_CLOSED');
  advanceRoom(room, deadline); advanceRoom(room, deadline + 1);
  assert.equal(room.players.find((p) => p.id === actor)!.lives, 2);
  assert.equal(room.outcomes.length, 1);
  assert.equal(room.outcomes[0].timedOut, true);
  assert.equal(room.outcomes[0].at, start + 30_000);
});

test('a correct submission immediately before deadline is accepted once', () => {
  const room = roomOf(); openFirst(room); const actor = room.actorId!;
  const deadline = room.deadlineAt!; keep(room, deadline - 1);
  answer(room, room.question!.expected, deadline - 1);
  advanceRoom(room, deadline);
  assert.equal(room.outcomes.length, 1);
  assert.equal(room.outcomes[0].correct, true);
  assert.equal(room.players.find((p) => p.id === actor)!.score, 100);
});

test('four rounds all-correct end in one shared-question tiebreak, no fifth round', () => {
  const room = roomOf(); startMatch(room, room.hostId, T);
  run(room, (r) => r.question!.expected);
  assert.equal(room.outcomes.length, 16);
  assert.equal(room.round, 4);
  assert.equal(room.tiebreakUsed, true);
  assert.equal(room.tiebreakResolved, true);
  assert.equal(room.tiebreakPlayers.length, 4);
  assert.equal(room.winners.length, 4);
  assert.equal(room.endReason, 'shared-champions');
  assert.ok(room.players.every((p) => p.score === 468 && p.lives === 3));
});

test('all eliminated retain score eligibility and get only one tiebreak', () => {
  const room = roomOf(); startMatch(room, room.hostId, T);
  run(room, () => '999999');
  assert.equal(room.outcomes.length, 12);
  assert.equal(room.round, 3);
  assert.ok(room.players.every((p) => p.lives === 0));
  assert.equal(room.winners.length, 4);
  assert.equal(room.tiebreakUsed, true);
});

test('last survivor does not win until remaining roster gets its turn', () => {
  const room = roomOf(); startMatch(room, room.hostId, T);
  // Three eliminated at start of a controlled round still have their scheduled final turn.
  room.round = 3;
  room.players.forEach((p) => { p.lives = p.id === room.roundRoster[3] ? 3 : 1; });
  for (let i = 0; i < 3; i += 1) {
    keep(room, room.transitionEndsAt!); advanceRoom(room, room.transitionEndsAt!);
    answer(room, '999999', room.startsAt! + 1_000);
    assert.notEqual(room.phase, 'results');
    advanceFeedback(room);
  }
  assert.equal(room.phase, 'transition');
  assert.equal(room.cursor, 3);
  const last = room.actorId!;
  keep(room, room.transitionEndsAt!); advanceRoom(room, room.transitionEndsAt!);
  answer(room, room.question!.expected, room.startsAt! + 1_000);
  assert.equal(room.phase, 'feedback');
  advanceFeedback(room);
  assert.equal(room.phase, 'results');
  assert.deepEqual(room.winners, [last]);
  assert.equal(room.endReason, 'last-survivor');
});

test('tiebreak uses earliest correct and approved inclusive 100ms tie window', () => {
  for (const difference of [100, 101]) {
    const room = roomOf(); startMatch(room, room.hostId, T);
    while (!(room.phase === 'transition' && room.pendingTiebreak)) {
      if (room.phase === 'transition') { keep(room, room.transitionEndsAt!); advanceRoom(room, room.transitionEndsAt!); }
      else if (room.phase === 'answering') { keep(room, room.startsAt! + 1_000); answer(room, room.question!.expected, room.startsAt! + 1_000); }
      else advanceFeedback(room);
    }
    keep(room, room.transitionEndsAt!); advanceRoom(room, room.transitionEndsAt!);
    const at = room.startsAt! + 1_000;
    const [a, b, c, d] = room.tiebreakPlayers;
    answer(room, room.question!.expected, at, a);
    answer(room, room.question!.expected, at + difference, b);
    answer(room, '999999', at + 200, c);
    answer(room, '999999', at + 300, d);
    assert.equal(room.phase, 'feedback');
    advanceFeedback(room);
    assert.deepEqual(room.winners, difference === 100 ? [a, b] : [a]);
  }
});

test('reconnect preserves identity, lives and countdown; expiry forfeit is separate', () => {
  const room = roomOf(); const start = openFirst(room); const actor = room.actorId!;
  advanceRoom(room, start + 11_000);
  assert.equal(room.players.find((p) => p.id === actor)!.connected, false);
  const deadline = room.deadlineAt;
  heartbeat(room, actor, start + 12_000);
  assert.equal(room.players.find((p) => p.id === actor)!.connected, true);
  assert.equal(room.deadlineAt, deadline);
  assert.equal(room.players.length, 4);
  advanceRoom(room, deadline!);
  assert.equal(room.players.find((p) => p.id === actor)!.lives, 2);
  advanceRoom(room, start + 90_000);
  const p = room.players.find((p) => p.id === actor)!;
  assert.equal(p.forfeited, true);
  assert.equal(p.lives, 2);
  heartbeat(room, actor, start + 91_000);
  assert.equal(publicSnapshot(room, actor, start + 91_000).yourRole, 'spectator');
});

test('preset messaging, bounded movement and host succession are server controlled', () => {
  const room = roomOf();
  sendEmote(room, room.hostId, 'cheer', T);
  assert.equal(room.emotes[0].text, 'Semangat!');
  assert.throws(() => sendEmote(room, room.hostId, '<script>', T + 2_000), /tersedia/);
  assert.throws(() => sendEmote(room, room.hostId, 'nice', T + 10), (e: unknown) => e instanceof GameError && e.status === 429);
  movePlayer(room, room.hostId, 10_000, 10_000, T + 2_000);
  const p = room.players[0];
  assert.ok(p.x <= 9 && p.z <= 9);
  const priorHost = room.hostId;
  leaveRoom(room, priorHost, T + 2_001);
  assert.notEqual(room.hostId, priorHost);
});


test('lobby and results host succession respects grace and unblocks start/rematch', () => {
  for (const phase of ['lobby', 'results'] as const) {
    const room = roomOf(5);
    if (phase === 'results') {
      startMatch(room, room.hostId, T);
      run(room, (r) => r.question!.expected);
      assert.equal(room.phase, 'results');
    }
    const oldHost = room.hostId;
    const base = room.updatedAt;
    const previousLives = room.players.map((p) => p.lives);
    const priorHostScore = room.players.find((p) => p.id === oldHost)!.score;
    const heartbeatPeers = (at: number) => {
      for (const p of room.players) if (p.id !== oldHost) heartbeat(room, p.id, at);
    };
    heartbeatPeers(base + 11_000);
    advanceRoom(room, base + 11_000);
    assert.equal(room.players.find((p) => p.id === oldHost)!.connected, false);
    assert.equal(room.hostId, oldHost);
    heartbeatPeers(base + 69_999);
    advanceRoom(room, base + 69_999);
    assert.equal(room.hostId, oldHost, 'host keeps responsibility until full 60-second grace expires');
    heartbeatPeers(base + 80_000);
    advanceRoom(room, base + 80_000);
    assert.equal(room.hostId, identities[1].id, 'oldest connected eligible peer succeeds the host');
    assert.deepEqual(room.players.map((p) => p.lives), previousLives, 'host succession never changes lives');
    assert.equal(room.players.find((p) => p.id === oldHost)!.score, priorHostScore);
    assert.equal(room.players.find((p) => p.id === oldHost)!.forfeited, false);
    const priorMatchNumber = room.matchNumber;
    startMatch(room, room.hostId, base + 80_001);
    assert.equal(room.phase, 'transition');
    assert.equal(room.matchNumber, priorMatchNumber + 1);
    assert.equal(room.participantIds.length, 4);
    assert.ok(!room.participantIds.includes(oldHost));
  }
});

test('full room state round-trips through JSON without changing finite timestamps', () => {
  const room = roomOf();
  assert.ok(room.players.every((p) => Number.isFinite(p.lastEmoteAt)));
  assert.deepEqual(JSON.parse(JSON.stringify(room)), room);
  const start = openFirst(room);
  answer(room, room.question!.expected, start + 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(room)), room);
});


test('departed active participant can rejoin only as spectator with history intact', () => {
  const room = roomOf();
  const start = openFirst(room);
  const returning = room.players.find((p) => p.id !== room.actorId)!;
  returning.score = 115; returning.lives = 2;
  const before = {
    members: room.players.length, roster: [...room.roundRoster], participants: [...room.participantIds],
    matchId: room.matchId, turnId: room.turnId, outcomes: room.outcomes.length,
  };
  leaveRoom(room, returning.id, start + 10);
  assert.equal(returning.left, true);
  joinRoom(room, identities.find((p) => p.id === returning.id)!, start + 20);
  assert.equal(returning.left, false);
  assert.equal(returning.forfeited, true);
  assert.equal(returning.connected, true);
  assert.equal(returning.score, 115);
  assert.equal(returning.lives, 2);
  assert.equal(room.players.length, before.members);
  assert.deepEqual(room.roundRoster, before.roster);
  assert.deepEqual(room.participantIds, before.participants);
  assert.equal(room.matchId, before.matchId);
  assert.equal(room.turnId, before.turnId);
  assert.equal(publicSnapshot(room, returning.id, start + 20).yourRole, 'spectator');
  submitAnswer(room, returning.id, room.question!.expected, 'return-spectator-answer', start + 30, room.turnId);
  assert.equal(room.outcomes.length, before.outcomes);
  assert.equal(returning.score, 115);
  assert.equal(returning.lives, 2);
  assert.equal(room.phase, 'answering');
});

test('departed result participant can return as spectator and compete anew only on rematch', () => {
  const room = roomOf();
  startMatch(room, room.hostId, T);
  run(room, (r) => r.question!.expected);
  const returning = room.players.find((p) => p.id !== room.hostId)!;
  const before = { members: room.players.length, winners: [...room.winners], score: returning.score, lives: returning.lives, matchId: room.matchId };
  const now = room.updatedAt + 1;
  leaveRoom(room, returning.id, now);
  joinRoom(room, identities.find((p) => p.id === returning.id)!, now + 1);
  assert.equal(room.phase, 'results');
  assert.equal(returning.forfeited, true);
  assert.equal(returning.left, false);
  assert.equal(returning.score, before.score);
  assert.equal(returning.lives, before.lives);
  assert.equal(room.matchId, before.matchId);
  assert.deepEqual(room.winners, before.winners);
  assert.equal(room.players.length, before.members);
  assert.equal(publicSnapshot(room, returning.id, now + 1).yourRole, 'spectator');
  keep(room, now + 2);
  startMatch(room, room.hostId, now + 2);
  assert.equal(returning.forfeited, false);
  assert.equal(returning.lives, 3);
  assert.equal(returning.score, 0);
  assert.ok(room.participantIds.includes(returning.id));
});

test('lobby return reuses membership and respects eight active-player capacity', () => {
  const room = roomOf(8);
  leaveRoom(room, identities[0].id, T + 1);
  joinRoom(room, identities[8], T + 2);
  assert.equal(room.players.filter((p) => !p.left).length, 8);
  assert.throws(() => joinRoom(room, identities[0], T + 3), (e: unknown) => e instanceof GameError && e.code === 'ROOM_FULL');
  assert.equal(room.players[0].left, true);
  leaveRoom(room, identities[8].id, T + 4);
  const records = room.players.length;
  joinRoom(room, identities[0], T + 5);
  assert.equal(room.players.length, records);
  assert.equal(room.players.filter((p) => !p.left).length, 8);
  assert.equal(room.players.filter((p) => p.id === identities[0].id).length, 1);
  assert.equal(room.players[0].forfeited, false);
  assert.equal(room.players[0].left, false);
});

test('old lobby identity outside frozen match roster cannot join active match', () => {
  const room = roomOf(5);
  leaveRoom(room, identities[4].id, T + 1);
  startMatch(room, room.hostId, T + 2);
  assert.ok(!room.participantIds.includes(identities[4].id));
  const before = { roster: [...room.roundRoster], members: room.players.length };
  assert.throws(() => joinRoom(room, identities[4], T + 3), (e: unknown) => e instanceof GameError && e.code === 'MATCH_STARTED');
  assert.equal(room.players[4].left, true);
  assert.deepEqual(room.roundRoster, before.roster);
  assert.equal(room.players.length, before.members);
});
