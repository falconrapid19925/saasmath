/**
 * Seam tests for the route-handler session helpers (src/lib/server/authz.ts)
 * on in-memory SQLite: children may only access their own data, parents only
 * their own children, and everything requires a session. The cookies()
 * boundary (next/headers) is mocked with a simple cookie jar.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";
import { children } from "@/db/schema";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  hashPassword,
} from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

// Session tokens need a signing secret (src/lib/auth.ts reads it per call).
process.env.AUTH_SECRET ??= "t".repeat(32);

import { HttpError } from "./http";
import { requireChildAccess, requireOwnedChild } from "./authz";

const cookieJar = new Map<string, string>();

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
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

function loginAs(sub: string, role: "parent" | "child") {
  cookieJar.set(SESSION_COOKIE_NAME, createSessionToken({ sub, role }));
}

async function expectHttpError(status: number, fn: () => Promise<unknown>) {
  try {
    await fn();
    expect.unreachable(`expected HttpError ${status}, but the call succeeded`);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(status);
  }
}

describe("authz scoping", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];
  let childOfP1: string;
  let childOfP2: string;

  beforeEach(async () => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
    childOfP1 = await addChild(db, "p1", "Sinta");
    childOfP2 = await addChild(db, "p2", "Dewi");
    cookieJar.clear();
    mocks.cookies.mockResolvedValue({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
      set: (name: string, value: string) => void cookieJar.set(name, value),
      delete: (name: string) => void cookieJar.delete(name),
    });
  });
  afterEach(() => sqlite.close());

  describe("requireChildAccess", () => {
    it("lets a child session access its own data", async () => {
      loginAs(childOfP1, "child");
      const session = await requireChildAccess(db, childOfP1);
      expect(session).toMatchObject({ sub: childOfP1, role: "child" });
    });

    it("lets the owning parent access the child", async () => {
      loginAs("p1", "parent");
      const session = await requireChildAccess(db, childOfP1);
      expect(session).toMatchObject({ sub: "p1", role: "parent" });
    });

    it("rejects a child session reaching another family's child", async () => {
      loginAs(childOfP2, "child");
      await expectHttpError(403, () => requireChildAccess(db, childOfP1));
    });

    it("rejects another parent with 404 (no child existence leak)", async () => {
      loginAs("p2", "parent");
      await expectHttpError(404, () => requireChildAccess(db, childOfP1));
    });

    it("rejects an anonymous caller", async () => {
      await expectHttpError(401, () => requireChildAccess(db, childOfP1));
    });

    it("rejects an expired session", async () => {
      cookieJar.set(
        SESSION_COOKIE_NAME,
        createSessionToken({ sub: "p1", role: "parent", ttlSeconds: -10 }),
      );
      await expectHttpError(401, () => requireChildAccess(db, childOfP1));
    });
  });

  describe("requireOwnedChild", () => {
    it("returns the child row for the owning parent", async () => {
      loginAs("p1", "parent");
      const child = await requireOwnedChild(db, childOfP1);
      expect(child).toMatchObject({ id: childOfP1, parentId: "p1", name: "Sinta" });
    });

    it("rejects another parent with 404", async () => {
      loginAs("p2", "parent");
      await expectHttpError(404, () => requireOwnedChild(db, childOfP1));
    });

    it("rejects a child session (parents only)", async () => {
      loginAs(childOfP1, "child");
      await expectHttpError(401, () => requireOwnedChild(db, childOfP1));
    });
  });
});
