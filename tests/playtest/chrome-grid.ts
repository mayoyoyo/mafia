// ─────────────────────────────────────────────────────────────────────────
// Real-Chrome multi-client test GRID for the Mafia game.
//
// Boots ONE local server with a pinned role deal (MAFIA_FIXED_DEAL), then opens
// 8–10 CONCURRENT real Chromium tabs (one isolated browser CONTEXT per seat →
// separate logins), each playing a seat by driving the ACTUAL DOM. Proves the
// per-seat RENDERED views under simultaneous play — the thing the happy-dom WS
// harness cannot show (it asserts payloads, not pixels/visibility).
//
//   bun run tests/playtest/chrome-grid.ts                       # all scenarios
//   bun run tests/playtest/chrome-grid.ts --scenario full-night-10
//   bun run tests/playtest/chrome-grid.ts --scenario dawn-ambiguity-8 --headed
//
// ⚠  RUN STANDALONE. Do NOT run `bun test` (or a second grid/proof) concurrently
//    — many server subprocesses + many Chromium tabs starve the sockets and drop
//    seats. (Same constraint as proof-runner.ts.)
//
// Roles are dealt by JOIN ORDER (fixed deal): seat i ⇒ roles[i]. The grid
// serializes joins page-by-page, confirming each landed on the admin's lobby
// roster before the next, so the seat→role mapping is deterministic.
//
// SELF-HEALING RULE (inherited from the WS harness): if a step breaks and you
// find the cause, fix THIS file so it can't recur, and note it in
// tests/playtest/README-chrome-grid.md (## Gotchas).
// ─────────────────────────────────────────────────────────────────────────

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bootServer, findFreePort } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const SHOTS_ROOT = join(import.meta.dir, "screenshots");

// ── Scenario catalogue ──────────────────────────────────────────────────────
interface GridScenario {
  /** Fixed deal — role[i] → seat i (join order). */
  roles: Role[];
  /** Join-order index of the mafioso to flag as Godfather (reads innocent). */
  godfather?: number;
  /** Fixed lover pair (join-order indices) — pinned via MAFIA_FIXED_DEAL lovers:[i,j]. */
  lovers?: [number, number];
  /** Optional-role enable flags to switch ON via the lobby toggles, + mafiaCount. */
  settings: { mafiaCount?: number; toggles: string[] };
  /** Short label per seat for screenshot filenames (e.g. "0-mafia"). */
  seatLabels: string[];
  /** The scripted night + per-seat DOM assertions. */
  run: (g: GridRun) => Promise<void>;
}

// Every enable-toggle the lobby exposes → its checkbox id suffix.
const TOGGLE_IDS: Record<string, string> = {
  doctor: "toggle-doctor",
  detective: "toggle-detective",
  joker: "toggle-joker",
  hunter: "toggle-hunter",
  vigilante: "toggle-vigilante",
  lovers: "toggle-lovers",
  godfather: "toggle-godfather",
};

const SCENARIOS: Record<string, GridScenario> = {
  // ── 1. full-night-10 ──────────────────────────────────────────────────────
  // 10 seats. Godfather-flagged mafia + doctor + detective + vigilante + hunter.
  // One night: mafia duo locks a kill, doctor saves someone ELSE, detective
  // investigates the Godfather (reads INNOCENT), vigilante holds fire → dawn.
  "full-night-10": {
    roles: ["mafia", "mafia", "doctor", "detective", "vigilante", "hunter", "citizen", "citizen", "citizen", "citizen"],
    godfather: 0,
    settings: { mafiaCount: 2, toggles: ["doctor", "detective", "vigilante", "hunter", "godfather"] },
    seatLabels: ["0-mafia", "1-mafia", "2-doctor", "3-detective", "4-vigilante", "5-hunter", "6-citizen", "7-citizen", "8-citizen", "9-citizen"],
    async run(g) {
      const VICTIM = 6;   // mafia kills citizen seat 6
      const SAVED = 7;    // doctor saves a DIFFERENT citizen (no effect)
      const GODFATHER = 0;

      // ── MAFIA sub-phase ──────────────────────────────────────────────
      await g.expectActorPanel([0, 1], "mafia");
      await g.shot(0, "own-open"); await g.shot(1, "own-open");
      await g.shotNonActors([0, 1], "night-start");
      await g.mafiaKill([0, 1], VICTIM);

      // ── DOCTOR sub-phase ─────────────────────────────────────────────
      await g.waitPanel(2);
      await g.expectActorPanel([2], "doctor");           // only doctor now
      await g.expectHidden([0, 1], "mafia panel torn down after its close cue");
      await g.shot(0, "after-close"); await g.shot(1, "after-close");
      await g.shot(2, "own-open");
      await g.chooseAndConfirm(2, SAVED);

      // ── DETECTIVE sub-phase ──────────────────────────────────────────
      await g.waitPanel(3);
      // The brand-new night-action teardown: the doctor's panel MUST be hidden
      // once the detective's sub-phase begins.
      await g.expectHidden([2], "doctor panel hidden once detective phase begins");
      await g.expectActorPanel([3], "detective");
      await g.shot(2, "after-close");
      await g.shot(3, "own-open");
      await g.chooseAndConfirm(3, GODFATHER);
      // NOTE: the detective's verdict is revealed at DAWN, not now
      // ("Results will be revealed at dawn" — server.ts). Asserted after dawn.

      // ── VIGILANTE sub-phase ──────────────────────────────────────────
      await g.waitPanel(4);
      await g.expectHidden([3], "detective panel hidden once vigilante phase begins");
      await g.expectActorPanel([4], "vigilante");
      await g.shot(4, "own-open");
      await g.vigilanteHoldFire(4);
      await g.shot(4, "after-close");

      // ── DAWN ─────────────────────────────────────────────────────────
      // Living seats = everyone except the mafia victim (seat 6).
      const living = [0, 1, 2, 3, 4, 5, 7, 8, 9];
      await g.expectDawnVerdict(living);
      // The detective's verdict lands at dawn — the Godfather (seat 0) reads INNOCENT.
      await g.expectDetectiveVerdict(3, GODFATHER, /is NOT a member/);
      for (const s of living) await g.shot(s, "dawn");
    },
  },

  // ── 2. dawn-ambiguity-8 ───────────────────────────────────────────────────
  // 8 seats. Single mafia + vigilante + 6 citizens. Mafia kills A, vigilante
  // kills B → TWO deaths → dawn announces them NEUTRALLY ("Several didn't
  // survive the night." — no victim named, no cause tag).
  "dawn-ambiguity-8": {
    roles: ["mafia", "vigilante", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen"],
    settings: { mafiaCount: 1, toggles: ["vigilante"] },
    seatLabels: ["0-mafia", "1-vigilante", "2-citizen", "3-citizen", "4-citizen", "5-citizen", "6-citizen", "7-citizen"],
    async run(g) {
      const KILL_A = 2; // mafia victim
      const KILL_B = 3; // vigilante victim

      // ── MAFIA sub-phase (single) ─────────────────────────────────────
      await g.expectActorPanel([0], "mafia");
      await g.shot(0, "own-open");
      await g.shotNonActors([0], "night-start");
      await g.mafiaKill([0], KILL_A);

      // ── VIGILANTE sub-phase (doctor/detective disabled → skipped) ─────
      await g.waitPanel(1);
      await g.expectHidden([0], "mafia panel torn down after its close cue");
      await g.expectActorPanel([1], "vigilante");
      await g.shot(0, "after-close");
      await g.shot(1, "own-open");
      await g.chooseAndConfirm(1, KILL_B);
      await g.shot(1, "after-close");

      // ── DAWN — two deaths, NEUTRAL combined verdict ──────────────────
      const living = [0, 1, 4, 5, 6, 7];
      await g.expectDawnVerdict(living, /Several didn/); // "Several didn't survive the night."
      for (const s of living) await g.shot(s, "dawn");
    },
  },

  // ── 3. lovers-heartbreak-8 ────────────────────────────────────────────────
  // 8 seats. Single mafia + doctor + detective + 5 citizens, with a LOVER pair
  // pinned on seats 3 & 4 (two citizens). One night: mafia kills lover A (3),
  // doctor saves an irrelevant citizen (5), detective investigates the mafia.
  // Dawn: seat 3 dies AND seat 4 CASCADES → the restored PUBLIC heartbreak
  // reveal fires — a dedicated purple "beat-heartbreak" beat naming seat 4
  // ("<name> died of heartbreak."), AFTER a cause-neutral verdict for seat 3.
  // Then day; the run lynches the mafia to a town-win game_over reveal.
  "lovers-heartbreak-8": {
    roles: ["mafia", "doctor", "detective", "citizen", "citizen", "citizen", "citizen", "citizen"],
    lovers: [3, 4],
    settings: { mafiaCount: 1, toggles: ["doctor", "detective", "lovers"] },
    seatLabels: ["0-mafia", "1-doctor", "2-detective", "3-loverA", "4-loverB", "5-citizen", "6-citizen", "7-citizen"],
    async run(g) {
      const MAFIA = 0, DOCTOR = 1, DETECTIVE = 2;
      const LOVER_A = 3;  // mafia victim (dies directly, cause-neutral)
      const LOVER_B = 4;  // cascades → public heartbreak beat
      const SAVED = 5;    // doctor saves an irrelevant citizen (no effect)
      const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
      const living = [0, 1, 2, 5, 6, 7]; // after the night: seats 3 & 4 are dead

      // ── MAFIA sub-phase (single) ─────────────────────────────────────
      await g.expectActorPanel([MAFIA], "mafia");
      await g.shot(MAFIA, "own-open"); await g.shot(MAFIA, "night-start");
      await g.shotNonActors([MAFIA], "night-start");
      await g.mafiaKill([MAFIA], LOVER_A);

      // ── DOCTOR sub-phase ─────────────────────────────────────────────
      await g.waitPanel(DOCTOR);
      await g.expectHidden([MAFIA], "mafia panel torn down after its close cue");
      await g.expectActorPanel([DOCTOR], "doctor");
      await g.shot(DOCTOR, "own-open");
      await g.chooseAndConfirm(DOCTOR, SAVED);

      // ── DETECTIVE sub-phase ──────────────────────────────────────────
      await g.waitPanel(DETECTIVE);
      await g.expectHidden([DOCTOR], "doctor panel hidden once detective phase begins");
      await g.expectActorPanel([DETECTIVE], "detective");
      await g.shot(DETECTIVE, "own-open");
      await g.chooseAndConfirm(DETECTIVE, MAFIA); // reads MAFIA (plain mafioso) — verdict at dawn

      // ── DAWN — capture the transient verdict + heartbreak beats on EVERY
      //    seat concurrently (launched before dawn opens so no window is missed).
      const beats = await Promise.all(ALL.map((s) => g.captureDawnBeats(s)));
      const loverName = g.usernames[LOVER_B];
      const victimName = g.usernames[LOVER_A];
      const CAUSE = /\bmafia\b|\bvigilante\b|\bshot\b|\bgun\b|hanged|executed/i;
      for (const s of ALL) {
        const { verdict, heartbreak } = beats[s];
        // (2) heartbreak beat: purple "beat-heartbreak" beat naming seat 4.
        const hbOk = heartbreak.includes(loverName) && /died of heartbreak/i.test(heartbreak);
        g.record(s, `heartbreak beat: "<${g.labels[LOVER_B]}> died of heartbreak."`, hbOk, heartbreak.replace(/\s+/g, " ").slice(0, 60) || "not seen");
        // (3) verdict beat is cause-blind for the mafia victim (seat 3).
        const namesVictim = verdict.includes(victimName);
        const vOk = !!verdict && !CAUSE.test(verdict);
        g.record(s, `verdict beat cause-blind for ${g.labels[LOVER_A]}`, vOk, `${namesVictim ? "names-victim " : ""}${verdict.replace(/\s+/g, " ").slice(0, 70) || "no verdict"}`);
      }

      // ── DAY — overlay tears down; assert roster + event log + screenshots.
      await Promise.all(ALL.map((s) => g.waitDay(s)));
      for (const s of ALL) await g.shot(s, "day");
      // (1) both lovers dead in the roster (on living seats + admin).
      for (const s of living) await g.assertDeadInRoster(s, [LOVER_A, LOVER_B]);
      // (5) event log: victim neutral, partner "Died of heartbreak".
      for (const s of living) await g.assertEventLog(s, LOVER_A, LOVER_B);
      // (4) the dead lover's OWN death poster (heartbreak art).
      await g.assertDeadOverlay(LOVER_B);
      await g.shot(LOVER_A, "death-overlay"); // the direct victim's own poster too

      // (6) push to a town-win game_over by lynching the mafia at the day vote.
      await g.lynchMafiaToGameOver(MAFIA, living);
    },
  },
};

// ── Assertion bookkeeping ────────────────────────────────────────────────────
interface AssertLog { seat: number; name: string; ok: boolean; detail?: string; }

// ── The live grid: pages + helpers + assertions ─────────────────────────────
class GridRun {
  results: AssertLog[] = [];
  constructor(
    public pages: Page[],
    public usernames: string[],
    public labels: string[],
    public scenarioName: string,
  ) {}

  record(seat: number, name: string, ok: boolean, detail?: string) {
    this.results.push({ seat, name, ok, detail });
    const tag = ok ? "PASS" : "FAIL";
    const where = seat >= 0 ? `seat ${seat} (${this.labels[seat]})` : "grid";
    console.log(`  [${tag}] ${where}: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  // Screenshot seat `seat` at beat `beat` into screenshots/<scenario>/<label>-<beat>.png
  async shot(seat: number, beat: string) {
    const dir = join(SHOTS_ROOT, this.scenarioName);
    const file = join(dir, `${this.labels[seat]}-${beat}.png`);
    try { await this.pages[seat].screenshot({ path: file }); } catch (e) { /* non-fatal */ }
  }
  async shotNonActors(actors: number[], beat: string) {
    await Promise.all(this.pages.map((_, s) => (actors.includes(s) ? null : this.shot(s, beat))));
  }

  private panel(seat: number) { return this.pages[seat].locator("#night-actions"); }

  // Wait for a seat's night-action panel to become visible (its sub-phase opened).
  async waitPanel(seat: number, timeout = 25000) {
    await this.panel(seat).waitFor({ state: "visible", timeout });
  }

  // Assert the given actor seats show the action panel AND every other seat does
  // NOT — the core "only the acting role sees targeting UI" invariant.
  async expectActorPanel(actors: number[], role: string) {
    for (const s of actors) {
      let vis = false;
      try { await this.waitPanel(s); vis = true; } catch { vis = await this.panel(s).isVisible(); }
      this.record(s, `${role} sub-phase: action panel VISIBLE`, vis, vis ? "" : "panel never appeared");
    }
    for (let s = 0; s < this.pages.length; s++) {
      if (actors.includes(s)) continue;
      const vis = await this.panel(s).isVisible();
      this.record(s, `${role} sub-phase: non-actor shows NO targeting UI`, !vis, vis ? "panel was visible" : "");
    }
  }

  // Assert the given seats' panels are hidden (post-close teardown).
  async expectHidden(seats: number[], why: string) {
    for (const s of seats) {
      // give the close cue a beat to land
      let vis = true;
      try { await this.panel(s).waitFor({ state: "hidden", timeout: 8000 }); vis = false; } catch { vis = await this.panel(s).isVisible(); }
      this.record(s, why, !vis, vis ? "panel still visible" : "");
    }
  }

  // Every living seat reaches dawn with a NEUTRAL morning verdict.
  async expectDawnVerdict(living: number[], mustMatch?: RegExp) {
    await Promise.all(living.map((s) => this.assertDawnOne(s, mustMatch)));
  }
  private async assertDawnOne(seat: number, mustMatch?: RegExp) {
    const page = this.pages[seat];
    // The dawn verdict text lands in #suspense-text (the transient beat) and then
    // the dawn narration in #narrator-messages. Poll both up to ~14s (suspense is
    // ~6.3s of beats), capturing the neutral verdict wherever it shows.
    const deadline = Date.now() + 16000;
    let seen = "";
    const NEUTRAL = /survive the night|didn.t make it|saved a life|peaceful night|didn.t survive/i;
    const CAUSE = /\bmafia\b|\bvigilante\b|\bshot\b|\bgun\b|hanged|executed/i;
    while (Date.now() < deadline) {
      const sus = (await page.locator("#suspense-text").textContent().catch(() => "")) || "";
      const nar = (await page.locator("#narrator-messages").textContent().catch(() => "")) || "";
      const combo = `${sus} || ${nar}`;
      if (NEUTRAL.test(combo)) { seen = combo.trim(); break; }
      await page.waitForTimeout(300);
    }
    const ok = !!seen && !CAUSE.test(seen);
    let detail = seen ? `verdict="${seen.replace(/\s+/g, " ").slice(0, 80)}"` : "no verdict text seen";
    if (mustMatch && seen && !mustMatch.test(seen)) {
      this.record(seat, "dawn: neutral morning verdict", false, `expected ${mustMatch} — got "${seen.slice(0, 80)}"`);
      return;
    }
    this.record(seat, "dawn: neutral morning verdict (cause-blind)", ok, detail);
  }

  // ── Night action drivers (real DOM) ──────────────────────────────────────
  // Pick a target li by username in the generic (doctor/detective/vigilante)
  // list, then hit the Confirm button.
  async chooseAndConfirm(seat: number, targetSeat: number) {
    const page = this.pages[seat];
    const name = this.usernames[targetSeat];
    await page.locator("#action-targets li", { hasText: name }).first().click();
    const confirm = page.locator("#btn-action-confirm");
    await confirm.waitFor({ state: "visible", timeout: 8000 });
    await confirm.click();
  }

  async vigilanteHoldFire(seat: number) {
    await this.pages[seat].locator("#btn-vigilante-pass").click();
  }

  // Detective's private verdict card.
  async expectDetectiveVerdict(seat: number, targetSeat: number, re: RegExp) {
    const page = this.pages[seat];
    const el = page.locator("#detective-result");
    // Poll textContent rather than "visible" — the result card animates in
    // (opacity/transform) so a strict visibility gate races the reveal.
    let ok = false, txt = "";
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      txt = (await el.textContent().catch(() => "")) || "";
      if (txt.trim() && re.test(txt)) { ok = true; break; }
      await page.waitForTimeout(250);
    }
    if (!ok) {
      const diag = await page.evaluate(() => ({
        drHidden: document.getElementById("detective-result")?.classList.contains("hidden"),
        drHTML: document.getElementById("detective-result")?.innerHTML?.slice(0, 120),
        panelTitle: document.getElementById("action-title")?.textContent,
        targetsText: document.getElementById("action-targets")?.textContent?.slice(0, 120),
      }));
      console.log(`  [diag] detective state:`, JSON.stringify(diag));
    }
    this.record(seat, `detective verdict on ${this.labels[targetSeat]} (Godfather) reads INNOCENT`, ok, txt.trim().slice(0, 80) || "no verdict text");
  }

  // ── Lover-cascade dawn beats (restored public heartbreak reveal) ──────────
  // The dawn overlay chains DAWN → THE VERDICT → HEARTBREAK. Both middle beats
  // are transient (~2.2 s / ~2.6 s windows). Launch this per seat RIGHT AFTER
  // the last night action (before dawn even opens) and it will catch each beat
  // as its pre-label / tint flips. Screenshots are taken while the beat is up.
  async captureDawnBeats(seat: number): Promise<{ verdict: string; heartbreak: string }> {
    const page = this.pages[seat];
    const txt = page.locator("#suspense-text");
    let verdict = "", heartbreak = "";
    // 1) THE VERDICT beat — #suspense-pre flips to "THE VERDICT" (~3.5 s in).
    try {
      await page.waitForFunction(
        () => document.getElementById("suspense-pre")?.textContent?.trim() === "THE VERDICT",
        null, { timeout: 20000, polling: 80 },
      );
      await this.shot(seat, "dawn-verdict");
      verdict = ((await txt.textContent().catch(() => "")) || "").trim();
    } catch { /* missed window — recorded as empty */ }
    // 2) HEARTBREAK beat — #suspense-overlay gains .beat-heartbreak (~5.7 s in).
    try {
      await page.locator("#suspense-overlay.beat-heartbreak").waitFor({ state: "visible", timeout: 20000 });
      await this.shot(seat, "heartbreak");
      heartbreak = ((await txt.textContent().catch(() => "")) || "").trim();
    } catch { /* missed window */ }
    return { verdict, heartbreak };
  }

  // Wait for the dawn overlay to tear down (phase applied → day rendered).
  async waitDay(seat: number, timeout = 15000) {
    try { await this.pages[seat].locator("#suspense-overlay").waitFor({ state: "hidden", timeout }); } catch {}
  }

  // Roster (Players tab, #player-status-list) marks the given seats DEAD.
  async assertDeadInRoster(seat: number, deadSeats: number[]) {
    const page = this.pages[seat];
    for (const d of deadSeats) {
      const name = this.usernames[d];
      let ok = false;
      try { ok = (await page.locator("#player-status-list .player-status-name.dead", { hasText: name }).count()) > 0; } catch {}
      this.record(seat, `roster: ${this.labels[d]} marked DEAD at day`, ok, ok ? "" : "not flagged dead");
    }
  }

  // In-game event log: the direct victim stays cause-neutral ("Died in the
  // night"), the heartbroken partner is named ("Died of heartbreak").
  async assertEventLog(seat: number, victimSeat: number, loverSeat: number) {
    const page = this.pages[seat];
    const all = (await page.locator("#event-history-list .event-item").allTextContents().catch(() => [])) || [];
    const CAUSE = /\bmafia\b|\bvigilante\b|\bshot\b|\bgun\b|hanged|executed/i;
    const vLine = all.find((t) => t.includes(this.usernames[victimSeat])) || "";
    const lLine = all.find((t) => t.includes(this.usernames[loverSeat])) || "";
    const vOk = !!vLine && /Died in the night/i.test(vLine) && !CAUSE.test(vLine);
    this.record(seat, `event log: ${this.labels[victimSeat]} neutral ("Died in the night")`, vOk, vLine.slice(0, 60) || "no entry");
    const lOk = !!lLine && /Died of heartbreak/i.test(lLine);
    this.record(seat, `event log: ${this.labels[loverSeat]} "Died of heartbreak"`, lOk, lLine.slice(0, 60) || "no entry");
  }

  // The dead lover's OWN screen: full-screen death poster with the HEARTBREAK
  // art (msg.isLoverDeath → HEARTBREAK_ART in #dead-emoji).
  async assertDeadOverlay(seat: number) {
    const page = this.pages[seat];
    let vis = false;
    try { await page.locator("#dead-overlay").waitFor({ state: "visible", timeout: 10000 }); vis = true; } catch { vis = await page.locator("#dead-overlay").isVisible().catch(() => false); }
    const hasArt = (await page.locator("#dead-emoji svg").count().catch(() => 0)) > 0;
    const msg = ((await page.locator("#death-message").textContent().catch(() => "")) || "").trim();
    await this.shot(seat, "death-overlay");
    this.record(seat, "dead lover: own death poster visible (heartbreak art)", vis && hasArt, `msg="${msg.slice(0, 50)}"`);
  }

  // OPTIONAL end-game: admin nominates the mafia, every living seat votes YES →
  // town wins → game_over reveal (full-detail history). Screenshots 2 seats.
  async lynchMafiaToGameOver(nomineeSeat: number, living: number[]) {
    const admin = this.pages[0];
    await admin.locator("#admin-day-controls").waitFor({ state: "visible", timeout: 15000 });
    await admin.locator("#admin-target-list li", { hasText: this.usernames[nomineeSeat] }).first().click();
    // resolveVote only fires once EVERY living player has voted — so all living
    // (incl. the nominee) must cast a ballot.
    for (const s of living) {
      const yes = this.pages[s].locator("#btn-vote-yes");
      try { await yes.waitFor({ state: "visible", timeout: 10000 }); await yes.click(); } catch {}
    }
    for (const s of living.slice(0, 2)) {
      let ok = false, title = "";
      try {
        await this.pages[s].locator("#screen-gameover.active").waitFor({ state: "visible", timeout: 25000 });
        ok = true;
        title = ((await this.pages[s].locator("#gameover-title").textContent().catch(() => "")) || "").trim();
        await this.shot(s, "gameover");
      } catch {}
      this.record(s, "game over: reveal screen (town wins)", ok, title.slice(0, 40));
    }
  }

  // Drive the mafia kill through the real vote UI (single OR duo consensus).
  async mafiaKill(mafiaSeats: number[], victimSeat: number) {
    const victim = this.usernames[victimSeat];
    if (mafiaSeats.length <= 1) {
      // Single mafia: click the target li (atomic maybe+lock) → Confirm.
      const p = this.pages[mafiaSeats[0]];
      await p.locator("#action-targets li", { hasText: victim }).first().click();
    } else {
      // Duo: seat A Nominate → Lock In; seat B Lock In → unanimous → Confirm.
      const a = this.pages[mafiaSeats[0]];
      const b = this.pages[mafiaSeats[1]];
      const cardA = () => a.locator("li.mafia-target-card", { hasText: victim }).first();
      const cardB = () => b.locator("li.mafia-target-card", { hasText: victim }).first();

      await cardA().locator(".mtc-btn-suggest").click();               // Nominate (maybe)
      const lockA = cardA().locator(".mtc-btn-lock:not(.mtc-btn-disabled)");
      await lockA.waitFor({ state: "visible", timeout: 8000 });
      await lockA.click();                                             // Lock In (seat A)
      const lockB = cardB().locator(".mtc-btn-lock:not(.mtc-btn-disabled)");
      await lockB.waitFor({ state: "visible", timeout: 8000 });
      await lockB.click();                                             // Lock In (seat B) → unanimous
    }
    // Both paths converge on the Confirm ("Kill") button once consensus is ready.
    const admin = this.pages[mafiaSeats[0]];
    const confirm = admin.locator("#btn-action-confirm");
    try {
      await confirm.waitFor({ state: "visible", timeout: 12000 });
    } catch (e) {
      const diag = await admin.evaluate(() => ({
        title: document.getElementById("action-title")?.textContent,
        status: document.getElementById("action-status")?.textContent,
        targets: document.getElementById("action-targets")?.textContent,
        voteStatus: !document.getElementById("mafia-vote-status")?.classList.contains("hidden"),
        panelHidden: document.getElementById("night-actions")?.classList.contains("hidden"),
      }));
      console.log(`  [diag] mafia confirm never appeared:`, JSON.stringify(diag));
      throw e;
    }
    await confirm.click();
  }
}

// ── Lobby / seating (real DOM, serialized joins) ─────────────────────────────
async function register(page: Page, username: string, passcode: string) {
  await page.locator("#auth-username").fill(username);
  await page.locator("#auth-passcode").fill(passcode);
  // The register frame is silently dropped if the WebSocket hasn't finished
  // opening yet (app.js wsSend drops non-OPEN frames). Retry the click until the
  // menu appears — the socket opens within a beat on localhost.
  const menu = page.locator("#screen-menu.active");
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.locator("#btn-register").click();
    try { await menu.waitFor({ state: "visible", timeout: 2000 }); return; } catch { /* retry */ }
  }
  await menu.waitFor({ state: "visible", timeout: 5000 }); // final throw with context
}

async function toggleOn(page: Page, id: string) {
  // The real <input type=checkbox> sits under a custom slider and is rendered
  // off-viewport, so a normal click can't reach it. Set checked + fire the change
  // event directly — app.js's change listener is what dispatches update_settings.
  await page.evaluate((elId) => {
    const el = document.getElementById(elId) as HTMLInputElement | null;
    if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); }
  }, id);
  await page.waitForFunction((elId) => (document.getElementById(elId) as HTMLInputElement)?.checked === true, id, { timeout: 5000 });
}

// ── Main grid runner for one scenario ───────────────────────────────────────
async function runScenario(scenarioName: string, headed: boolean): Promise<boolean> {
  const scenario = SCENARIOS[scenarioName];
  const n = scenario.roles.length;
  // Short run id — usernames must stay under the #auth-username maxlength (16),
  // else 8–10 seats truncate to the SAME string and collide on register.
  const runId = Math.random().toString(36).slice(2, 6);
  const port = findFreePort(3300 + Math.floor(Math.random() * 300));
  const url = `http://localhost:${port}`;

  // Fresh screenshot dir for this scenario.
  const shotDir = join(SHOTS_ROOT, scenarioName);
  rmSync(shotDir, { recursive: true, force: true });
  mkdirSync(shotDir, { recursive: true });

  console.log("");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  MAFIA CHROME GRID — scenario: ${scenarioName}  (${n} seats, :${port})`);
  console.log("══════════════════════════════════════════════════════════════════");

  const srv = await bootServer({ port, roles: scenario.roles, godfather: scenario.godfather, lovers: scenario.lovers });

  let browser: Browser | null = null;
  const contexts: BrowserContext[] = [];
  try {
    browser = await chromium.launch({
      headless: !headed,
      args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    });

    const pages: Page[] = [];
    const usernames: string[] = [];
    for (let i = 0; i < n; i++) {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
      contexts.push(ctx);
      const page = await ctx.newPage();
      const seat = i;
      if (process.env.GRID_DEBUG) {
        page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log(`  [seat ${seat} console.${m.type()}] ${m.text()}`); });
      }
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const username = `g${runId}s${i}`; // e.g. "gk3f9s0" — unique per seat, <16 chars
      usernames.push(username);
      await register(page, username, String(1000 + (i % 9000)).padStart(4, "0"));
      pages.push(page);
    }

    // Seat 0 hosts.
    const admin = pages[0];
    await admin.locator("#btn-host").click();
    await admin.locator("#screen-lobby-admin.active").waitFor({ state: "visible", timeout: 15000 });
    const code = (await admin.locator("#lobby-code").textContent())!.trim();
    console.log(`  Room code: ${code}`);

    // Apply lobby settings via the real toggles + mafia counter (BEFORE joins is
    // fine; role sub-phases are gated on these enable flags).
    if (scenario.settings.mafiaCount && scenario.settings.mafiaCount > 1) {
      for (let c = 1; c < scenario.settings.mafiaCount; c++) await admin.locator("#mafia-plus").click();
    }
    for (const t of scenario.settings.toggles) await toggleOn(admin, TOGGLE_IDS[t]);

    // Serialize joins: seat i joins, then wait for the admin roster to reflect
    // i+1 players before the next seat joins (deterministic seat→role mapping).
    for (let i = 1; i < n; i++) {
      const page = pages[i];
      await page.locator("#btn-join-show").click();
      await page.locator("#join-code").fill(code);
      await page.locator("#btn-join").click();
      await page.locator("#screen-lobby-player.active").waitFor({ state: "visible", timeout: 15000 });
      await admin.waitForFunction((want) => {
        const el = document.getElementById("player-count-admin");
        return el && parseInt(el.textContent || "0") === want;
      }, i + 1, { timeout: 15000 });
    }
    console.log(`  All ${n} seats seated. Starting game…`);

    // Start → every seat lands on the game screen (awaiting-ready gate).
    await admin.locator("#btn-start").click();
    await Promise.all(pages.map((p) => p.locator("#screen-game.active").waitFor({ state: "visible", timeout: 20000 })));

    const grid = new GridRun(pages, usernames, scenario.seatLabels, scenarioName);
    // Assertion: every seat reached the game/night screen.
    for (let s = 0; s < n; s++) grid.record(s, "reached game screen (night)", true);

    // Admin opens the night (narrator-ready gate).
    await admin.locator("#btn-begin-night").click();

    // Run the scripted night + per-seat assertions.
    await scenario.run(grid);

    // ── Report ───────────────────────────────────────────────────────────
    const fails = grid.results.filter((r) => !r.ok);
    console.log("");
    console.log(`  ── ${scenarioName}: ${grid.results.length - fails.length}/${grid.results.length} assertions passed ──`);
    if (fails.length) {
      console.log(`  FAILURES:`);
      for (const f of fails) console.log(`    ✗ seat ${f.seat} (${f.seat >= 0 ? scenario.seatLabels[f.seat] : "grid"}): ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    }
    console.log(`  Screenshots: ${shotDir}`);
    return fails.length === 0;
  } finally {
    for (const c of contexts) { try { await c.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
    await srv.teardown();
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes("--headed");
  const scIdx = args.indexOf("--scenario");
  const only = scIdx >= 0 ? args[scIdx + 1] : (args.find((a) => !a.startsWith("--")) ?? undefined);

  const names = only ? [only] : Object.keys(SCENARIOS);
  for (const name of names) {
    if (!SCENARIOS[name]) {
      console.error(`Unknown scenario: ${name}. Available: ${Object.keys(SCENARIOS).join(", ")}`);
      process.exit(2);
    }
  }

  let allOk = true;
  for (const name of names) {
    // One grid at a time (socket-starvation safety).
    const ok = await runScenario(name, headed).catch((e) => {
      console.error(`\n[chrome-grid] scenario ${name} threw:`, e?.stack || e);
      return false;
    });
    if (!ok) allOk = false;
  }

  console.log("");
  console.log(allOk ? "GRID RESULT: PASS ✅" : "GRID RESULT: FAIL ❌");
  process.exit(allOk ? 0 : 1);
}

main();
