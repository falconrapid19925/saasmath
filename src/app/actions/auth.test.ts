/**
 * Server-action seam tests for src/app/actions/auth.ts — the parent-portal
 * profile switcher (loginChildById). The action sits behind a parent session
 * but still verifies a PIN, so its failures feed the shared limiter keyed by
 * child id (same key namespace as POST /api/auth/child/login). cookies() and
 * the DB are mocked at their boundaries.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drizzle } from "drizzle-orm/better-sqlite3";

import { children } from "@/db/schema";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  hashPassword,
} from "@/lib/auth";
import { RATE_LIMITED_MESSAGE } from "@/lib/server/ratelimit";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/db/index", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

// Session tokens need a signing secret (src/lib/auth.ts reads it per call).
process.env.AUTH_SECRET ??= "t".repeat(32);

import { loginChildById } from "./auth";

const cookieJar = new Map<string, string>();

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  sqlite.exec(`
    CREATE TABLE children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      avatar TEXT,
      pin_hash TEXT NOT NULL,
      stars_balance INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
  `);
  return { sqlite, db };
}

async function addChild(db: ReturnType<typeof makeDb>["db"], parentId: string, name: string) {
  const inserted = await db
    .insert(children)
    .values({ parentId, name, grade: 4, pinHash: hashPassword("123456") })
    .returning({ id: children.id });
  return inserted[0].id;
}

describe("loginChildById", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
    mocks.getDb.mockReturnValue(db);
    cookieJar.clear();
    cookieJar.set(SESSION_COOKIE_NAME, createSessionToken({ sub: "p1", role: "parent" }));
    mocks.cookies.mockResolvedValue({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
      set: (name: string, value: string) => void cookieJar.set(name, value),
      delete: (name: string) => void cookieJar.delete(name),
    });
  });
  afterEach(() => sqlite.close());

  it("rejects a wrong PIN for an owned profile", async () => {
    const childId = await addChild(db, "p1", "Sinta");
    await expect(loginChildById({ childId, pin: "000000" })).resolves.toEqual({
      ok: false,
      error: "PIN salah. Coba lagi ya.",
    });
  });

  it("rejects another family's profile", async () => {
    const childId = await addChild(db, "p2", "Sinta");
    await expect(loginChildById({ childId, pin: "123456" })).resolves.toEqual({
      ok: false,
      error: "Profil tidak ditemukan.",
    });
  });

  it("locks the profile after 5 wrong PINs, even for the correct one", async () => {
    const childId = await addChild(db, "p1", "Sinta");
    for (let i = 0; i < 5; i++) {
      const attempt = await loginChildById({ childId, pin: "000000" });
      expect(attempt).toEqual({ ok: false, error: "PIN salah. Coba lagi ya." });
    }
    await expect(loginChildById({ childId, pin: "123456" })).resolves.toEqual({
      ok: false,
      error: RATE_LIMITED_MESSAGE,
    });
  });
});
