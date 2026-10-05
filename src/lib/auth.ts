/**
 * Auth primitives, no external dependency (server-only: uses node:crypto).
 *
 * - Passwords (parents) and child PINs: node:crypto scrypt with a per-hash
 *   random salt, stored as "scrypt:<saltHex>:<hashHex>".
 * - Sessions: stateless cookie token, HMAC-SHA256 over a base64url JSON
 *   payload, secret from AUTH_SECRET (.env.local). Not a JWT — same shape,
 *   zero dependencies.
 *
 * The route-handler builder wires these into cookies() and middleware.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const SESSION_COOKIE_NAME = "saasmath_session";

/** Session lifetime: 30 days, refreshed by re-issuing on activity. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const sessionPayloadSchema = z.object({
  /** Subject: parent id or child id (see role). */
  sub: z.string().min(1),
  role: z.enum(["parent", "child"]),
  /** Expiry, unix seconds. */
  exp: z.number().int().positive(),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need >= 32 chars). See .env.example.",
    );
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Issue a signed session token (value for the session cookie). */
export function createSessionToken(input: {
  sub: string;
  role: SessionPayload["role"];
  ttlSeconds?: number;
}): string {
  const payload: SessionPayload = {
    sub: input.sub,
    role: input.role,
    exp:
      Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? SESSION_TTL_SECONDS),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Verify a session token: signature check (timing-safe), payload schema, and
 * expiry. Returns null for any failure — callers treat that as logged out.
 */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));

  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const result = sessionPayloadSchema.safeParse(parsed);
  if (!result.success) return null;

  if (result.data.exp <= Math.floor(Date.now() / 1000)) return null;
  return result.data;
}

// ---------------------------------------------------------------------------
// Password / PIN hashing (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_KEY_LENGTH = 64;

/** Hash a password or child PIN into the storable "scrypt:salt:hash" form. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time verification of a password/PIN against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const salt = Buffer.from(saltHex, "hex");
  // Fail closed on undecodable hashes (scrypt rejects a zero key length).
  if (expected.length === 0 || salt.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
