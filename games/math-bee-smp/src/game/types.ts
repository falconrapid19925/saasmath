import type { Question } from './math.ts';

export type Phase = 'lobby' | 'transition' | 'answering' | 'feedback' | 'tiebreak' | 'results';
export interface Identity { id: string; name: string; avatar: number }
export interface GamePolicy {
  version: string;
  turnMs: number;
  feedbackMs: number;
  transitionMs: number;
  disconnectAfterMs: number;
  reconnectGraceMs: number;
  tieToleranceMs: number;
  bonusMode: 'linear-rounded';
}
export interface Player extends Identity {
  joinedAt: number;
  lastSeenAt: number;
  disconnectedAt: number | null;
  connected: boolean;
  forfeited: boolean;
  left: boolean;
  lives: number;
  score: number;
  x: number;
  z: number;
  lastMoveAt: number;
  lastEmoteAt: number;
}
export interface AnswerRecord {
  playerId: string;
  turnId: string;
  requestId: string;
  value: string;
  correct: boolean;
  at: number;
  elapsedMs: number;
  competitive: boolean;
}
export interface TurnOutcome {
  turnId: string;
  actorId: string;
  round: number;
  correct: boolean;
  value: string | null;
  elapsedMs: number;
  delta: number;
  at: number;
  timedOut: boolean;
}
export interface Receipt {
  playerId: string;
  turnId: string;
  raw: string;
}
export interface Feedback {
  answer: string;
  steps: string[];
  actorCorrect: boolean | null;
  delta: number;
}
export interface Emote { id: string; playerId: string; text: string; at: number }
export interface Room {
  code: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  hostId: string;
  players: Player[];
  phase: Phase;
  policy: GamePolicy;
  /** Server-only entropy; never serialize into a public snapshot. */
  secretSeed: string;
  matchNumber: number;
  matchId: string;
  participantIds: string[];
  matchOrder: string[];
  round: number;
  roundRoster: string[];
  cursor: number;
  actorId: string | null;
  turnId: string;
  turnSequence: number;
  question: Question | null;
  startsAt: number | null;
  deadlineAt: number | null;
  transitionEndsAt: number | null;
  feedbackEndsAt: number | null;
  answers: Record<string, AnswerRecord>;
  receipts: Record<string, Receipt>;
  outcomes: TurnOutcome[];
  feedback: Feedback | null;
  winners: string[];
  endReason: string | null;
  pendingTiebreak: boolean;
  tiebreakUsed: boolean;
  tiebreakPlayers: string[];
  tiebreakResolved: boolean;
  emotes: Emote[];
}
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  lives: number;
  score: number;
  connected: boolean;
  forfeited: boolean;
  x: number;
  z: number;
}
export interface PublicSnapshot {
  code: string;
  version: number;
  serverNow: number;
  phase: Phase;
  round: number;
  maxRounds: 4;
  hostId: string;
  youId: string;
  players: PublicPlayer[];
  actorId: string | null;
  turnId: string;
  question: Pick<Question, 'id' | 'prompt' | 'topic' | 'difficulty'> | null;
  deadlineAt: number | null;
  feedbackEndsAt: number | null;
  transitionEndsAt: number | null;
  feedback: (Feedback & { yours?: { submitted: boolean; correct: boolean | null; value: string | null } }) | null;
  yourAnswer: { submitted: boolean; value?: string };
  yourRole: 'competitor' | 'spectator';
  tiebreakPlayers: string[];
  winners: string[];
  endReason: string | null;
  emotes: Emote[];
  policy: { bonusMode: 'linear-rounded'; tieToleranceMs: number; reconnectSeconds: number; version: string };
}
