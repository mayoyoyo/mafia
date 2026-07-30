// ─────────────────────────────────────────────────────────────────────────
// Screenshot proof for the Korean i18n feature.
//
// Boots a pinned-deal server, seats BOT players in every seat but the last,
// drives a real Chromium browser into the last seat, and captures four shots at
// 390x844 (iPhone-ish):
//
//   1-auth-language-picker.png     the auth screen with the language picker
//   2-settings-language.png        the settings modal, English / 한국어
//   3-ingame-korean.png            an in-game moment: Korean narration + chrome
//   4-ingame-english.png           the SAME moment switched back to English
//                                  (proves the transcript re-renders live)
//
//   bun run tests/playtest/i18n-proof-shots.ts [outDir]
//
// Roles are dealt by JOIN ORDER (MAFIA_FIXED_DEAL): the browser joins last and
// is a plain citizen, so it has no night action and simply watches the dawn.
// ─────────────────────────────────────────────────────────────────────────

import { chromium, type Page } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";
import type { Role } from "../../src/types.ts";
import { PlaytestClient, bootServer, findFreePort, waitForLobbyCount } from "./harness.ts";

const OUT_DIR = process.argv[2] ?? join(process.cwd(), "i18n-proof");
const VIEWPORT = { width: 390, height: 844 };

// Deal: 5 seats. Bots take 0-3, the browser is seat 4 (a citizen).
const ROLES: Role[] = ["mafia", "doctor", "citizen", "citizen", "citizen"];
const MAFIA = 0, DOCTOR = 1, VICTIM = 2, SAVED = 3;
const BROWSER_SEAT = 4;

const shots: string[] = [];
async function shot(page: Page, name: string) {
  const path = join(OUT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  shots.push(path);
  console.log("  📸", path);
}

/** Wait until `fn` returns true in the page, polling. */
async function until(page: Page, fn: string, label: string, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(`(() => ${fn})()`)) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const port = findFreePort(3400);
  const server = await bootServer({ port, roles: ROLES });
  const bots: PlaytestClient[] = [];
  let browser;

  try {
    // ── 1. Seat the bots (join order 0..3) ────────────────────────────────
    for (let i = 0; i < BROWSER_SEAT; i++) {
      const c = new PlaytestClient(`bot${i}`);
      await c.connect(port);
      await c.register(`Bot${i}_${port}`, "1111");
      bots.push(c);
    }
    const code = await bots[MAFIA]!.createGame();
    await bots[MAFIA]!.updateSettings({ enableDoctor: true });
    for (let i = 1; i < BROWSER_SEAT; i++) await bots[i]!.joinGame(code);
    console.log(`server on :${port}, room ${code}, ${bots.length} bots seated`);

    // ── 2. Browser: auth screen ──────────────────────────────────────────
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => console.log("  [page error]", e.message));
    await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
    await until(page, `!!document.querySelector('.lang-control [data-lang="ko"]')`, "language picker");
    // Fonts settle so the shot isn't a fallback-font frame.
    await page.evaluate("document.fonts && document.fonts.ready");
    await shot(page, "1-auth-language-picker.png");

    // ── 3. Register + join the room as the last seat ──────────────────────
    await page.fill("#auth-username", "Hanson");
    await page.fill("#auth-passcode", "4242");
    await page.click("#btn-register");
    await until(page, `document.querySelector('#screen-menu').classList.contains('active')`, "menu screen");
    await page.fill("#join-code", code);
    await page.click("#btn-join");
    await until(page, `document.querySelector('#screen-lobby-player').classList.contains('active')`, "player lobby");
    await waitForLobbyCount(bots[MAFIA]!, 5);
    console.log("browser joined as seat", BROWSER_SEAT);

    // ── 4. Settings modal — the language row ─────────────────────────────
    await page.click("#btn-settings-lobby-player");
    await until(page, `!document.querySelector('#modal-settings').classList.contains('hidden')`, "settings modal");
    await shot(page, "2-settings-language.png");

    // Switch to Korean from the settings modal (the real user gesture).
    await page.click('#modal-settings .lang-control [data-lang="ko"]');
    await until(page, `window.I18n.lang() === "ko"`, "korean active");
    await page.click("#btn-close-settings");

    // ── 5. Run a night so there is real narration to read ────────────────
    const dawn = bots[MAFIA]!.waitMatch(
      (m) => m.type === "phase_change" && m.phase === "day",
      20000,
      "dawn",
    );
    await bots[MAFIA]!.startGame();
    bots[MAFIA]!.signalNarratorReady();
    await bots[MAFIA]!.waitFor("mafia_targets", 10000);

    const roster = bots[MAFIA]!.lastOf("lobby_update")!.players as Array<{ id: number; username: string }>;
    const seatId = (i: number) => roster[i]!.id;

    await bots[MAFIA]!.killAsMafia(seatId(VICTIM));
    await bots[DOCTOR]!.waitFor("doctor_targets", 10000);
    await bots[DOCTOR]!.doctorSave(seatId(SAVED));
    await dawn;
    console.log("dawn reached");

    // The dawn suspense overlay animates for ~6.3s; wait it out so the shot is
    // the settled DAY view (narrator line + event log + chrome), not the overlay.
    await until(
      page,
      `document.querySelector('#suspense-overlay').classList.contains('hidden')
       && document.querySelector('#narrator-messages').textContent.trim().length > 0`,
      "settled day view",
      30000,
    );
    await new Promise((r) => setTimeout(r, 600));

    const koText = await page.evaluate(`document.querySelector('#narrator-messages').textContent`);
    console.log("  KO narration:", koText);
    await shot(page, "3-ingame-korean.png");

    // ── 6. Switch back to English — same moment, live re-render ───────────
    await page.click("#btn-settings");
    await until(page, `!document.querySelector('#modal-settings').classList.contains('hidden')`, "settings modal (2)");
    await page.click('#modal-settings .lang-control [data-lang="en"]');
    await until(page, `window.I18n.lang() === "en"`, "english active");
    await page.click("#btn-close-settings");
    await new Promise((r) => setTimeout(r, 400));

    const enText = await page.evaluate(`document.querySelector('#narrator-messages').textContent`);
    console.log("  EN narration:", enText);
    await shot(page, "4-ingame-english.png");

    // Sanity: the same line must have actually CHANGED between the two shots.
    if (koText === enText) throw new Error("narration did not change on language switch");
    if (!/[가-힣]/.test(String(koText))) throw new Error("Korean shot contains no Hangul");
    if (/[가-힣]/.test(String(enText))) throw new Error("English shot still contains Hangul");

    console.log("\n✅ PASS — 4 screenshots captured, live switch verified");
    for (const s of shots) console.log("   ", s);
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const b of bots) b.close();
    await server.teardown();
  }
}

main().catch((e) => {
  console.error("❌ FAILED:", e.message);
  process.exit(1);
});
