import { generateQuestion, normalizeAnswer } from './math.ts';
import type { Identity, GamePolicy, Player, Room, PublicSnapshot, TurnOutcome } from './types.ts';
export type { Identity, GamePolicy, Player, Room, PublicSnapshot } from './types.ts';

/** Product defaults remain explicit and versioned; see docs/implementation-decisions.md. */
export const DEFAULT_POLICY: GamePolicy = {
  version: '2026-10-v1',
  turnMs: 30_000,
  feedbackMs: 5_000,
  transitionMs: 2_000,
  disconnectAfterMs: 10_000,
  reconnectGraceMs: 60_000,
  tieToleranceMs: 100,
  bonusMode: 'linear-rounded',
};
export const PRESET_EMOTES = {
  cheer: 'Semangat!',
  nice: 'Mantap!',
  again: 'Main lagi?',
  hello: 'Halo!',
} as const;

export class GameError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'INVALID_ACTION') {
    super(message);
    this.name = 'GameError';
    this.status = status;
    this.code = code;
  }
}
function touch(room: Room, now: number): Room {
  room.version += 1;
  room.updatedAt = Math.max(room.updatedAt, now);
  return room;
}
function player(room: Room, id: string): Player {
  const value = room.players.find((p) => p.id === id);
  if (!value) throw new GameError('Kamu bukan anggota room ini.', 403, 'NOT_A_MEMBER');
  return value;
}
function validateIdentity(identity: Identity): Identity {
  if (typeof identity.id !== 'string' || !identity.id || identity.id.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(identity.id)) {
    throw new GameError('Identitas sesi tidak valid.', 400, 'INVALID_IDENTITY');
  }
  const name = typeof identity.name === 'string' ? identity.name.trim() : '';
  if (Array.from(name).length < 2 || Array.from(name).length > 16 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new GameError('Nama panggilan harus 2–16 karakter.', 400, 'INVALID_NAME');
  }
  if (!Number.isInteger(identity.avatar) || identity.avatar < 0 || identity.avatar > 5) {
    throw new GameError('Pilih avatar yang tersedia.', 400, 'INVALID_AVATAR');
  }
  return { id: identity.id, name, avatar: identity.avatar };
}
function makePlayer(identity: Identity, now: number, position: number): Player {
  return {
    ...validateIdentity(identity), joinedAt: now, lastSeenAt: now,
    disconnectedAt: null, connected: true, forfeited: false, left: false,
    lives: 3, score: 0, x: (position % 4 - 1.5) * 2, z: 4 + Math.floor(position / 4) * 2,
    lastMoveAt: now, lastEmoteAt: now - 1_500,
  };
}
function isEligible(p: Player): boolean { return !p.forfeited && !p.left; }
function alive(room: Room): Player[] {
  return room.players.filter((p) => room.participantIds.includes(p.id) && isEligible(p) && p.lives > 0);
}
function eligible(room: Room): Player[] {
  return room.players.filter((p) => room.participantIds.includes(p.id) && isEligible(p));
}
function shuffle(ids: string[], seed: string): string[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i -= 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function cleanTurn(room: Room): void {
  room.question = null;
  room.startsAt = null;
  room.deadlineAt = null;
  room.feedbackEndsAt = null;
  room.feedback = null;
  room.answers = {};
}
function finish(room: Room, winners: string[], reason: string, now: number): void {
  room.phase = 'results';
  room.winners = [...winners];
  room.endReason = reason;
  room.actorId = null;
  room.deadlineAt = null;
  room.transitionEndsAt = null;
  room.feedbackEndsAt = null;
  touch(room, now);
}
function startTiebreak(room: Room, candidates: string[], now: number): void {
  if (room.tiebreakUsed) {
    finish(room, candidates, 'shared-champions', now);
    return;
  }
  cleanTurn(room);
  room.tiebreakUsed = true;
  room.pendingTiebreak = true;
  room.tiebreakPlayers = [...candidates];
  room.tiebreakResolved = false;
  room.actorId = null;
  room.phase = 'transition';
  room.transitionEndsAt = now + room.policy.transitionMs;
  touch(room, now);
}
function selectByScore(room: Room, reason: string, now: number): void {
  const candidates = eligible(room);
  if (candidates.length === 0) { finish(room, [], 'aborted', now); return; }
  const best = Math.max(...candidates.map((p) => p.score));
  const leaders = candidates.filter((p) => p.score === best).map((p) => p.id);
  if (leaders.length > 1) startTiebreak(room, leaders, now);
  else finish(room, leaders, reason, now);
}
function roundComplete(room: Room, now: number): void {
  const remaining = alive(room);
  if (remaining.length === 1) {
    finish(room, [remaining[0].id], 'last-survivor', now);
  } else if (remaining.length === 0) {
    selectByScore(room, 'all-eliminated', now);
  } else if (room.round >= 4) {
    selectByScore(room, 'round-limit', now);
  } else {
    beginRound(room, room.round + 1, now);
  }
}
function prepareTurn(room: Room, now: number): void {
  while (room.cursor < room.roundRoster.length) {
    const next = player(room, room.roundRoster[room.cursor]);
    if (isEligible(next) && next.lives > 0) break;
    room.cursor += 1;
  }
  if (room.cursor >= room.roundRoster.length) { roundComplete(room, now); return; }
  cleanTurn(room);
  room.actorId = room.roundRoster[room.cursor];
  room.turnSequence += 1;
  room.turnId = `${room.matchId}:turn:${room.turnSequence}`;
  room.phase = 'transition';
  room.transitionEndsAt = now + room.policy.transitionMs;
  touch(room, now);
}
function beginRound(room: Room, round: number, now: number): void {
  room.round = round;
  const ids = room.matchOrder.filter((id) => {
    const p = player(room, id);
    return isEligible(p) && p.lives > 0;
  });
  const offset = ids.length ? (round - 1) % ids.length : 0;
  room.roundRoster = [...ids.slice(offset), ...ids.slice(0, offset)];
  room.cursor = 0;
  prepareTurn(room, now);
}
function openQuestion(room: Room, now: number): void {
  room.transitionEndsAt = null;
  room.startsAt = now;
  room.deadlineAt = now + room.policy.turnMs;
  if (room.pendingTiebreak) {
    room.pendingTiebreak = false;
    room.turnSequence += 1;
    room.turnId = `${room.matchId}:tiebreak`;
    room.question = generateQuestion(4, `${room.secretSeed}:${room.matchId}:tiebreak`);
    room.phase = 'tiebreak';
  } else {
    room.question = generateQuestion(room.round, `${room.secretSeed}:${room.matchId}:${room.round}:${room.turnSequence}`);
    room.phase = 'answering';
  }
  touch(room, now);
}
export function calculateBonus(elapsedMs: number, turnMs = 30_000): number {
  const remaining = Math.max(0, Math.min(1, (turnMs - elapsedMs) / turnMs));
  return Math.floor(20 * remaining + 0.5);
}
function resolveTurn(room: Room, correct: boolean, value: string | null, at: number, timedOut: boolean, publishedAt = at): void {
  if (room.phase !== 'answering' || !room.actorId || !room.question || room.startsAt === null) return;
  const p = player(room, room.actorId);
  const elapsedMs = Math.max(0, Math.min(room.policy.turnMs, at - room.startsAt));
  const delta = correct ? 100 + calculateBonus(elapsedMs, room.policy.turnMs) : 0;
  if (correct) p.score += delta;
  else p.lives = Math.max(0, p.lives - 1);
  const outcome: TurnOutcome = {
    turnId: room.turnId, actorId: p.id, round: room.round, correct, value,
    elapsedMs, delta, at, timedOut,
  };
  room.outcomes.push(outcome);
  room.feedback = { answer: room.question.expected, steps: [...room.question.steps], actorCorrect: correct, delta };
  room.phase = 'feedback';
  room.deadlineAt = null;
  room.feedbackEndsAt = publishedAt + room.policy.feedbackMs;
  touch(room, publishedAt);
}
function resolveTiebreak(room: Room, now: number): void {
  if (room.phase !== 'tiebreak' || !room.question) return;
  const candidates = room.tiebreakPlayers.filter((id) => isEligible(player(room, id)));
  const correct = candidates.map((id) => room.answers[id]).filter((a) => a?.correct);
  if (correct.length === 0) {
    room.winners = candidates;
    room.endReason = candidates.length ? 'shared-champions' : 'aborted';
  } else {
    const earliest = Math.min(...correct.map((a) => a.at));
    room.winners = correct.filter((a) => a.at - earliest <= room.policy.tieToleranceMs).map((a) => a.playerId);
    room.endReason = room.winners.length > 1 ? 'shared-champions' : 'tiebreak';
  }
  room.feedback = { answer: room.question.expected, steps: [...room.question.steps], actorCorrect: null, delta: 0 };
  room.phase = 'feedback';
  room.tiebreakResolved = true;
  room.deadlineAt = null;
  room.feedbackEndsAt = now + room.policy.feedbackMs;
  touch(room, now);
}
function updatePresence(room: Room, now: number): void {
  let changed = false;
  const activeMatch = room.phase !== 'lobby' && room.phase !== 'results';
  for (const p of room.players) {
    if (p.left) continue;
    if (p.connected && now - p.lastSeenAt > room.policy.disconnectAfterMs) {
      p.connected = false;
      p.disconnectedAt = p.lastSeenAt + room.policy.disconnectAfterMs;
      changed = true;
    }
    if (activeMatch && !p.forfeited && p.disconnectedAt !== null && now >= p.disconnectedAt + room.policy.reconnectGraceMs) {
      p.forfeited = true;
      changed = true;
    }
  }
  const host = room.players.find((p) => p.id === room.hostId);
  // Hosting is a room responsibility, independent of the current match/life state.
  // A disconnected lobby/results host still gets the full reconnect grace before succession.
  const hostGraceExpired = host && !host.connected && host.disconnectedAt !== null
    && now >= host.disconnectedAt + room.policy.reconnectGraceMs;
  if (!host || host.left || host.forfeited || hostGraceExpired) {
    const next = room.players.filter((p) => p.connected && isEligible(p)).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next && next.id !== room.hostId) { room.hostId = next.id; changed = true; }
  }
  const filtered = room.emotes.filter((e) => now - e.at < 5_000);
  if (filtered.length !== room.emotes.length) { room.emotes = filtered; changed = true; }
  if (changed) touch(room, now);
}

/** Reconcile persisted deadlines. New questions always start at their actual release time. */
export function advanceRoom(room: Room, now: number): Room {
  updatePresence(room, now);
  if (room.phase === 'transition' && room.transitionEndsAt !== null && now >= room.transitionEndsAt) {
    openQuestion(room, now);
  } else if (room.phase === 'answering' && room.deadlineAt !== null && now >= room.deadlineAt) {
    // Grade against the original deadline, but show newly published feedback for a full five seconds.
    resolveTurn(room, false, null, room.deadlineAt, true, now);
  } else if (room.phase === 'tiebreak' && room.deadlineAt !== null && now >= room.deadlineAt) {
    resolveTiebreak(room, now);
  } else if (room.phase === 'feedback' && room.feedbackEndsAt !== null && now >= room.feedbackEndsAt) {
    if (room.tiebreakResolved) finish(room, room.winners, room.endReason ?? 'shared-champions', now);
    else { room.cursor += 1; prepareTurn(room, now); }
  }
  return room;
}

export function createRoom(identity: Identity, code: string, now: number, policy: Partial<GamePolicy> = {}, secretSeed: string = crypto.randomUUID()): Room {
  if (!/^[A-Z2-9]{4,8}$/.test(code)) throw new GameError('Kode room tidak valid.');
  const p = makePlayer(identity, now, 0);
  return {
    code, version: 1, createdAt: now, updatedAt: now, hostId: p.id, players: [p],
    phase: 'lobby', policy: { ...DEFAULT_POLICY, ...policy }, secretSeed, matchNumber: 0, matchId: '',
    participantIds: [], matchOrder: [], round: 0, roundRoster: [], cursor: 0,
    actorId: null, turnId: '', turnSequence: 0, question: null, startsAt: null,
    deadlineAt: null, transitionEndsAt: null, feedbackEndsAt: null,
    answers: {}, receipts: {}, outcomes: [], feedback: null, winners: [], endReason: null,
    pendingTiebreak: false, tiebreakUsed: false, tiebreakPlayers: [], tiebreakResolved: false, emotes: [],
  };
}
export function joinRoom(room: Room, identity: Identity, now: number): Room {
  const existing = room.players.find((p) => p.id === identity.id);
  if (existing) {
    if (room.phase !== 'lobby' && !room.participantIds.includes(existing.id)) {
      throw new GameError('Kamu belum termasuk peserta pertandingan ini. Tunggu room berikutnya.', 409, 'MATCH_STARTED');
    }
    if (existing.left) {
      if (room.phase === 'lobby' && room.players.filter((p) => !p.left).length >= 8) {
        throw new GameError('Room penuh. Maksimal delapan pemain.', 409, 'ROOM_FULL');
      }
      // A departed match participant may watch again, but cannot revive their competitive run.
      // In the lobby no match is active, so the existing membership can become eligible again.
      existing.left = false;
      existing.forfeited = room.phase !== 'lobby';
    }
    return heartbeat(room, identity.id, now);
  }
  if (room.phase !== 'lobby') throw new GameError('Pertandingan sedang berlangsung. Tunggu room berikutnya.', 409, 'MATCH_STARTED');
  if (room.players.filter((p) => !p.left).length >= 8) throw new GameError('Room penuh. Maksimal delapan pemain.', 409, 'ROOM_FULL');
  room.players.push(makePlayer(identity, now, room.players.length));
  return touch(room, now);
}
export function heartbeat(room: Room, playerId: string, now: number): Room {
  const p = player(room, playerId);
  if (p.left) throw new GameError('Kamu sudah meninggalkan room.', 403, 'LEFT_ROOM');
  p.lastSeenAt = Math.max(p.lastSeenAt, now);
  p.connected = true;
  p.disconnectedAt = null;
  return touch(room, now);
}
export function startMatch(room: Room, actorId: string, now: number): Room {
  if (room.hostId !== actorId) throw new GameError('Hanya pembuat room yang bisa memulai.', 403, 'HOST_ONLY');
  if (room.phase !== 'lobby' && room.phase !== 'results') throw new GameError('Pertandingan sudah berjalan.', 409, 'MATCH_STARTED');
  const participants = room.players.filter((p) => !p.left && p.connected);
  if (participants.length < 4 || participants.length > 8) throw new GameError('Butuh 4–8 pemain yang terhubung untuk mulai.', 409, 'NOT_ENOUGH_PLAYERS');
  room.matchNumber += 1;
  room.matchId = `${room.code}:${room.matchNumber}:${now}`;
  room.participantIds = participants.map((p) => p.id);
  room.matchOrder = shuffle(room.participantIds, room.matchId);
  room.turnSequence = 0;
  room.receipts = {};
  room.outcomes = [];
  room.winners = [];
  room.endReason = null;
  room.pendingTiebreak = false;
  room.tiebreakUsed = false;
  room.tiebreakPlayers = [];
  room.tiebreakResolved = false;
  for (const p of participants) { p.lives = 3; p.score = 0; p.forfeited = false; }
  beginRound(room, 1, now);
  return room;
}

export function submitAnswer(room: Room, playerId: string, raw: string, requestId: string, now: number, expectedTurnId?: string): Room {
  const p = player(room, playerId);
  if (p.left) throw new GameError('Kamu sudah meninggalkan room.', 403, 'LEFT_ROOM');
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId) || ['__proto__', 'constructor', 'prototype'].includes(requestId)) throw new GameError('ID jawaban tidak valid.', 400, 'INVALID_REQUEST_ID');
  if (typeof raw !== 'string') throw new GameError('Masukkan jawaban berupa angka.', 400, 'INVALID_ANSWER');
  const receipt = Object.hasOwn(room.receipts, requestId) ? room.receipts[requestId] : undefined;
  if (receipt) {
    if (receipt.playerId !== playerId || receipt.raw !== raw || (expectedTurnId && receipt.turnId !== expectedTurnId)) {
      throw new GameError('Jawaban sudah dikunci dengan isi berbeda.', 409, 'IDEMPOTENCY_CONFLICT');
    }
    return room;
  }
  advanceRoom(room, now);
  if (expectedTurnId && expectedTurnId !== room.turnId) throw new GameError('Giliran ini sudah selesai.', 409, 'STALE_TURN');
  if ((room.phase !== 'answering' && room.phase !== 'tiebreak') || !room.question || room.deadlineAt === null || room.startsAt === null || now >= room.deadlineAt) {
    throw new GameError('Waktu menjawab sudah selesai.', 409, 'TURN_CLOSED');
  }
  if (room.answers[playerId]) throw new GameError('Jawabanmu sudah dikunci.', 409, 'ALREADY_ANSWERED');
  let value: string;
  try { value = normalizeAnswer(raw); }
  catch (err) { throw new GameError(err instanceof Error ? err.message : 'Format jawaban belum benar.', 400, 'INVALID_ANSWER'); }
  const competitive = !p.forfeited && (room.phase === 'answering' ? room.actorId === playerId : room.tiebreakPlayers.includes(playerId));
  room.answers[playerId] = {
    playerId, turnId: room.turnId, requestId, value,
    correct: value === room.question.expected, at: now,
    elapsedMs: now - room.startsAt, competitive,
  };
  room.receipts[requestId] = { playerId, turnId: room.turnId, raw };
  p.lastSeenAt = Math.max(p.lastSeenAt, now);
  p.connected = true;
  p.disconnectedAt = null;
  touch(room, now);
  if (competitive && room.phase === 'answering') {
    resolveTurn(room, room.answers[playerId].correct, value, now, false);
  } else if (competitive && room.phase === 'tiebreak') {
    const required = room.tiebreakPlayers.filter((id) => isEligible(player(room, id)));
    if (required.every((id) => room.answers[id]?.competitive)) resolveTiebreak(room, now);
  }
  return room;
}
export function movePlayer(room: Room, playerId: string, x: number, z: number, now: number): Room {
  const p = player(room, playerId);
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new GameError('Posisi avatar tidak valid.');
  if (room.actorId === playerId && ['transition', 'answering', 'feedback'].includes(room.phase)) return heartbeat(room, playerId, now);
  const limit = Math.max(0.5, Math.min(2, (now - p.lastMoveAt) / 1000 * 5));
  const tx = Math.max(-9, Math.min(9, x));
  const tz = Math.max(-2, Math.min(9, z));
  const dx = tx - p.x; const dz = tz - p.z;
  const length = Math.hypot(dx, dz);
  p.x += length > limit ? dx / length * limit : dx;
  p.z += length > limit ? dz / length * limit : dz;
  p.lastMoveAt = now;
  return heartbeat(room, playerId, now);
}
export function sendEmote(room: Room, playerId: string, presetId: string, now: number): Room {
  const p = player(room, playerId);
  if (!Object.prototype.hasOwnProperty.call(PRESET_EMOTES, presetId)) throw new GameError('Pesan ini tidak tersedia.', 400, 'INVALID_EMOTE');
  if (room.phase === 'answering' || room.phase === 'tiebreak') throw new GameError('Emote istirahat dulu saat soal berlangsung.', 409, 'EMOTE_DISABLED');
  if (now - p.lastEmoteAt < 1_500) throw new GameError('Tunggu sebentar sebelum mengirim emote lagi.', 429, 'EMOTE_RATE_LIMIT');
  p.lastEmoteAt = now;
  room.emotes.push({ id: `${room.version}:${playerId}:${now}`, playerId, text: PRESET_EMOTES[presetId as keyof typeof PRESET_EMOTES], at: now });
  room.emotes = room.emotes.slice(-8);
  return heartbeat(room, playerId, now);
}
export function leaveRoom(room: Room, playerId: string, now: number): Room {
  const p = player(room, playerId);
  p.left = true; p.connected = false; p.forfeited = true; p.disconnectedAt = now;
  updatePresence(room, now);
  return touch(room, now);
}
export function publicSnapshot(room: Room, viewerId: string, now: number): PublicSnapshot {
  const viewer = player(room, viewerId);
  const answer = room.answers[viewerId];
  const showFeedback = room.phase === 'feedback' || room.phase === 'results';
  const yourRole = !viewer.forfeited && !viewer.left && (room.phase === 'tiebreak' ? room.tiebreakPlayers.includes(viewerId) : room.actorId === viewerId) ? 'competitor' : 'spectator';
  return {
    code: room.code, version: room.version, serverNow: now,
    phase: room.phase, round: room.round, maxRounds: 4,
    hostId: room.hostId, youId: viewerId,
    players: room.players.filter((p) => !p.left || room.participantIds.includes(p.id)).map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, lives: p.lives, score: p.score,
      connected: p.connected, forfeited: p.forfeited, x: p.x, z: p.z,
    })),
    actorId: room.actorId, turnId: room.turnId,
    question: room.question ? { id: room.question.id, prompt: room.question.prompt, topic: room.question.topic, difficulty: room.question.difficulty } : null,
    deadlineAt: room.deadlineAt, feedbackEndsAt: room.feedbackEndsAt, transitionEndsAt: room.transitionEndsAt,
    feedback: showFeedback && room.feedback ? {
      ...room.feedback,
      yours: { submitted: !!answer, correct: answer ? answer.correct : null, value: answer?.value ?? null },
    } : null,
    yourAnswer: answer ? { submitted: true, value: answer.value } : { submitted: false },
    yourRole, tiebreakPlayers: [...room.tiebreakPlayers],
    winners: [...room.winners], endReason: room.endReason,
    emotes: room.emotes.filter((e) => now - e.at < 5_000).map((e) => ({ ...e })),
    policy: { bonusMode: room.policy.bonusMode, tieToleranceMs: room.policy.tieToleranceMs, reconnectSeconds: room.policy.reconnectGraceMs / 1000, version: room.policy.version },
  };
}
