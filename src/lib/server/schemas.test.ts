/**
 * Request-schema invariants (src/lib/server/schemas.ts): the child-PIN policy
 * is unified on exactly six digits — actions (src/app/actions/auth.ts:46),
 * PinPad (src/components/PinPad.tsx:22) and the seed
 * (src/data/demo-account.ts) all emit exactly 6 — and the answers array is
 * length-capped so submit/sync/placement cannot amplify CPU/memory with
 * huge payloads (the placement diagnostic tops out at 20 items).
 */

import { describe, expect, it } from "vitest";

import { answersSchema, pinSchema } from "./schemas";

describe("pinSchema", () => {
  it("accepts exactly six digits", () => {
    expect(pinSchema.safeParse("123456").success).toBe(true);
  });

  it.each(["1234", "12345", "1234567", "12345678", "12345a", "", "abcdef"])(
    "rejects %s",
    (pin) => {
      expect(pinSchema.safeParse(pin).success).toBe(false);
    },
  );
});

describe("answersSchema", () => {
  it("accepts up to 50 entries", () => {
    expect(answersSchema.safeParse(Array.from({ length: 50 }, () => null)).success).toBe(true);
  });

  it("rejects more than 50 entries", () => {
    expect(answersSchema.safeParse(Array.from({ length: 51 }, () => null)).success).toBe(false);
  });
});
