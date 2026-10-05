/**
 * Demo account for smoke tests and manual QA (plan section 5 ships the
 * parent account + child profile at launch). The seed script upserts these
 * rows; the smoke-test builder imports the constants for assertions.
 *
 * Deterministic UUIDs (version/variant bits set) so reseeding updates the
 * same rows instead of accumulating duplicates.
 */

const DEMO_PARENT_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_CHILD_ID = "00000000-0000-4000-8000-000000000002";

export const DEMO_ACCOUNT = {
  parent: {
    id: DEMO_PARENT_ID,
    email: "demo@saasmath.id",
    /** Plaintext here only so the seed can hash it; never stored raw. */
    password: "demo1234",
    name: "Orang Tua Demo",
  },
  child: {
    id: DEMO_CHILD_ID,
    name: "Budi",
    grade: 4 as const,
    pin: "123456",
    /** Starter avatar, granted together with the account. */
    avatarItemId: "avatar-kucing",
    /** Opening balance, mirrored by one stars_ledger "seed_bonus" entry. */
    startingStars: 50,
  },
} as const;
