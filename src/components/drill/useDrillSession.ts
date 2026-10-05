"use client";

/**
 * Drill session state machine (plan sections 3.1, 3.2, 4.4), extracted from
 * the DrillPlayer component so the phase views stay presentational:
 * - invisible timer during play; actual-vs-SCT shown only after submit
 * - in-session self-correction of flagged items, timer still running
 *   (Kumon SCT includes correction time)
 * - CPA hint ladder: a stall (45s) offers the pictorial hint during play;
 *   after one failed correction the hint opens; two failed corrections
 *   escalate to a worked example
 * - the predicted result gate is ONE engine decideGate call on the ladder
 *   state the server served with the set; the /api/sync response overrides it
 * - the graded attempt is queued in the offline outbox and synced to
 *   /api/sync; every successful load caches the "last offered set" so a cold
 *   start offline can replay it (clearly labeled), and the result note
 *   follows this attempt's own sync outcome
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useOutbox } from "@/components/SyncIndicator";
import {
  loadLastOfferedTask,
  queueAttempt,
  saveLastOfferedTask,
} from "@/lib/client/outbox";
import {
  answersEqual,
  countCorrect,
  emptyDraft,
  gradeItems,
  parseDraft,
  type AnswerDraft,
} from "@/lib/client/answers";
import { decideGate } from "@/lib/engine/gates";
import { fetchNextTask } from "@/lib/client/api";
import type {
  ClientGateEvaluation,
  TaskDescriptor,
} from "@/lib/client/view-models";
import type { Item, ItemResult } from "@/lib/engine/types";

export type DrillPhase =
  | "loading"
  | "unavailable"
  | "needs_placement"
  | "play"
  | "correct"
  | "result";
/**
 * The result note follows THIS attempt's own sync outcome: "synced" only
 * when the server applied (or had already seen) this very record,
 * "rejected" when the server permanently refused it, "offline" when it
 * stays queued locally.
 */
export type SyncState = "pending" | "synced" | "offline" | "rejected";

const STALL_SECONDS = 45;
/** Mirror of STARS_PER_SET / STARS_SCT_BONUS in src/lib/server/attempts.ts. */
const STARS_PER_SET = 10;
const STARS_SCT_BONUS = 5;

/**
 * Derive the sync note from the shared outbox status: a still-pending result
 * counts as synced once the outbox is empty, online, and has synced before.
 * Explicit outcomes ("rejected", "offline") always pass through untouched.
 */
function deriveEffectiveSync(
  syncState: SyncState,
  pendingCount: number,
  online: boolean,
  lastSync: Date | null,
): SyncState {
  if (syncState === "pending" && pendingCount === 0 && online && lastSync !== null) {
    return "synced";
  }
  return syncState;
}

export function useDrillSession(childKey: string) {
  const router = useRouter();
  const {
    refresh: refreshOutbox,
    pendingCount,
    online,
    lastSync,
  } = useOutbox();

  const [task, setTask] = useState<TaskDescriptor | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DrillPhase>("loading");
  // True when the mounted set is the cached replay of the last offered set
  // (cold start offline) — the play view labels it so the child knows.
  const [offlineReplay, setOfflineReplay] = useState(false);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  // Answered-so-far map: read only while advancing (never rendered), so a
  // ref keeps per-item taps from re-rendering the player.
  const answersRef = useRef<Record<string, Item["answer"] | null>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [results, setResults] = useState<ItemResult[] | null>(null);
  const [gate, setGate] = useState<ClientGateEvaluation | null>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [starsEarned, setStarsEarned] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("pending");

  const [queue, setQueue] = useState<number[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [correctTries, setCorrectTries] = useState<Record<string, number>>({});
  const [hintItemId, setHintItemId] = useState<string | null>(null);
  const [workedItemId, setWorkedItemId] = useState<string | null>(null);
  const [hintUsedItems, setHintUsedItems] = useState<Set<string>>(new Set());
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [corrDraft, setCorrDraft] = useState<AnswerDraft | null>(null);

  const [stallItem, setStallItem] = useState<string | null>(null);
  const startedAt = useRef<number>(0);
  const [loadingNext, setLoadingNext] = useState(false);

  // Load the next set from POST /api/session/next on mount (async callback
  // setState, not synchronous effect state). A missing placement is rendered
  // as its own phase — the page guard redirects server-side in the normal
  // flow, so this screen is only a race fallback. Every successful load also
  // refreshes the cached "last offered set" for cold-start offline replay;
  // a failed (offline) load falls back to that cache instead of dead-ending.
  useEffect(() => {
    let cancelled = false;
    fetchNextTask()
      .then((next) => {
        if (cancelled) return;
        if (next.status === "ok") {
          setTask(next.task);
          setPhase("play");
          setOfflineReplay(false);
          void saveLastOfferedTask(childKey, next.task);
        } else if (next.status === "needs_placement") {
          setPhase("needs_placement");
        } else {
          setLoadError(next.reason);
          setPhase("unavailable");
        }
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        const last = await loadLastOfferedTask(childKey);
        if (cancelled) return;
        if (last) {
          // Cold start offline: replay the last offered set, clearly labeled.
          setTask(last);
          setPhase("play");
          setOfflineReplay(true);
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Tidak bisa memuat set.");
        setPhase("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [childKey]);

  const item = task?.items[idx];
  const timed = task?.timed ?? true;
  const stallReached =
    timed && item !== undefined && stallItem === item.id && !hintUsedItems.has(item.id);
  const hintOpenForPlay = item !== undefined && hintItemId === item.id;
  const hintAvailable =
    Boolean(item?.hint) && ((task?.cpaMode ?? false) || stallReached || hintOpenForPlay);

  // Session clock starts when the task mounts (invisible; read on submit).
  useEffect(() => {
    if (!task) return;
    startedAt.current = Date.now();
  }, [task]);

  // Stall watchdog: after 45s on one item, mark that item so its hint button
  // appears. setState happens inside the interval callback, not the effect.
  useEffect(() => {
    if (!timed || !item) return;
    const itemId = item.id;
    const shownAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - shownAt >= STALL_SECONDS * 1000) setStallItem(itemId);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [item, timed]);

  const draftFor = useCallback(
    (it: Item): AnswerDraft => {
      const units = it.answer.kind === "unitValue" ? [it.answer.unit] : [];
      return drafts[it.id] ?? emptyDraft(it.answerType, units);
    },
    [drafts],
  );

  const setDraft = useCallback((it: Item, d: AnswerDraft) => {
    setDrafts((prev) => ({ ...prev, [it.id]: d }));
    setNotice(null);
  }, []);

  const openHint = useCallback((it: Item) => {
    setHintItemId(it.id);
    setHintUsedItems((prev) => new Set(prev).add(it.id));
  }, []);

  // --- submission (declared before its callers) ----------------------------

  const finish = useCallback(
    async (graded: ItemResult[], elapsed: number) => {
      if (!task) return;
      setPhase("result");
      setSyncState("pending");
      try {
        const recordId = await queueAttempt({
          skillId: task.skillId,
          step: task.step,
          seed: task.seed,
          answers: graded.map((r) => r.given),
          timeMs: elapsed,
          completedAt: new Date().toISOString(),
        });
        const flush = await refreshOutbox();
        const outcome = flush?.outcomes[recordId];
        if (outcome?.gate) {
          // The server's decision is authoritative — override the predictor.
          setGate({
            source: "server",
            decision: outcome.gate,
            accuracy: graded.length > 0 ? countCorrect(graded) / graded.length : 0,
            withinSct: elapsed <= task.sctSeconds * 1000,
          });
          if (typeof outcome.starsAwarded === "number") {
            setStarsEarned(outcome.starsAwarded);
          }
        }
        // The note follows THIS record's own outcome, not the flush batch's:
        // another record applying says nothing about this one (it may still
        // be queued past the 10-cap batch, or the server may have refused it).
        setSyncState(
          outcome?.status === "applied" || outcome?.status === "duplicate"
            ? "synced"
            : outcome?.status === "rejected"
              ? "rejected"
              : "offline",
        );
      } catch {
        setSyncState("offline");
      }
      router.refresh();
    },
    [task, refreshOutbox, router],
  );

  const submitAll = useCallback(
    (items: Item[], finalAnswers: Record<string, Item["answer"] | null>) => {
      if (!task) return;
      const ordered = items.map((i) => finalAnswers[i.id] ?? null);
      const graded = gradeItems(items, ordered);
      const elapsed = timed ? Date.now() - startedAt.current : 0;
      const correctCount = countCorrect(graded);
      const accuracy = graded.length > 0 ? correctCount / graded.length : 0;
      // Engine outcome input: measured against the SERVED SCT (tightening
      // already included). Untimed CPA sets record elapsed 0, like the server.
      const withinSct = elapsed <= task.sctSeconds * 1000;
      // Provisional (predictor) evaluation — one engine decideGate call on
      // the ladder state the server served this set with, the exact pure
      // function the server's submit/sync pipeline folds. The authoritative
      // gate arrives in the /api/sync response and overrides this in finish().
      const predicted = decideGate(
        { accuracy, withinSct },
        { cpaMode: task.cpaMode, atBottomStep: task.step <= 1 },
        task.gateLadder,
      );
      setTimeMs(elapsed);
      setResults(graded);
      setGate({
        source: "predicted",
        decision: predicted.decision,
        accuracy,
        withinSct,
      });
      setStarsEarned(timed && withinSct ? STARS_PER_SET + STARS_SCT_BONUS : STARS_PER_SET);

      const wrong = graded.map((r, i) => ({ r, i })).filter((x) => !x.r.correct);
      if (wrong.length > 0) {
        setQueue(wrong.map((x) => x.i));
        setQIdx(0);
        setPhase("correct");
      } else {
        void finish(graded, elapsed);
      }
    },
    [finish, task, timed],
  );

  const advancePlay = useCallback(
    (given: Item["answer"] | null) => {
      if (!item || !task) return;
      const next = { ...answersRef.current, [item.id]: given };
      answersRef.current = next;
      setStallItem(null);
      if (idx + 1 < task.items.length) {
        setIdx(idx + 1);
      } else {
        submitAll(task.items, next);
      }
    },
    [idx, item, submitAll, task],
  );

  const commitAndAdvance = useCallback(() => {
    if (!item) return;
    const parsed = parseDraft(draftFor(item));
    if (parsed === null) {
      setNotice("Isi jawabannya dulu, atau ketuk Lewati.");
      return;
    }
    advancePlay(parsed);
  }, [advancePlay, draftFor, item]);

  const skip = useCallback(() => {
    advancePlay(null);
  }, [advancePlay]);

  // --- self-correction (declared before its callers) -----------------------

  const currentWrong = useMemo(
    () =>
      task && results && queue[qIdx] !== undefined
        ? { item: task.items[queue[qIdx]], result: results[queue[qIdx]] }
        : null,
    [qIdx, queue, results, task],
  );

  const advanceQueue = useCallback(() => {
    setResolvedItems((prev) => new Set(prev).add(currentWrong?.item.id ?? ""));
    setWorkedItemId(null);
    setHintItemId(null);
    setCorrDraft(null);
    setNotice(null);
    if (qIdx + 1 < queue.length) {
      setQIdx(qIdx + 1);
    } else if (results) {
      // Kumon SCT includes self-correction time: the clock stops HERE, when
      // the correction queue finishes — not at the first-pass submit. (The
      // pre-correction elapsed was only the prediction input.)
      const finalElapsed = timed ? Date.now() - startedAt.current : 0;
      setTimeMs(finalElapsed);
      void finish(results, finalElapsed);
    }
  }, [currentWrong, finish, qIdx, queue.length, results, timed]);

  const bumpCorrectionTries = useCallback(
    (itemId: string) => {
      const tries = (correctTries[itemId] ?? 0) + 1;
      setCorrectTries((prev) => ({ ...prev, [itemId]: tries }));
      const wrong = task?.items.find((i) => i.id === itemId);
      if (tries >= 2 && wrong?.hint) {
        // Ladder escalation: worked example after two failed corrections.
        setWorkedItemId(itemId);
        setHintUsedItems((prev) => new Set(prev).add(itemId));
      } else if (tries >= 1 && wrong?.hint) {
        openHint(wrong);
        setNotice("Coba sekali lagi, sekarang pakai bantuan gambar.");
      } else {
        setNotice("Belum tepat. Periksa lagi pelan-pelan ya.");
      }
    },
    [correctTries, openHint, task],
  );

  const submitCorrection = useCallback(() => {
    if (!currentWrong) return;
    const parsed = corrDraft ? parseDraft(corrDraft) : null;
    if (parsed === null) {
      setNotice("Tulis jawaban perbaikanmu dulu ya.");
      return;
    }
    if (answersEqual(parsed, currentWrong.item.answer)) {
      advanceQueue();
      return;
    }
    bumpCorrectionTries(currentWrong.item.id);
  }, [advanceQueue, bumpCorrectionTries, corrDraft, currentWrong]);

  // --- next task (auto-variant repetition, plan 3.1 step 7) ----------------

  const loadNextTask = useCallback(async () => {
    setLoadingNext(true);
    setNotice(null);
    try {
      const next = await fetchNextTask();
      if (next.status === "ok") {
        setTask(next.task);
        setPhase("play");
        setIdx(0);
        setDrafts({});
        answersRef.current = {};
        setResults(null);
        setGate(null);
        setQueue([]);
        setQIdx(0);
        setCorrectTries({});
        setHintUsedItems(new Set());
        setResolvedItems(new Set());
        setWorkedItemId(null);
        setHintItemId(null);
        setCorrDraft(null);
        setStallItem(null);
        setSyncState("pending");
        setOfflineReplay(false);
        void saveLastOfferedTask(childKey, next.task);
      } else if (next.status === "needs_placement") {
        // User-triggered path (button click on the result screen).
        router.push("/anak/penempatan");
      } else {
        setNotice(next.reason);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Tidak bisa menyiapkan set baru.");
    } finally {
      setLoadingNext(false);
    }
  }, [childKey, router]);

  // Derive the sync note from the shared outbox status (no effect needed).
  const effectiveSync = deriveEffectiveSync(syncState, pendingCount, online, lastSync);

  const workedItem =
    workedItemId && task ? (task.items.find((i) => i.id === workedItemId) ?? null) : null;

  return {
    phase,
    loadError,
    offlineReplay,
    task,
    item,
    idx,
    timed,
    stallReached,
    hintAvailable,
    notice,
    draftFor,
    setDraft,
    commitAndAdvance,
    skip,
    openHint,
    advancePlay,
    currentWrong,
    qIdx,
    queueLength: queue.length,
    correctTries,
    hintItemId,
    workedItem,
    corrDraft,
    setCorrDraft,
    submitCorrection,
    advanceQueue,
    bumpCorrectionTries,
    results,
    gate,
    timeMs,
    starsEarned,
    effectiveSync,
    hintUsedItems,
    resolvedItems,
    loadingNext,
    loadNextTask,
  };
}

export type DrillSession = ReturnType<typeof useDrillSession>;
