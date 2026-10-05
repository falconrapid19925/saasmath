/**
 * Page test for /orangtua (server component, awaited and statically
 * rendered): the child profile list must show each child's real avatar emoji
 * resolved from shop_items (the getChildHomeData pattern), not a hardcoded
 * placeholder. Session, dashboard actions and the DB are mocked at their
 * boundaries; the avatar lookup goes through the real getDb mock + schema.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { schema } from "@/db";
import { children, shopItems } from "@/db/schema";

import ParentDashboardPage from "./page";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSession: vi.fn(),
  logoutForm: vi.fn(),
  getParentDashboard: vi.fn(),
  getMyChildren: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT (unexpected in this test)");
  },
}));
vi.mock("@/app/actions/auth", () => ({
  getSession: mocks.getSession,
  logoutForm: mocks.logoutForm,
}));
vi.mock("@/app/actions/dashboard", () => ({
  getParentDashboard: mocks.getParentDashboard,
  getMyChildren: mocks.getMyChildren,
  makeWeeklyReportPdf: vi.fn(),
}));

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
    CREATE TABLE shop_items (
      id TEXT PRIMARY KEY,
      name_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      price_stars INTEGER NOT NULL,
      emoji_or_color TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE subscriptions (
      child_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      trial_ends_at INTEGER,
      createdAt INTEGER NOT NULL
    );
  `);
  return { sqlite, db };
}

describe("GET /orangtua (parent dashboard page)", () => {
  beforeEach(() => {
    const made = makeDb();
    mocks.getDb.mockReturnValue(made.db);
    mocks.getSession.mockResolvedValue({ sub: "parent-1", role: "parent" });
    mocks.getParentDashboard.mockResolvedValue({
      parentName: "Opa",
      weekLabel: "2 minggu terakhir",
      children: [],
    });
  });

  it("renders each child's real avatar emoji from shop_items", async () => {
    const db = mocks.getDb();
    await db.insert(shopItems).values({
      id: "avatar-cat",
      nameId: "Kucing",
      kind: "avatar",
      priceStars: 40,
      emojiOrColor: { emoji: "🐱" },
    });
    await db.insert(children).values([
      {
        id: "child-ava-1",
        parentId: "parent-1",
        name: "Budi",
        grade: 4,
        pinHash: "scrypt:00:00",
        avatar: "avatar-cat",
      },
      {
        id: "child-ava-2",
        parentId: "parent-1",
        name: "Sinta",
        grade: 5,
        pinHash: "scrypt:00:00",
        avatar: null,
      },
    ]);
    mocks.getMyChildren.mockResolvedValue([
      { id: "child-ava-1", name: "Budi", grade: 4, avatar: "avatar-cat" },
      { id: "child-ava-2", name: "Sinta", grade: 5, avatar: null },
    ]);

    const markup = renderToStaticMarkup(await ParentDashboardPage());

    expect(markup).toContain("Budi");
    expect(markup).toContain("🐱");
  });
});
