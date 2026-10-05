/**
 * Playwright config for the saasmath end-to-end suite (tests/e2e).
 *
 * - testDir tests/e2e; one worker, one fresh temp SQLite DB per run (the
 *   webServer bootstrap in tests/e2e/web-server.mjs wipes, pushes and seeds
 *   it before `next start`).
 * - The webServer serves a PRODUCTION build (npm-run-build equivalent +
 *   next start): the PWA service worker only registers with
 *   NODE_ENV=production, and the offline journey depends on it.
 * - AUTH_SECRET (>= 32 chars) is provided by tests/e2e/helpers/e2e-env.mjs;
 *   Midtrans/WhatsApp envs are stripped so checkout runs in stub mode.
 *
 * Browser binary: `npx playwright install chromium` is the documented setup.
 * When the managed download is unavailable (offline/CI mirrors), the config
 * falls back to a system-installed Chromium — override with E2E_CHROMIUM_PATH.
 */

import { existsSync } from "node:fs";

import { chromium } from "playwright-core";
import { defineConfig } from "@playwright/test";

import { E2E_BASE_URL } from "./tests/e2e/helpers/e2e-env.mjs";

/** Managed Playwright chromium when installed, else a system chromium. */
function resolveChromiumExecutable(): string | undefined {
  const override = process.env.E2E_CHROMIUM_PATH;
  if (override) return override;
  try {
    const managed = chromium.executablePath();
    if (existsSync(managed)) return managed;
  } catch {
    // Registry lookup failed — fall through to system browsers.
  }
  return [
    "/usr/bin/chromium",
    "/usr/sbin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ].find((candidate) => existsSync(candidate));
}

const executablePath = resolveChromiumExecutable();

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  // One serial worker: every spec runs against the same per-run database.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: "node tests/e2e/web-server.mjs",
    url: `${E2E_BASE_URL}/`,
    reuseExistingServer: false,
    timeout: 5 * 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
