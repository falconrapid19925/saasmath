/**
 * Static demo drill for the GitHub Pages landing page (site/index.html).
 *
 * Runs the REAL drill pipeline client-side: authored skill specs ->
 * engineParamsFor translation -> generateSet on a fresh seed -> gradeItems ->
 * starsForSet + decideGate, exactly as the server does it. Two honest
 * differences from the app, stated on the page: grading happens in the
 * browser (the app re-grades server-side) and nothing is persisted.
 *
 * Kept to integer-answer, keyed-entry skills so one input field covers
 * everything the select offers.
 */

import { getSkillSpec } from "../src/data/skills/index";
import { generateSet } from "../src/lib/engine/set";
import {
  countCorrect,
  formatAnswer,
  gradeItems,
  int,
} from "../src/lib/engine/answers";
import type { Answer, IntegerAnswer, Item } from "../src/lib/engine/types";
import { starsForSet } from "../src/lib/engine/stars";
import { decideGate } from "../src/lib/engine/gates";
import { engineParamsFor } from "../src/lib/server/family-params";
import { difficultyFactorForStep } from "../src/lib/server/sct";

/** Curated demo skills: integer answers, "a op b = ..." prompts, kelas 4. */
const DEMO_SKILL_IDS = [
  "k4-add-1000",
  "k4-sub-regroup",
  "k4-mult-facts",
  "k4-div-facts",
  "k4-mult-2x1",
] as const;

/** Gate-action copy for the result card (step 1 = bottom step). */
const GATE_COPY: Record<string, string> = {
  advance: "🎉 Akurat dan cepat — di aplikasi penuh kamu naik ke tingkat berikutnya!",
  tighten: "⏱ Akurat tapi melewati target — target waktumu dirapatkan 10%.",
  promote_fluency_flag: "🚀 Naik tingkat dengan fokus kecepatan (fluency).",
  enter_cpa_mode:
    "📊 Di bawah 80% — di aplikasi penuh kamu mengulang tanpa timer, dibantu model batang.",
  stay: "💪 Dalam target tapi belum 95% — tetap di tingkat ini dengan soal baru.",
  exit_cpa_mode: "⏱ Dua kali bersih di mode bantuan — kembali bertimer.",
};

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`demo: missing #${id}`);
  return el;
};

const select = $("skill-select") as HTMLSelectElement;
const setupView = $("demo-setup");
const playView = $("demo-play");
const resultView = $("demo-result");
const promptEl = $("demo-prompt");
const progressText = $("demo-progress-text");
const progressFill = $("demo-progress-fill");
const answerInput = $("demo-answer") as HTMLInputElement;

/** Session state; playView is visible exactly while a set is running. */
let items: Item[] = [];
let answers: (Answer | null)[] = [];
let sctSeconds = 0;
let startedAt = 0;

for (const id of DEMO_SKILL_IDS) {
  const spec = getSkillSpec(id);
  const option = document.createElement("option");
  option.value = id;
  option.textContent = spec.titleId;
  select.append(option);
}

$("demo-start").addEventListener("click", () => startDrill(select.value));
$("demo-again").addEventListener("click", () => startDrill(select.value));
$("demo-back").addEventListener("click", showSetup);
$("demo-quit").addEventListener("click", showSetup);
$("demo-submit").addEventListener("click", submitAnswer);
answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAnswer();
});
answerInput.addEventListener("input", () => {
  answerInput.style.borderColor = "";
});

function showSetup(): void {
  playView.hidden = true;
  resultView.hidden = true;
  setupView.hidden = false;
}

function startDrill(skillId: string): void {
  const spec = getSkillSpec(skillId);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] as number;
  const set = generateSet({
    skillId: spec.id,
    step: 1,
    seed,
    family: spec.family,
    params: engineParamsFor(spec.family, spec.steps[0].params),
    baseSctSecondsPerItem: spec.baseSctSecondsPerItem,
    difficultyFactor: difficultyFactorForStep(1),
  });
  items = set.items;
  answers = [];
  sctSeconds = set.sctSeconds;
  startedAt = performance.now();

  setupView.hidden = true;
  resultView.hidden = true;
  playView.hidden = false;
  renderItem();
}

function renderItem(): void {
  const index = answers.length;
  promptEl.textContent = items[index]?.prompt ?? "";
  progressText.textContent = `Soal ${index + 1} dari ${items.length}`;
  progressFill.style.width = `${(index / items.length) * 100}%`;
  answerInput.value = "";
  answerInput.focus();
}

function submitAnswer(): void {
  if (playView.hidden) return;
  const raw = answerInput.value.trim();
  const given = parseIntegerAnswer(raw);
  if (raw !== "" && given === null) {
    answerInput.style.borderColor = "var(--bad)";
    answerInput.focus();
    return;
  }
  answers.push(given);
  progressFill.style.width = `${(answers.length / items.length) * 100}%`;
  if (answers.length < items.length) {
    renderItem();
  } else {
    showResult(performance.now() - startedAt);
  }
}

/**
 * Accepts plain digits and the Indonesian thousands convention ("1.000");
 * anything else non-empty is rejected as a typo, not silently skipped.
 */
function parseIntegerAnswer(raw: string): IntegerAnswer | null {
  const cleaned = raw.replace(/\s+/g, "").replace(/\./g, "");
  if (!/^-?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? int(value) : null;
}

function showResult(elapsedMs: number): void {
  const results = gradeItems(items, answers);
  const correct = countCorrect(results);
  const total = items.length;
  const accuracy = correct / total;
  const withinSct = elapsedMs <= sctSeconds * 1000;
  const stars = starsForSet(accuracy, withinSct);
  const gate = decideGate(
    { accuracy, withinSct },
    { cpaMode: false, atBottomStep: true },
  );

  $("demo-score").textContent = `Benar ${correct} dari ${total}`;
  $("demo-time").innerHTML = withinSct
    ? `${formatDuration(elapsedMs / 1000)} — target ${formatDuration(sctSeconds)} ✅`
    : `${formatDuration(elapsedMs / 1000)} — target ${formatDuration(sctSeconds)} ⏱`;
  $("demo-stars").textContent =
    `${stars} ⭐` + (stars > 10 ? " — bonus cepat & teliti!" : "");
  $("demo-gate").textContent = GATE_COPY[gate.decision.action] ?? "";

  const review = $("demo-review");
  review.replaceChildren();
  results.forEach((result, index) => {
    const mark = document.createElement("span");
    mark.className = `mark ${result.correct ? "ok" : "bad"}`;
    mark.textContent = result.correct ? "✓" : "✗";

    const question = document.createElement("span");
    question.className = "q";
    question.textContent = items[index]?.prompt ?? "";

    const answerCol = document.createElement("span");
    answerCol.className = "a";
    const expected = formatAnswer(result.expected);
    if (result.correct) {
      const bold = document.createElement("b");
      bold.textContent = expected;
      answerCol.append(bold);
    } else if (result.given) {
      const wrong = document.createElement("s");
      wrong.textContent = formatAnswer(result.given);
      answerCol.append(wrong, " → ");
      const bold = document.createElement("b");
      bold.textContent = expected;
      answerCol.append(bold);
    } else {
      answerCol.append("→ ");
      const bold = document.createElement("b");
      bold.textContent = expected;
      answerCol.append(bold);
    }

    const row = document.createElement("li");
    row.append(mark, question, answerCol);
    review.append(row);
  });

  playView.hidden = true;
  resultView.hidden = false;
  $("demo-again").focus();
}

/** Indonesian duration text: "47,5 detik" / "1 menit 12 detik". */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${String(rounded).replace(".", ",")} detik`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} menit ${rest} detik`;
}
