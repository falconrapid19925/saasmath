/**
 * View-model types shared between server actions (src/app/actions/*) and
 * client components. Plain JSON-serializable shapes only. Deliberately thin
 * over the canonical server contracts:
 * - tasks mirror what POST /api/session/next returns (decideNextTask + the
 *   engine), so the drill player and the API agree by construction;
 * - the predicted gate is one engine decideGate call (src/lib/engine/gates.ts,
 *   pure) fed the server-provided ladder state — the exact function the
 *   server's submit/sync pipeline folds;
 * - placement mirrors GET/POST /api/placement (entries + answers echoed).
 */

import type { GateLadderState } from "@/lib/engine/gates";
import type { GateDecision, Item } from "@/lib/engine/types";

/**
 * Mirror of the DB enum MASTERY_STATES (src/db/schema.ts) — redeclared here
 * so client view models never import the schema module.
 */
export type MasteryStateView = "Baru" | "Lancar" | "Kuasai";

// ---------------------------------------------------------------------------
// Drill task (mirrors POST /api/session/next)
// ---------------------------------------------------------------------------

/** The next set for a child: everything the drill player needs. */
export type TaskDescriptor = {
  /** decideNextTask kind: "progression" | "review" | "cpa". */
  kind: "progression" | "review" | "cpa";
  reason: string;
  skillId: string;
  skillTitle: string;
  strand: string;
  step: number;
  /** Total steps in the skill (server-provided via /api/session/next). */
  stepCount: number;
  /** Canonical set seed (setSeed output) — stored in attempts.seed. */
  seed: number;
  items: Item[];
  itemCount: number;
  /** The SCT this set is SERVED with (already tightened), in seconds. */
  sctSeconds: number;
  timed: boolean;
  cpaMode: boolean;
  masteryState: MasteryStateView;
  fluencyFlag: boolean;
  /**
   * The gate ladder state as of this task, server-folded from the child's
   * attempt episode (src/lib/server/gate.episodeState). The result screen
   * predicts with ONE engine decideGate call on the same state the server's
   * pipeline folds at submit time. INITIAL for review sets (the SM-2 review
   * gate does not use the ladder).
   */
  gateLadder: GateLadderState;
};

export type TaskRequest =
  | { status: "ok"; task: TaskDescriptor }
  | { status: "needs_placement" }
  | { status: "unavailable"; reason: string };

/**
 * The gate evaluation shown on the result screen. "server" = authoritative
 * (from the /api/sync response); "predicted" = the engine's decideGate run
 * on-device against the served ladder state, shown until the sync round-trip
 * confirms it.
 */
export type ClientGateEvaluation = {
  source: "server" | "predicted";
  decision: GateDecision;
  accuracy: number;
  withinSct: boolean;
};

// ---------------------------------------------------------------------------
// Placement (mirrors GET/POST /api/placement)
// ---------------------------------------------------------------------------

export type PlacementEntry = {
  skillId: string;
  /** Known only when the task is built server-side; /api/placement omits it. */
  skillTitle?: string;
  step: 1;
  /** Canonical seed (setSeed output) the entry's items regenerate from. */
  seed: number;
  itemCount: number;
  items: Item[];
};

export type PlacementSubmitEntry = {
  skillId: string;
  step: 1;
  seed: number;
  itemCount: number;
};

export type PlacementOutcome = {
  placedSkillId: string;
  placedTitle: string;
  placedStep: number;
  correctCount: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Child home
// ---------------------------------------------------------------------------

export type SkillMasteryView = {
  id: string;
  titleId: string;
  strand: string;
  state: MasteryStateView;
  step: number;
  stepCount: number;
  cpaMode: boolean;
  fluencyFlag: boolean;
  isCurrent: boolean;
};

export type IslandView = {
  /** Strand name doubles as the island name: "Pulau Bilangan" etc. */
  strand: string;
  isFreeIsland: boolean;
  skills: SkillMasteryView[];
};

export type ChildHomeData = {
  child: {
    id: string;
    name: string;
    grade: number;
    avatar: string | null;
    /**
     * Resolved emoji for the equipped avatar shop item (or the default
     * smiley) — resolved server-side so the header never renders a raw item
     * id string.
     */
    avatarEmoji: string;
    starsBalance: number;
  };
  streak: {
    current: number;
    best: number;
    freezesLeft: number;
    doneToday: boolean;
  };
  needsPlacement: boolean;
  islands: IslandView[];
};

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export type ShopItemView = {
  id: string;
  nameId: string;
  kind: "avatar" | "room";
  priceStars: number;
  emoji: string | null;
  color: string | null;
  owned: boolean;
  equipped: boolean;
};

export type ShopData = {
  balance: number;
  items: ShopItemView[];
};

// ---------------------------------------------------------------------------
// Parent dashboard (mirrors buildWeeklySummary + renderWeeklyDigest)
// ---------------------------------------------------------------------------

export type ChildSummaryLite = {
  id: string;
  name: string;
  grade: number;
  avatar: string | null;
};

export type ChildWeeklySummary = {
  childId: string;
  childName: string;
  grade: number;
  setsDone: number;
  avgAccuracy: number | null;
  avgTimeMs: number | null;
  withinSctCount: number;
  starsWeek: number;
  flaggedCount: number;
  streak: { current: number; best: number; freezesLeft: number };
  /** Last 14 days, oldest first. */
  calendar: { date: string; done: boolean }[];
  currentSkillTitle: string | null;
  masteryCounts: { Baru: number; Lancar: number; Kuasai: number };
  digestPreview: string;
  /** Recent sets, newest first, for per-set PDF downloads (/api/sets/[id]/pdf). */
  recentSets: { attemptId: string; label: string; withinSct: boolean }[];
};

export type ParentDashboardData = {
  parentName: string;
  weekLabel: string;
  children: ChildWeeklySummary[];
};
