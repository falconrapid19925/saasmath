/**
 * Typed browser client for the drill API routes (src/app/api/**). The routes
 * are the integration contract with the API builder — this module is the ONLY
 * place the UI's raw response shapes live. All calls are same-origin fetches
 * so the session cookie flows automatically.
 */

import type { GateLadderState } from "@/lib/engine/gates";
import type { HintModel, Item } from "@/lib/engine/types";
import type { TaskRequest } from "@/lib/client/view-models";

/**
 * One friendly line for any fetch-level failure (offline, DNS, captive
 * portal). Raw browser messages ("Failed to fetch") leak English jargon to
 * Indonesian children — every call site passes `err.message` through, so the
 * mapping happens HERE, at the single fetch seam.
 */
const OFFLINE_ERROR_MESSAGE = "Tidak ada internet — coba lagi ya.";

/** Same-origin fetch that never rejects with a raw browser error. */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(OFFLINE_ERROR_MESSAGE);
  }
}

async function parseJsonOrError<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Permintaan gagal (${res.status}).`);
  }
  if (body === null) throw new Error("Respons server tidak valid.");
  return body;
}

// ---------------------------------------------------------------------------
// POST /api/session/next
// ---------------------------------------------------------------------------

type NextTaskResponse =
  | {
      kind: "progression" | "review" | "cpa";
      reason: string;
      today: string;
      skill: { id: string; titleId: string; strand: string; family: string; grade: number };
      step: number;
      stepCount: number;
      seed: number;
      items: Item[];
      sctSeconds: number;
      timed: boolean;
      gateLadder: GateLadderState;
      cpaModels: HintModel[];
    }
  | { kind: "placement_required"; reason: string };

/**
 * Load the next set for the logged-in child. The route includes the
 * server-folded gate ladder state, so the result screen predicts with ONE
 * engine decideGate call (src/lib/engine/gates.ts) on the same state the
 * server's submit/sync pipeline folds; the authoritative gate still arrives
 * in the /api/sync response after submission.
 */
export async function fetchNextTask(): Promise<TaskRequest> {
  const res = await apiFetch("/api/session/next", { method: "POST" });
  const body = await parseJsonOrError<NextTaskResponse>(res);
  if (body.kind === "placement_required") return { status: "needs_placement" };
  return {
    status: "ok",
    task: {
      kind: body.kind,
      reason: body.reason,
      skillId: body.skill.id,
      skillTitle: body.skill.titleId,
      strand: body.skill.strand,
      step: body.step,
      stepCount: body.stepCount,
      seed: body.seed,
      items: body.items,
      itemCount: body.items.length,
      sctSeconds: body.sctSeconds,
      timed: body.timed,
      cpaMode: body.kind === "cpa",
      masteryState: "Baru",
      fluencyFlag: false,
      gateLadder: body.gateLadder,
    },
  };
}

// ---------------------------------------------------------------------------
// GET/POST /api/placement
// ---------------------------------------------------------------------------

/** Mirrors GET /api/placement (route: src/app/api/placement/route.ts). */
export type PlacementGetResponse = {
  childId: string;
  /** Regenerate the identical ladder on POST — nothing client-sent is trusted. */
  seed: number;
  totalItems: number;
  rungs: { skillId: string; usable: boolean }[];
  items: Item[];
  access: "free" | "full";
};

export async function fetchPlacement(childId: string): Promise<PlacementGetResponse> {
  const res = await apiFetch(`/api/placement?childId=${encodeURIComponent(childId)}`);
  return parseJsonOrError<PlacementGetResponse>(res);
}

/** Mirrors POST /api/placement. */
export type PlacementPostResponse = {
  placedSkill: { id: string; step: number; titleId: string };
  clampedFromRung: number | null;
  lastPassedRung: number;
  firstFailedRung: number | null;
  rungsAttempted: number;
  correctCount: number;
  total: number;
  note: string;
};

export async function submitPlacementApi(input: {
  childId: string;
  seed: number;
  answers: (import("@/lib/engine/types").Answer | null)[];
}): Promise<PlacementPostResponse> {
  const res = await apiFetch("/api/placement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonOrError<PlacementPostResponse>(res);
}

// ---------------------------------------------------------------------------
// POST /api/auth/* — credential-establishing endpoints (anonymous by design)
// ---------------------------------------------------------------------------

/** Result shape shared by the auth forms (src/components/auth/AuthForms.tsx). */
export type AuthActionResult = { ok: true } | { ok: false; error: string };

async function postAuthEndpoint(
  endpoint: string,
  body: unknown,
): Promise<AuthActionResult> {
  let res: Response;
  try {
    res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // The auth forms render `error` from the result — a network failure is a
    // failed attempt with the friendly message, not a thrown exception.
    return { ok: false, error: OFFLINE_ERROR_MESSAGE };
  }
  // Credential endpoints always answer with a JSON body: 200 carries
  // { ok: true }, 4xx carries { ok: false, error }. res.ok is checked before
  // the body is consumed (fetch resolves on HTTP 4xx/5xx too); a non-JSON
  // or 5xx response falls back to the status-derived message.
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: err?.error ?? `Permintaan gagal (${res.status}).` };
  }
  const parsed = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (parsed?.ok === true) return { ok: true };
  return { ok: false, error: parsed?.error ?? `Permintaan gagal (${res.status}).` };
}

/** Parent sign-up (POST /api/auth/register). */
export function registerParentApi(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  return postAuthEndpoint("/api/auth/register", input);
}

/** Parent email + password sign-in (POST /api/auth/login). */
export function loginParentApi(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  return postAuthEndpoint("/api/auth/login", input);
}

/** Child name + PIN sign-in on the family device (POST /api/auth/child-login). */
export function loginChildApi(input: {
  name: string;
  pin: string;
}): Promise<AuthActionResult> {
  return postAuthEndpoint("/api/auth/child-login", input);
}
