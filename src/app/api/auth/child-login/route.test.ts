/**
 * Route tests for POST /api/auth/child-login — the anonymous credential
 * boundary children use every day. Both limiter layers are exercised through
 * the real handler: the per-name key inside loginChildCredential and the
 * per-IP key the route adds (vary the x-forwarded-for header to isolate
 * either layer). cookies() and the DB are mocked at their boundaries.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drizzle } from "drizzle-orm/better-sqlite3";

import { children } from "@/db/schema";
import { hashPassword, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { RATE_LIMITED_MESSAGE } from "@/lib/server/ratelimit";

import { POST } from "./route";

// Session tokens need a signing secret (src/lib/auth.ts reads it per call).
process.env.AUTH_SECRET ??= "t".repeat(32);

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

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

function post(body: unknown, ip?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/child-login", {
      method: "POST",
      headers: ip ? { "x-forwarded-for": ip } : {},
      body: JSON.stringify(body),
    }),
  );
}

async function addChild(db: ReturnType<typeof makeDb>["db"], name: string, pin: string) {
  const inserted = await db
    .insert(children)
    .values({ parentId: "p1", name, grade: 4, pinHash: hashPassword(pin) })
    .returning({ id: children.id });
  return inserted[0].id;
}

describe("POST /api/auth/child-login", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
    mocks.getDb.mockReturnValue(db);
    cookieJar.clear();
    mocks.cookies.mockResolvedValue({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
      set: (name: string, value: string) => void cookieJar.set(name, value),
      delete: (name: string) => void cookieJar.delete(name),
    });
  });
  afterEach(() => sqlite.close());

  it("answers an unknown name and a wrong PIN with the identical generic error", async () => {
    await addChild(db, "Sinta", "123456");
    const unknown = await post({ name: "Tidak-Ada", pin: "123456" });
    const wrongPin = await post({ name: "Sinta", pin: "000000" });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrongPin.json());
  });

  it("sets the child session cookie on success", async () => {
    const childId = await addChild(db, "Sinta", "123456");
    const res = await post({ name: "Sinta", pin: "123456" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const payload = verifySessionToken(cookieJar.get(SESSION_COOKIE_NAME));
    expect(payload).toEqual({ sub: childId, role: "child", exp: expect.any(Number) });
  });

  it("locks the name after 5 failures even from fresh IPs (per-name limiter)", async () => {
    await addChild(db, "Sinta", "123456");
    for (let i = 0; i < 5; i++) {
      const res = await post({ name: "Sinta", pin: "000000" }, `10.0.0.${i}`);
      expect(res.status).toBe(401);
    }
    const sixth = await post({ name: "Sinta", pin: "123456" }, "10.9.9.9");
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
  });

  it("locks the IP after 5 failures even for fresh names (per-IP limiter)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post({ name: `Anak-${i}`, pin: "123456" }, "10.0.0.99");
      expect(res.status).toBe(401);
    }
    const sixth = await post({ name: "Anak-baru", pin: "123456" }, "10.0.0.99");
    expect(sixth.status).toBe(429);
  });

  it("does not lock a different IP while one IP is locked", async () => {
    await addChild(db, "Putri", "123456");
    for (let i = 0; i < 5; i++) {
      await post({ name: `Anak-${i}`, pin: "123456" }, "10.0.0.99");
    }
    const otherIp = await post({ name: "Putri", pin: "123456" }, "10.0.0.100");
    expect(otherIp.status).toBe(200);
  });
});
