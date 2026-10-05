/**
 * webServer bootstrap for the e2e suite. Playwright starts this instead of a
 * bare `next start` so every run gets the full production setup in one place:
 *
 *   1. a FRESH temp SQLite database (DB_PATH, wiped first — no dev.db touch);
 *   2. schema pushed + content seeded into that temp DB (per run);
 *   3. a production build served by `next start` (the service worker only
 *      registers in production, so the offline journey must be built);
 *   4. Midtrans/WhatsApp env stripped — the specs test stub mode.
 *
 * Note on step 2: `npm run db:push` cannot be reused verbatim because
 * drizzle.config.ts hardcodes `file:./dev.db`. The identical push runs here
 * with the e2e URL passed via the drizzle-kit CLI flags, then the seed runs
 * through the unmodified `npm run db:seed` (which reads DB_PATH).
 *
 * E2E_SKIP_BUILD=1 skips step 3's build for fast local iteration when
 * `.next` already holds a current production build.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { E2E_AUTH_SECRET, E2E_DB_PATH, E2E_PORT } from "./helpers/e2e-env.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function run(executable, args, env, label) {
  const result = spawnSync(executable, args, { cwd: repoRoot, env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`[e2e] ${label} failed with exit code ${result.status}`);
  }
}

// 1. Fresh temp database per run (SQLite sidecar files included).
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(E2E_DB_PATH + suffix, { force: true });
}
mkdirSync(path.dirname(E2E_DB_PATH), { recursive: true });

const env = {
  ...process.env,
  DB_PATH: E2E_DB_PATH,
  AUTH_SECRET: E2E_AUTH_SECRET,
};
// Stub mode is part of the system under test: a developer's real Midtrans or
// WhatsApp credentials must never leak into the e2e run.
for (const key of Object.keys(env)) {
  if (key.startsWith("MIDTRANS_") || key.startsWith("WHATSAPP_")) delete env[key];
}

// 2. Schema + content seed into the temp DB.
run(
  path.join(repoRoot, "node_modules", ".bin", "drizzle-kit"),
  ["push", "--dialect", "sqlite", "--schema", "./src/db/schema.ts", "--url", `file:${E2E_DB_PATH}`, "--force"],
  env,
  "drizzle-kit push (e2e DB)",
);
run(process.execPath, ["src/db/seed.ts"], env, "db:seed");

// 3. Production build (skippable for iteration; `next start` requires it).
if (process.env.E2E_SKIP_BUILD !== "1") {
  run(process.execPath, ["node_modules/next/dist/bin/next", "build"], env, "next build");
}

// 4. Serve. Direct node invocation (no npx shim) so signals reach Next.
console.log(
  `[e2e] starting next start on port ${E2E_PORT} (DB_PATH=${E2E_DB_PATH}, Midtrans/WhatsApp unset)`,
);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(E2E_PORT),
  ],
  { cwd: repoRoot, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 1));
