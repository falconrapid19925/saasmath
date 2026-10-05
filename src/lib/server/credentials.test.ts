/**
 * Credential-establishing flows (POST /api/auth/register, /api/auth/login,
 * /api/auth/child-login). These endpoints run for anonymous callers by
 * design, so their contract is validated directly: identical input handling
 * and Bahasa error messages as the former server actions.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";

import { schema } from "../../db";
import { children, parents } from "../../db/schema";
import { hashPassword } from "../auth";
import {
  loginChildCredential,
  loginParentCredential,
  registerParentCredential,
} from "./credentials";
import { RATE_LIMITED_MESSAGE } from "./ratelimit";

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE parents (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
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

describe("registerParentCredential", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  it("rejects invalid input with the Bahasa message", async () => {
    const result = await registerParentCredential(db, {
      name: "A",
      email: "budi@example.com",
      password: "rahasia-panjang",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "Nama minimal 2 huruf." });
  });

  it("creates the parent and returns its id as the session subject", async () => {
    const result = await registerParentCredential(db, {
      name: "Budi",
      email: "budi@example.com",
      password: "rahasia-panjang",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.role).toBe("parent");

    const rows = await db.select().from(parents).where(eq(parents.email, "budi@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(result.sub);
    expect(rows[0].passwordHash).not.toBe("rahasia-panjang");
    expect(rows[0].passwordHash.startsWith("scrypt:")).toBe(true);
  });

  it("rejects a duplicate email without inserting", async () => {
    await registerParentCredential(db, {
      name: "Budi",
      email: "budi@example.com",
      password: "rahasia-panjang",
    });
    const second = await registerParentCredential(db, {
      name: "Budi lagi",
      email: "budi@example.com",
      password: "rahasia-panjang",
    });
    expect(second).toEqual({
      ok: false,
      status: 409,
      error: "Email sudah terdaftar. Coba masuk.",
    });
    const rows = await db.select().from(parents);
    expect(rows).toHaveLength(1);
  });
});

describe("loginParentCredential", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  it("rejects a wrong password without leaking which part failed", async () => {
    await db.insert(parents).values({
      email: "budi@example.com",
      passwordHash: hashPassword("rahasia-panjang"),
      name: "Budi",
    });
    const result = await loginParentCredential(db, {
      email: "budi@example.com",
      password: "salah-sekali",
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Email atau kata sandi salah.",
    });
  });

  it("rejects an unknown email with the same message", async () => {
    const result = await loginParentCredential(db, {
      email: "tidak-ada@example.com",
      password: "apapun-itu",
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Email atau kata sandi salah.",
    });
  });

  it("verifies the password and returns the parent id", async () => {
    const inserted = await db
      .insert(parents)
      .values({
        email: "budi@example.com",
        passwordHash: hashPassword("rahasia-panjang"),
        name: "Budi",
      })
      .returning({ id: parents.id });
    const result = await loginParentCredential(db, {
      email: "budi@example.com",
      password: "rahasia-panjang",
    });
    expect(result).toEqual({ ok: true, sub: inserted[0].id, role: "parent" });
  });
});

describe("loginChildCredential", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  function addChild(name: string, pin: string) {
    return db
      .insert(children)
      .values({ parentId: "p1", name, grade: 4, pinHash: hashPassword(pin) })
      .returning({ id: children.id });
  }

  it("rejects an unknown name with the same generic error as a wrong PIN", async () => {
    const result = await loginChildCredential(db, { name: "Sinta", pin: "123456" });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Nama atau PIN belum benar. Coba lagi ya.",
    });
  });

  it("rejects a wrong PIN with the same generic error as an unknown name", async () => {
    const inserted = await addChild("Sinta", "123456");
    const result = await loginChildCredential(db, { name: "Sinta", pin: "654321" });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Nama atau PIN belum benar. Coba lagi ya.",
    });
    expect((await db.select().from(children)).map((c) => c.id)).toEqual([inserted[0].id]);
  });

  it("rejects duplicate names toward the parent portal", async () => {
    await addChild("Sinta", "123456");
    await db
      .insert(children)
      .values({ parentId: "p2", name: "Sinta", grade: 5, pinHash: hashPassword("111111") });
    const result = await loginChildCredential(db, { name: "Sinta", pin: "123456" });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error:
        "Ada beberapa anak dengan nama yang sama. Masuk lewat portal orang tua.",
    });
  });

  it("logs the child in by name + PIN", async () => {
    const inserted = await addChild("Sinta", "123456");
    const result = await loginChildCredential(db, { name: "Sinta", pin: "123456" });
    expect(result).toEqual({ ok: true, sub: inserted[0].id, role: "child" });
  });

  it("rejects malformed input", async () => {
    const result = await loginChildCredential(db, { name: "", pin: "12" });
    expect(result.ok).toBe(false);
  });
});

describe("loginChildCredential rate limiting", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  function addChild(name: string, pin: string) {
    return db
      .insert(children)
      .values({ parentId: "p1", name, grade: 4, pinHash: hashPassword(pin) })
      .returning({ id: children.id });
  }

  it("locks the name after 5 failed attempts, even for the correct PIN", async () => {
    await addChild("Laras", "123456");
    for (let i = 0; i < 5; i++) {
      const attempt = await loginChildCredential(db, { name: "Laras", pin: "000000" });
      expect(attempt).toEqual({
        ok: false,
        status: 401,
        error: "Nama atau PIN belum benar. Coba lagi ya.",
      });
    }
    const sixth = await loginChildCredential(db, { name: "Laras", pin: "123456" });
    expect(sixth).toEqual({ ok: false, status: 429, error: RATE_LIMITED_MESSAGE });
  });

  it("clears the counter after a successful login", async () => {
    await addChild("Dewi", "123456");
    for (let i = 0; i < 4; i++) {
      await loginChildCredential(db, { name: "Dewi", pin: "000000" });
    }
    const success = await loginChildCredential(db, { name: "Dewi", pin: "123456" });
    expect(success.ok).toBe(true);
    for (let i = 0; i < 4; i++) {
      const attempt = await loginChildCredential(db, { name: "Dewi", pin: "000000" });
      expect(attempt).toMatchObject({ status: 401 });
    }
  });
});

describe("loginParentCredential rate limiting", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  it("locks the email after 5 wrong passwords, even for the correct one", async () => {
    await db.insert(parents).values({
      email: "kunci@example.com",
      passwordHash: hashPassword("rahasia-panjang"),
      name: "Kunci",
    });
    for (let i = 0; i < 5; i++) {
      const attempt = await loginParentCredential(db, {
        email: "kunci@example.com",
        password: "salah-sekali",
      });
      expect(attempt).toMatchObject({ status: 401 });
    }
    const sixth = await loginParentCredential(db, {
      email: "kunci@example.com",
      password: "rahasia-panjang",
    });
    expect(sixth).toEqual({ ok: false, status: 429, error: RATE_LIMITED_MESSAGE });
  });
});

describe("registerParentCredential rate limiting", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  it("locks the email after 5 duplicate-signup attempts", async () => {
    const first = await registerParentCredential(db, {
      name: "Budi",
      email: "dobel@example.com",
      password: "rahasia-panjang",
    });
    expect(first.ok).toBe(true);
    for (let i = 0; i < 5; i++) {
      const attempt = await registerParentCredential(db, {
        name: "Budi lagi",
        email: "dobel@example.com",
        password: "rahasia-panjang",
      });
      expect(attempt).toMatchObject({ status: 409 });
    }
    const seventh = await registerParentCredential(db, {
      name: "Budi lagi",
      email: "dobel@example.com",
      password: "rahasia-panjang",
    });
    expect(seventh).toEqual({ ok: false, status: 429, error: RATE_LIMITED_MESSAGE });
  });
});

describe("email normalization", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
  });
  afterEach(() => sqlite.close());

  it("matches emails case-insensitively on login and duplicate signup", async () => {
    const registered = await registerParentCredential(db, {
      name: "Budi",
      email: "Parent@Example.COM",
      password: "rahasia-panjang",
    });
    expect(registered.ok).toBe(true);

    const login = await loginParentCredential(db, {
      email: "parent@example.com",
      password: "rahasia-panjang",
    });
    expect(login.ok).toBe(true);

    const duplicate = await registerParentCredential(db, {
      name: "Budi lagi",
      email: "PARENT@example.com",
      password: "rahasia-panjang",
    });
    expect(duplicate).toEqual({
      ok: false,
      status: 409,
      error: "Email sudah terdaftar. Coba masuk.",
    });
  });
});
