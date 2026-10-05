/**
 * Shared zod request schemas for the API routes. The Answer union mirrors
 * src/lib/engine/types.ts exactly (strict contract; unknown kinds rejected).
 */

import { z } from "zod";


export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(8).max(128);
/** Child PIN: exactly 6 digits, the one policy everywhere (hashed with scrypt like a password). */
export const pinSchema = z.string().regex(/^\d{6}$/, "PIN must be 6 digits");

export const gradeSchema = z.union([z.literal(4), z.literal(5)]);

export const answerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("integer"), value: z.number().int() }),
  z.object({
    kind: z.literal("decimal"),
    value: z.number(),
    places: z.number().int().min(0).max(6),
  }),
  z.object({
    kind: z.literal("fraction"),
    n: z.number().int(),
    d: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("mixed"),
    w: z.number().int(),
    n: z.number().int().min(0),
    d: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("moneyRupiah"), value: z.number().int() }),
  z.object({
    kind: z.literal("unitValue"),
    value: z.number(),
    unit: z.string().min(1).max(24),
  }),
]);

/** (Answer | null)[] — null = skipped item. Capped: the placement diagnostic
 * tops out at 20 items, so 50 bounds CPU/memory amplification on
 * submit/sync/placement without rejecting any real set. */
export const answersSchema = z.array(z.union([answerSchema, z.null()])).max(50);
