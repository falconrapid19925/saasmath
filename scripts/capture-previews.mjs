#!/usr/bin/env node
/**
 * scripts/capture-previews.mjs — README preview assets captured from the REAL
 * production app (no mocks, no screenshots of a dev build).
 *
 * What it does:
 *   1. Spawns `node tests/e2e/web-server.mjs` — the same bootstrap the e2e
 *      suite uses: it wipes/pushes/seeds a TEMP SQLite DB (never dev.db),
 *      runs `next build` (first run takes a few minutes) and serves it with
 *      `next start` on 127.0.0.1:3311.
 *   2. Drives chromium (playwright-core) at 390x844 @2x, locale id-ID,
 *      through the real flows:
 *        - child login screen (name + 6-digit PIN pad)      → docs/img/child-login.png
 *        - demo child Budi: placement via the real API, then a drill played
 *          through the real UI (answers captured off the wire) → drill in
 *          progress → docs/img/drill-play.png
 *        - one deliberately wrong item, then one failed self-correction,
 *          opens the CPA pictorial hint (bar-model SVG)      → docs/img/cpa-hint.png
 *        - the corrected, synced result screen with stars    → docs/img/drill-result.png
 *        - demo parent dashboard                             → docs/img/parent-dashboard.png (full page)
 *        - one drill segment recorded as video, converted with ffmpeg
 *          (palettegen/paletteuse, fps 12, 720px wide, ≤10s, <4MB) → docs/img/preview.gif
 *   3. Always kills the server with SIGTERM (SIGKILL after 15s), waits for
 *      exit, and deletes the temp video files.
 *
 * Sessions: over plain HTTP the server's Secure session cookie cannot be
 * stored by the browser (same constraint the e2e suite documents), so after
 * exercising the real credential endpoints the script installs the same
 * signed token the server would set (see tests/e2e/helpers/api.ts).
 *
 * Run: node scripts/capture-previews.mjs   (E2E_SKIP_BUILD=1 reuses .next)
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { E2E_AUTH_SECRET, E2E_BASE_URL, E2E_PORT } from "../tests/e2e/helpers/e2e-env.mjs";
import { DEMO_ACCOUNT } from "../src/data/demo-account.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "docs", "img");
const videoDir = mkdtempSync(path.join(os.tmpdir(), "saasmath-preview-"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Session token — byte-for-byte mirror of createSessionToken in
// src/lib/auth.ts (base64url JSON payload + HMAC-SHA256 base64url signature).
// ---------------------------------------------------------------------------

/** Mirror of SESSION_COOKIE_NAME in src/lib/auth.ts. */
const SESSION_COOKIE_NAME = "saasmath_session";
/** Mirror of SESSION_TTL_SECONDS in src/lib/auth.ts (30 days). */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function createSessionToken(sub, role) {
  const payload = { sub, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", E2E_AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function installSession(context, sub, role) {
  await context.clearCookies({ name: SESSION_COOKIE_NAME });
  await context.addCookies([
    { name: SESSION_COOKIE_NAME, value: createSessionToken(sub, role), url: E2E_BASE_URL },
  ]);
}

// ---------------------------------------------------------------------------
// Answer formatting / equality — mirrors of src/lib/engine/answers.ts (the
// engine's own Bahasa-Indonesia conventions), so choice buttons are found by
// exactly the label the app renders.
// ---------------------------------------------------------------------------

function formatInt(value) {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(value));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return sign + out;
}

function formatDecimalFromUnits(units, places) {
  const sign = units < 0 ? "-" : "";
  const abs = Math.abs(units);
  const scale = 10 ** places;
  const whole = Math.floor(abs / scale);
  const fracDigits = String(abs % scale).padStart(places, "0");
  return `${sign}${formatInt(whole)},${fracDigits}`;
}

function formatAnswer(a) {
  switch (a.kind) {
    case "integer":
      return formatInt(a.value);
    case "decimal":
      return formatDecimalFromUnits(Math.round(a.value * 10 ** a.places), a.places);
    case "fraction":
      return `${a.n}/${a.d}`;
    case "mixed": {
      const sign = a.w < 0 ? "-" : "";
      const body = a.n === 0 ? `${Math.abs(a.w)}` : `${Math.abs(a.w)} ${a.n}/${a.d}`;
      return `${sign}${body}`;
    }
    case "moneyRupiah":
      return `Rp${formatInt(a.value)}`;
    case "unitValue":
      return `${formatInt(a.value)} ${a.unit}`;
  }
}

function answerValue(a) {
  switch (a.kind) {
    case "integer":
    case "decimal":
    case "moneyRupiah":
      return a.value;
    case "fraction":
      return a.n / a.d;
    case "mixed": {
      const magnitude = Math.abs(a.w) + a.n / a.d;
      return a.w < 0 ? -magnitude : magnitude;
    }
    case "unitValue":
      return a.value;
  }
}

const VALUE_EPSILON = 1e-9;

function answersEqual(a, b) {
  if (a.kind === "unitValue" || b.kind === "unitValue") {
    return (
      a.kind === "unitValue" &&
      b.kind === "unitValue" &&
      a.unit.trim() === b.unit.trim() &&
      Math.abs(a.value - b.value) <= VALUE_EPSILON
    );
  }
  return Math.abs(answerValue(a) - answerValue(b)) <= VALUE_EPSILON;
}

// ---------------------------------------------------------------------------
// Browser-side answering — mirrors tests/e2e/helpers/play.ts: choices are
// tapped by their rendered label, keyed answers are typed on the keypad
// widget and committed with Enter. delta=0 answers correctly; delta=1 is a
// deliberately wrong (but well-formed) answer.
// ---------------------------------------------------------------------------

async function toggleSign(page) {
  await page.getByRole("button", { name: "±", exact: true }).click();
}

async function tapFractionPart(page, part, value) {
  await page.getByRole("button", { name: new RegExp(`^${part}`) }).click();
  await page.keyboard.type(String(Math.abs(value)));
}

async function typeAnswer(page, item, delta = 0) {
  if (item.choices?.length) {
    const target =
      delta === 0
        ? item.choices.find((choice) => answersEqual(choice, item.answer))
        : item.choices.find((choice) => !answersEqual(choice, item.answer));
    if (!target) throw new Error(`no ${delta === 0 ? "correct" : "wrong"} choice for ${item.id}`);
    await page.getByRole("button", { name: formatAnswer(target), exact: true }).click();
    return;
  }

  const answer = item.answer;
  switch (answer.kind) {
    case "integer":
    case "moneyRupiah": {
      const value = answer.value + delta;
      if (value < 0) await toggleSign(page);
      await page.keyboard.type(String(Math.abs(value)));
      break;
    }
    case "decimal": {
      const value = answer.value + delta;
      const [intPart, fracPart] = value.toFixed(answer.places).split(".");
      if (value < 0) await toggleSign(page);
      await page.keyboard.type(intPart.replace("-", ""));
      if (fracPart !== undefined) {
        await page.keyboard.press("."); // the pad maps "." to the decimal comma
        await page.keyboard.type(fracPart);
      }
      break;
    }
    case "fraction":
      if (answer.n < 0) await toggleSign(page);
      await tapFractionPart(page, "Pembilang", answer.n + delta);
      await tapFractionPart(page, "Penyebut", answer.d);
      break;
    case "mixed":
      if (answer.w < 0) await toggleSign(page);
      await page.keyboard.type(String(Math.abs(answer.w) + delta));
      await tapFractionPart(page, "Pembilang", answer.n);
      await tapFractionPart(page, "Penyebut", answer.d);
      break;
    case "unitValue":
      await page.keyboard.type(String(Math.abs(answer.value) + delta));
      await page.getByRole("button", { name: answer.unit, exact: true }).click();
      break;
  }
  await page.keyboard.press("Enter");
}

// ---------------------------------------------------------------------------
// Chromium executable — the same fallback chain playwright.config.ts uses.
// ---------------------------------------------------------------------------

function resolveChromium() {
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

function resolveTool(name) {
  for (const candidate of [name, `/usr/sbin/${name}`, `/usr/bin/${name}`, `/usr/local/bin/${name}`]) {
    if (candidate.includes("/")) {
      if (existsSync(candidate)) return candidate;
    } else {
      const which = spawnSync("sh", ["-c", `command -v ${candidate}`], { encoding: "utf8" });
      if (which.stdout?.trim()) return which.stdout.trim();
    }
  }
  throw new Error(`${name} not found on PATH`);
}

// ---------------------------------------------------------------------------
// Main capture
// ---------------------------------------------------------------------------

const produced = [];
const skipped = [];
let server = null;
let browser = null;
let shuttingDown = false;

function note(file, label) {
  produced.push({ file, label, bytes: statSync(file).size });
  console.log(`[preview] wrote ${path.relative(repoRoot, file)} (${statSync(file).size} bytes) — ${label}`);
}

async function portAnswers() {
  try {
    const res = await fetch(`${E2E_BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`web-server exited (code ${server.exitCode}) before answering on ${E2E_BASE_URL}`);
    }
    if (await portAnswers()) return;
    await sleep(3000);
  }
  throw new Error(`server did not answer on ${E2E_BASE_URL} within ${Math.round(timeoutMs / 1000)}s`);
}

async function main() {
  if (await portAnswers()) {
    throw new Error(`something is already serving ${E2E_BASE_URL} — stop it before capturing`);
  }
  mkdirSync(outDir, { recursive: true });

  // 1. Production server on the e2e bootstrap (temp DB, seeded, next start).
  console.log(`[preview] starting production server on port ${E2E_PORT} (first build can take a few minutes)…`);
  server = spawn(process.execPath, ["tests/e2e/web-server.mjs"], { cwd: repoRoot, stdio: "inherit" });
  server.on("exit", (code) => {
    if (!shuttingDown) console.error(`[preview] web-server exited unexpectedly (code ${code})`);
  });
  await waitForServer(6 * 60 * 1000);
  console.log("[preview] server is up");

  const executablePath = resolveChromium();
  console.log(`[preview] chromium: ${executablePath ?? "(playwright default)"}`);
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const contextOptions = {
    baseURL: E2E_BASE_URL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  };

  // --- 2. Child login screen (fresh, logged-out context) -------------------
  {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto("/masuk");
    await page.getByLabel("Siapa namamu?").fill(DEMO_ACCOUNT.child.name);
    // A few PIN digits so the shot shows the pad mid-entry.
    for (const digit of DEMO_ACCOUNT.child.pin.slice(0, 3)) {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }
    await sleep(300);
    await page.screenshot({ path: path.join(outDir, "child-login.png") });
    note(path.join(outDir, "child-login.png"), "child login (name + 6-digit PIN pad)");
    await context.close();
  }

  // --- 3. Drill journey (video-recorded context, real UI + real API) -------
  let videoPath = null;
  let gifWindow = null;
  {
    const context = await browser.newContext({
      ...contextOptions,
      recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    const t0 = Date.now(); // video 0s ≈ page creation

    // Session: exercise the real child credential endpoint, then install the
    // token (the Secure cookie cannot survive plain HTTP — see file header).
    const childLogin = await context.request.post("/api/auth/child-login", {
      data: { name: DEMO_ACCOUNT.child.name, pin: DEMO_ACCOUNT.child.pin },
    });
    if (!childLogin.ok()) throw new Error(`child-login failed: ${await childLogin.text()}`);
    await installSession(context, DEMO_ACCOUNT.child.id, "child");

    // Placement diagnostic via the real API (20 items, all correct) — the
    // seeded demo child has no placement yet (src/app/actions/drill.ts).
    const placementGet = await context.request.get(
      `/api/placement?childId=${encodeURIComponent(DEMO_ACCOUNT.child.id)}`,
    );
    if (!placementGet.ok()) throw new Error(`placement GET failed: ${await placementGet.text()}`);
    const diagnostic = await placementGet.json();
    const placementPost = await context.request.post("/api/placement", {
      data: {
        childId: DEMO_ACCOUNT.child.id,
        seed: diagnostic.seed,
        answers: diagnostic.items.map((item) => item.answer),
      },
    });
    if (!placementPost.ok()) throw new Error(`placement POST failed: ${await placementPost.text()}`);

    // Child home → today's set CTA.
    await page.goto("/anak");
    await page.getByText(`Hai, ${DEMO_ACCOUNT.child.name}!`).waitFor();
    const cta = page.getByRole("link", { name: /Mulai sekarang/ });
    await cta.waitFor();

    // Click into the drill and capture the served set (with answer keys) off
    // the wire — exactly what the page renders.
    const taskResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/session/next") && response.request().method() === "POST",
    );
    await cta.click();
    await page.waitForURL("**/anak/latihan");
    const taskResponse = await taskResponsePromise;
    const task = await taskResponse.json();
    const items = task.items;
    if (!Array.isArray(items) || items.length === 0) throw new Error("served set has no items");
    console.log(
      `[preview] drill set: ${task.skill.titleId} step ${task.step}/${task.stepCount}, ${items.length} items, sct ${task.sctSeconds}s, timed=${task.timed}`,
    );
    const tDrill = Date.now();

    // The wrong-answer target: prefer an item whose CPA hint is a bar model
    // (part-whole / comparison / fraction-bar); any hinted item otherwise.
    // The hint opens in self-correction after one failed retry.
    const barModels = new Set(["part-whole", "comparison", "fraction-bar"]);
    const hinted = items.map((item, i) => ({ item, i })).filter(({ item, i }) => i >= 1 && item.hint);
    const wrongIdx =
      hinted.findIndex(({ item }) => barModels.has(item.hint.model)) >= 0
        ? hinted.find(({ item }) => barModels.has(item.hint.model)).i
        : hinted.length > 0
          ? hinted[0].i
          : -1;
    if (wrongIdx < 0) skipped.push("cpa-hint.png (no served item carries a CPA hint)");
    const playShotIdx = items.length > 3 ? 2 : 0;

    // Paced answering keeps the attempt plausible (the server flags
    // <300ms/item as superhuman_speed and hides it from the dashboard).
    const PACE_MS = 500;
    for (let i = 0; i < items.length; i++) {
      await page.getByText(`Soal ${i + 1} / ${items.length}`, { exact: true }).waitFor();
      if (i === playShotIdx) {
        await sleep(400);
        await page.screenshot({ path: path.join(outDir, "drill-play.png") });
        note(path.join(outDir, "drill-play.png"), "drill in progress (progress bar, question, keypad)");
      }
      await sleep(PACE_MS);
      await typeAnswer(page, items[i], i === wrongIdx ? 1 : 0);
    }

    // Self-correction of the deliberately wrong item: one failed retry opens
    // the CPA pictorial hint (bar-model SVG).
    if (wrongIdx >= 0) {
      await page.getByText("Perbaikan jawaban").waitFor();
      await sleep(600);
      await typeAnswer(page, items[wrongIdx], 1); // wrong retry → hint opens
      const hintLabel = page
        .getByText(/Model batang|Garis bilangan|Bilangan basis/)
        .first();
      await hintLabel.waitFor({ timeout: 10_000 });
      await hintLabel.scrollIntoViewIfNeeded();
      await sleep(400);
      await page.screenshot({ path: path.join(outDir, "cpa-hint.png") });
      note(path.join(outDir, "cpa-hint.png"), "CPA hint (bar-model SVG) during self-correction");
      await sleep(600);
      await typeAnswer(page, items[wrongIdx], 0); // correct retry → finish
    }

    // Result screen with stars; wait for the server sync note.
    await page.getByText("Set selesai").waitFor({ timeout: 20_000 });
    let synced = true;
    try {
      await page.getByText("Hasil sudah tersinkron ✓").waitFor({ timeout: 20_000 });
    } catch {
      synced = false;
      console.warn("[preview] result did not confirm sync within 20s");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);
    await page.screenshot({ path: path.join(outDir, "drill-result.png") });
    note(path.join(outDir, "drill-result.png"), "result screen with stars after completing the set");
    const tResultDone = Date.now();

    // End the segment on the child home (streak/stars updated) and stop the video.
    await page.getByRole("button", { name: "Kembali ke beranda" }).click();
    await page.waitForURL("**/anak");
    await sleep(1200);

    const video = page.video();
    await context.close();
    videoPath = await video.path();
    gifWindow = {
      start: Math.max(0, (tDrill - t0) / 1000 - 0.2),
      end: Math.min((tDrill - t0) / 1000 - 0.2 + 9.7, (tResultDone - t0) / 1000 + 1.5),
    };
    console.log(`[preview] video recorded: ${videoPath} (drill at +${((tDrill - t0) / 1000).toFixed(1)}s, synced=${synced})`);
  }

  // --- 4. Parent dashboard --------------------------------------------------
  {
    const context = await browser.newContext(contextOptions);
    // Real credential check first (demo parent), then install the session.
    const parentLogin = await context.request.post("/api/auth/login", {
      data: { email: DEMO_ACCOUNT.parent.email, password: DEMO_ACCOUNT.parent.password },
    });
    if (!parentLogin.ok()) throw new Error(`parent login failed: ${await parentLogin.text()}`);
    await installSession(context, DEMO_ACCOUNT.parent.id, "parent");

    const page = await context.newPage();
    await page.goto("/orangtua");
    await page.getByRole("heading", { name: "Dashboard Orang Tua" }).waitFor();
    await page.getByText("Kalender bintang").first().waitFor({ timeout: 20_000 });
    try {
      // Dashboard streak stat shape: "🔥 1 (❄️2)" — orangtua/page.tsx Stat.
      await page.getByText(/🔥 1 \(/).first().waitFor({ timeout: 15_000 });
    } catch {
      console.warn("[preview] dashboard did not show the 🔥 1 streak within 15s");
    }
    await sleep(600);
    await page.screenshot({ path: path.join(outDir, "parent-dashboard.png"), fullPage: true });
    note(path.join(outDir, "parent-dashboard.png"), "parent dashboard (child progress, streak, star calendar)");
    await context.close();
  }

  // --- 5. Video → GIF (palettegen/paletteuse, fps 12, 720px wide) ----------
  {
    const ffmpeg = resolveTool("ffmpeg");
    const ffprobe = resolveTool("ffprobe");
    const probe = spawnSync(
      ffprobe,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
      { encoding: "utf8" },
    );
    if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr}`);
    const videoDuration = parseFloat(probe.stdout.trim());
    const gifPath = path.join(outDir, "preview.gif");
    const start = gifWindow.start;
    let duration = Math.min(gifWindow.end - gifWindow.start, videoDuration - start - 0.05, 9.8);
    if (duration <= 0.5) throw new Error(`computed GIF window too short (${duration.toFixed(2)}s)`);

    const run = (dur, bayerScale, maxColors) => {
      const result = spawnSync(
        ffmpeg,
        [
          "-y",
          "-ss", start.toFixed(2),
          "-t", dur.toFixed(2),
          "-i", videoPath,
          "-filter_complex",
          `fps=12,scale=720:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff:max_colors=${maxColors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${bayerScale}:diff_mode=rectangle`,
          "-loop", "0",
          gifPath,
        ],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      if (result.status !== 0) throw new Error(`ffmpeg failed with exit code ${result.status}`);
    };

    // Keep it under 4MB, in order of least visual damage: fewer palette
    // colors first, then coarser dithering, then a slightly shorter window.
    const levers = [
      { bayerScale: 5, maxColors: 200 },
      { bayerScale: 5, maxColors: 128 },
      { bayerScale: 4, maxColors: 96 },
      { bayerScale: 3, maxColors: 64 },
      { bayerScale: 3, maxColors: 48 },
    ];
    let done = false;
    for (const lever of levers) {
      run(duration, lever.bayerScale, lever.maxColors);
      if (statSync(gifPath).size < 4 * 1024 * 1024) {
        done = true;
        break;
      }
      console.log(
        `[preview] gif ${(statSync(gifPath).size / 1e6).toFixed(1)}MB ≥ 4MB (bayer ${lever.bayerScale}, ${lever.maxColors} colors) — trying a smaller palette`,
      );
    }
    while (!done && duration > 4) {
      duration *= 0.85;
      run(duration, levers[levers.length - 1].bayerScale, levers[levers.length - 1].maxColors);
      if (statSync(gifPath).size < 4 * 1024 * 1024) done = true;
      else console.log(`[preview] gif ${(statSync(gifPath).size / 1e6).toFixed(1)}MB ≥ 4MB — shortening window to ${duration.toFixed(1)}s`);
    }
    const bytes = statSync(gifPath).size;
    if (bytes >= 4 * 1024 * 1024) throw new Error(`preview.gif is ${bytes} bytes after retries (≥ 4MB)`);
    note(gifPath, `animated preview (drill segment, ${duration.toFixed(1)}s @12fps, 720px wide)`);
  }
}

main()
  .then(() => {
    console.log("[preview] done:");
    for (const entry of produced) console.log(`  ${path.relative(repoRoot, entry.file)} — ${entry.label}`);
    if (skipped.length > 0) console.log(`[preview] skipped: ${skipped.join("; ")}`);
  })
  .catch((error) => {
    console.error(`[preview] FAILED: ${error instanceof Error ? error.stack : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    shuttingDown = true;
    try {
      if (browser) await browser.close();
    } catch (error) {
      console.warn(`[preview] browser close: ${error}`);
    }
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        const killTimer = setTimeout(() => {
          console.warn("[preview] server ignored SIGTERM for 15s — SIGKILL");
          server.kill("SIGKILL");
          setTimeout(resolve, 2000);
        }, 15_000);
        server.on("exit", () => {
          clearTimeout(killTimer);
          resolve();
        });
      });
      console.log("[preview] server stopped");
    }
    rmSync(videoDir, { recursive: true, force: true }); // temp videos
    rmSync(path.join(outDir, "palette.png"), { force: true }); // no-op safety
  });
