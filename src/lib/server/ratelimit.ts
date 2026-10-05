/**
 * In-memory failed-attempt limiter for the credential-checking endpoints
 * (child name+PIN, child id+PIN, parent email+password, parent register).
 *
 * Per-process state is acceptable for this MVP (single Next.js server); a
 * scaled-out deployment swaps this module for a shared store. Policy per
 * key: after `maxFailures` failed attempts the key locks for
 * `baseLockSeconds`, doubling on every re-lock after expiry up to
 * `maxLockSeconds`; a successful attempt clears the key. Keys are
 * caller-namespaced strings ("child-login:name:…", "parent-login:ip:…", …).
 */

export type RateLimiterOptions = {
  /** Failed attempts before the key locks. */
  maxFailures: number;
  /** First lockout duration, seconds. */
  baseLockSeconds: number;
  /** Upper bound for the doubled lockout, seconds. */
  maxLockSeconds: number;
};

/** Login policy: 5 tries, then 15 minutes, doubling to at most one day. */
export const LOGIN_RATE_LIMIT_OPTIONS: RateLimiterOptions = {
  maxFailures: 5,
  baseLockSeconds: 15 * 60,
  maxLockSeconds: 24 * 60 * 60,
};

export interface RateLimiter {
  /** Seconds the key must wait before the next attempt (0 = allowed now). */
  retryAfterSeconds(key: string): number;
  /** Record a failed attempt; locks the key once maxFailures is reached. */
  recordFailure(key: string): void;
  /** Clear the key after a successful attempt. */
  recordSuccess(key: string): void;
}

interface Entry {
  failures: number;
  /** Unix ms when the current lock ends; 0 = not locked. */
  lockedUntil: number;
  /** Completed lockouts so far (drives the doubling). */
  lockRound: number;
  lastFailureAt: number;
}

/** Bound memory against attacker-chosen keys (names, emails, IPs). */
const MAX_KEYS = 10_000;

export function createRateLimiter(
  options: Partial<RateLimiterOptions> = {},
): RateLimiter {
  const opts: RateLimiterOptions = { ...LOGIN_RATE_LIMIT_OPTIONS, ...options };
  const entries = new Map<string, Entry>();

  function evict(now: number): void {
    // Drop stale entries first, then the oldest-inserted remainder.
    for (const [key, entry] of entries) {
      if (
        entry.lockedUntil <= now &&
        now - entry.lastFailureAt > opts.maxLockSeconds * 1000
      ) {
        entries.delete(key);
      }
      if (entries.size <= MAX_KEYS) return;
    }
    while (entries.size > MAX_KEYS) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    retryAfterSeconds(key: string): number {
      const entry = entries.get(key);
      if (!entry) return 0;
      const now = Date.now();
      return entry.lockedUntil > now
        ? Math.ceil((entry.lockedUntil - now) / 1000)
        : 0;
    },

    recordFailure(key: string): void {
      const now = Date.now();
      let entry = entries.get(key);
      if (!entry) {
        entry = { failures: 0, lockedUntil: 0, lockRound: 0, lastFailureAt: 0 };
        entries.set(key, entry);
      }
      if (entry.lockedUntil > 0 && now >= entry.lockedUntil) {
        // Lock expired: the counter restarts, the escalation is remembered.
        entry.failures = 0;
        entry.lockedUntil = 0;
      }
      entry.failures += 1;
      entry.lastFailureAt = now;
      if (entry.failures >= opts.maxFailures) {
        const seconds = Math.min(
          opts.baseLockSeconds * 2 ** entry.lockRound,
          opts.maxLockSeconds,
        );
        entry.lockedUntil = now + seconds * 1000;
        entry.lockRound += 1;
        entry.failures = 0;
      }
      if (entries.size > MAX_KEYS) evict(now);
    },

    recordSuccess(key: string): void {
      entries.delete(key);
    },
  };
}

/** Shared per-process limiter wired into every login path. */
export const loginRateLimiter = createRateLimiter(LOGIN_RATE_LIMIT_OPTIONS);

/** User-facing 429 copy (all auth error strings are Bahasa Indonesia). */
export const RATE_LIMITED_MESSAGE =
  "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";

/**
 * Best-effort client IP for per-IP limiting: first x-forwarded-for hop,
 * then x-real-ip, else a shared "unknown" bucket (direct dev traffic).
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
