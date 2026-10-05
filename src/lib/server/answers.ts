/**
 * Server-side grading — thin adapter over the drill engine's grading
 * semantics (src/lib/engine/answers.ts). The client grades first for instant
 * feedback; the server re-grades every submission with the same engine
 * functions so parent-visible records are server-validated (plan section 6).
 *
 * Engine grading semantics (deliberate, documented there): answers compare by
 * NUMERIC VALUE across kinds — 1/2 == 2/4 == 0,5 == 5 — with unitValue
 * requiring the same unit string. formatAnswer renders Indonesian-style
 * (0,5 / Rp1.250 / 2 1/4).
 */

import {
  answersEqual as engineAnswersEqual,
  formatAnswer as engineFormatAnswer,
} from "../engine/answers";
import type { Answer } from "../engine/types";
import type { Item, ItemResult } from "../engine/types";

export { engineAnswersEqual as answersEqual, engineFormatAnswer as formatAnswer };

export type GradeResult = {
  correctCount: number;
  total: number;
  items: ItemResult[];
};

/**
 * Grade the child's answers (aligned with `items`; null = skipped) against
 * the expected answers, with engine equality semantics.
 */
export function gradeItems(items: Item[], given: (Answer | null)[]): GradeResult {
  if (given.length !== items.length) {
    throw new Error(
      `gradeItems: answers length (${given.length}) != items length (${items.length})`,
    );
  }

  const itemResults: ItemResult[] = items.map((item, i) => {
    const answer = given[i] ?? null;
    const correct = answer !== null && engineAnswersEqual(item.answer, answer);
    return { itemId: item.id, given: answer, expected: item.answer, correct };
  });

  return {
    correctCount: itemResults.filter((r) => r.correct).length,
    total: items.length,
    items: itemResults,
  };
}

/** "6 m 20 dtk" — Bahasa duration for digests (server-side only need). */
export function formatDurationId(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} dtk`;
  return `${minutes} m ${seconds} dtk`;
}
