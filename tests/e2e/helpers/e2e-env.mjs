/**
 * Single source of truth for the e2e environment: the Playwright config,
 * the webServer bootstrap (web-server.mjs) and the specs themselves all
 * import these values, so they can never disagree about which database or
 * port the production server under test is using.
 *
 * Plain .mjs (not .ts): web-server.mjs is spawned directly by Playwright's
 * webServer command and must load without a transpile step.
 */

import os from "node:os";
import path from "node:path";

/** Fixed test-only secret (>= 32 chars, the src/lib/auth.ts minimum). */
export const E2E_AUTH_SECRET =
  "saasmath-e2e-only-auth-secret-0123456789abcdef0123456789";

/** Never 3000/3001: a developer's dev server must not collide with e2e. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3311);

export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Temp SQLite DB the production server runs on (one database per run). */
export const E2E_DB_PATH =
  process.env.E2E_DB_PATH ?? path.join(os.tmpdir(), "saasmath-e2e", "e2e.db");
