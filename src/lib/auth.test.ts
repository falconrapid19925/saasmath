/**
 * Seam tests for the auth primitives (src/lib/auth.ts): signed session
 * tokens and scrypt password/PIN hashing. These cover the contract the route
 * handlers and server actions rely on — round-trip, tamper rejection,
 * expiry, and constant-scheme verification.
 */

import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "./auth";

// getAuthSecret() reads the env on every call, so setting it here is enough.
process.env.AUTH_SECRET ??= "t".repeat(32);

describe("session tokens", () => {
  it("round-trips a signed token", () => {
    const token = createSessionToken({ sub: "parent-1", role: "parent" });
    expect(verifySessionToken(token)).toEqual({
      sub: "parent-1",
      role: "parent",
      exp: expect.any(Number),
    });
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken({ sub: "parent-1", role: "parent" });
    const [body, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "child-of-someone-else", role: "child", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifySessionToken(`${forged}.${signature}`)).toBeNull();
    expect(verifySessionToken(`${body}. ${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken({ sub: "parent-1", role: "parent" });
    const [body] = token.split(".");
    expect(verifySessionToken(`${body}.${"A".repeat(43)}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("no-signature")).toBeNull();
    expect(verifySessionToken("aGVsbG8.aGVsbG8")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createSessionToken({ sub: "parent-1", role: "parent", ttlSeconds: -10 });
    expect(verifySessionToken(token)).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", () => {
    const stored = hashPassword("rahasia-panjang");
    expect(verifyPassword("rahasia-panjang", stored)).toBe(true);
    expect(verifyPassword("salah-sekali", stored)).toBe(false);
  });

  it("salts every hash so equal passwords store differently", () => {
    expect(hashPassword("rahasia-panjang")).not.toBe(hashPassword("rahasia-panjang"));
  });

  it("stores the scrypt:<saltHex>:<hashHex> format (16-byte salt, 64-byte key)", () => {
    const match = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/.exec(hashPassword("123456"));
    expect(match).not.toBeNull();
  });

  it("rejects malformed stored hashes without throwing", () => {
    expect(verifyPassword("x", "plaintext")).toBe(false);
    expect(verifyPassword("x", "md5:ab:cd")).toBe(false);
    expect(verifyPassword("x", "scrypt:zz:zz")).toBe(false);
  });
});
