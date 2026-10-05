/**
 * Seam tests for the in-memory failed-attempt limiter that backs every
 * credential-checking path (child name+PIN, child id+PIN, parent
 * email+password, parent register). Expected lock durations are literals
 * derived from the options each test passes in (the independent source of
 * truth), advanced with fake timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOGIN_RATE_LIMIT_OPTIONS,
  clientIp,
  createRateLimiter,
  loginRateLimiter,
} from "./ratelimit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts until maxFailures is reached", () => {
    const limiter = createRateLimiter({ maxFailures: 3, baseLockSeconds: 60 });
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(0);
  });

  it("locks the key for baseLockSeconds at maxFailures", () => {
    const limiter = createRateLimiter({ maxFailures: 3, baseLockSeconds: 60 });
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(60);
  });

  it("re-locks for double the previous window (exponential backoff)", () => {
    const limiter = createRateLimiter({
      maxFailures: 3,
      baseLockSeconds: 60,
      maxLockSeconds: 600,
    });
    for (let i = 0; i < 3; i++) limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(60);
    vi.advanceTimersByTime(60_000);
    // Lock expired; the counter restarts but the escalation is remembered.
    for (let i = 0; i < 3; i++) limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(120);
  });

  it("caps the lock window at maxLockSeconds", () => {
    const limiter = createRateLimiter({
      maxFailures: 1,
      baseLockSeconds: 60,
      maxLockSeconds: 100,
    });
    limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(60);
    vi.advanceTimersByTime(60_000);
    limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(100);
  });

  it("reports 0 again once the lock has expired", () => {
    const limiter = createRateLimiter({ maxFailures: 1, baseLockSeconds: 60 });
    limiter.recordFailure("k");
    vi.advanceTimersByTime(59_999);
    expect(limiter.retryAfterSeconds("k")).toBe(1);
    vi.advanceTimersByTime(1);
    expect(limiter.retryAfterSeconds("k")).toBe(0);
  });

  it("clears the key after a successful attempt", () => {
    const limiter = createRateLimiter({ maxFailures: 2, baseLockSeconds: 60 });
    limiter.recordFailure("k");
    limiter.recordSuccess("k");
    limiter.recordFailure("k");
    expect(limiter.retryAfterSeconds("k")).toBe(0);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ maxFailures: 1, baseLockSeconds: 60 });
    limiter.recordFailure("locked");
    expect(limiter.retryAfterSeconds("other")).toBe(0);
  });
});

describe("loginRateLimiter", () => {
  it("locks after the documented default of 5 failures", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < LOGIN_RATE_LIMIT_OPTIONS.maxFailures; i++) {
        loginRateLimiter.recordFailure("shared-defaults");
      }
      expect(loginRateLimiter.retryAfterSeconds("shared-defaults")).toBe(
        LOGIN_RATE_LIMIT_OPTIONS.baseLockSeconds,
      );
      loginRateLimiter.recordSuccess("shared-defaults");
      expect(loginRateLimiter.retryAfterSeconds("shared-defaults")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const req = new Request("https://saasmath.id/api", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://saasmath.id/api", {
      headers: { "x-real-ip": "198.51.100.2" },
    });
    expect(clientIp(req)).toBe("198.51.100.2");
  });

  it("falls back to a shared unknown bucket without proxy headers", () => {
    expect(clientIp(new Request("https://saasmath.id/api"))).toBe("unknown");
  });
});
