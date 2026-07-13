import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Role } from "../src/types";
import {
  type HunterServer, type HunterGame,
  spawnServer, teardownServer, waitFor, waitMatch, assertSilence,
  send, setupGame as setupGameH, mafiaSoloKill, killHunterAndAwaitGate,
  closeAll, indexOfMsg,
} from "./helpers/ws-harness";

/**
 * C3a — WS half of the Hunter revenge flow, NIGHT path (HUNTER-DESIGN §3.6,
 * §4, §6): edges E1 (two-stage dawn), E6 (decline identical), E9 (force_dawn
 * clears the gate), plus handler guard rejections for the two new message
 * types. The vote-path interrupt (E4/E8 sweep) is C3b; rejoin mid-revenge
 * (E10) is C4.
 *
 * There is NO revenge timer: the gate never auto-resolves — it stays open
 * until the hunter shoots or the admin force-skips (force_skip_revenge) or
 * force-dawns (force_dawn). A night-killed Hunter's gate carries
 * wakeHunter:true, so the server frames the prompt with the hunter_open /
 * hunter_close wake cues (a day-lynch gate emits neither).
 *
 * Port band 22600-22999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging).
 * One default server (server A 22600-22789) — every game resolves the gate
 * explicitly; there are no timed waits.
 *
 * Deterministic deal via MAFIA_FIXED_DEAL (one deal per server process, the
 * golden-file mechanism): join order P0 citizen (admin), P1 mafia,
 * P2 hunter, P3-P5 citizens.
 */

const PORT_A = 22600 + Math.floor(Math.random() * 190); // 22600-22789

const DEAL_ROLES: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen"];
const SETTINGS = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: false,
};

// Seat indices into the deal (join order)
const ADMIN = 0, MAFIA = 1, HUNTER = 2, CIT_A = 3, CIT_B = 4, CIT_C = 5;

// ── Per-band server subprocesses (harness: tests/helpers/ws-harness.ts) ────

let serverA: HunterServer | null = null;

beforeAll(async () => {
  serverA = await spawnServer(PORT_A, "A", "night", DEAL_ROLES);
});

afterAll(() => {
  teardownServer(serverA);
});

// ── This file's setupGame: the shared harness driver bound to this band's
//    fixed deal/settings/username prefix (test bodies call setupGame(srv)). ─
function setupGame(srv: HunterServer): Promise<HunterGame> {
  return setupGameH(srv, { prefix: "hwn", dealRoles: DEAL_ROLES, settings: SETTINGS });
}

// ── E6 sequence summarizer ───────────────────────────────────────────────
// Summarize the observable resolution slice — from hunter_revenge_pending
// through the closing phase_change — to type + stable discriminating fields
// (seats, phases, counts). Narrator prose and ids are dropped, so the three
// decline paths can be compared for IDENTITY modulo prose variance.

const SLICE_TYPES = new Set([
  "hunter_revenge_pending", "hunter_revenge_targets", "you_died",
  "player_died", "sound_cue", "phase_change", "game_over",
]);

function summarizeSlice(game: HunterGame, inbox: any[]): any[] {
  const start = indexOfMsg(inbox, m => m.type === "hunter_revenge_pending");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = indexOfMsg(inbox, m => m.type === "phase_change", start);
  expect(end).toBeGreaterThan(start);
  const out: any[] = [];
  for (let i = start; i <= end; i++) {
    const m = inbox[i];
    if (!SLICE_TYPES.has(m.type)) continue;
    switch (m.type) {
      case "hunter_revenge_pending":
        out.push({ type: m.type, hunter: game.seatOfName.get(m.hunterName) ?? m.hunterName });
        break;
      case "hunter_revenge_targets":
        out.push({ type: m.type, targets: m.players.map((p: any) => game.seatOfId.get(p.id) ?? p.id).sort() });
        break;
      case "you_died":
        out.push({ type: m.type, isLoverDeath: !!m.isLoverDeath });
        break;
      case "player_died":
        out.push({ type: m.type, who: game.seatOfId.get(m.playerId) ?? m.playerId });
        break;
      case "sound_cue":
        out.push({ type: m.type, sound: m.sound });
        break;
      case "phase_change":
        out.push({
          type: m.type, phase: m.phase, round: m.round,
          msgCount: m.messages.length, hasEvents: Array.isArray(m.events),
        });
        break;
      case "game_over":
        out.push({ type: m.type, winner: m.winner });
        break;
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// E1 — two-stage dawn (WS half)
// ═══════════════════════════════════════════════════════════════════════

describe("E1: two-stage dawn — mafia night-kills the hunter", () => {
  test("deaths announced before the reveal; only the hunter is prompted; phase_change deferred until revenge resolves; night timers fine afterwards", async () => {
    const game = await setupGame(serverA!);
    const [admin, , hunter, citA, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[CIT_A], game.players[CIT_B],
    ];

    const pending = await killHunterAndAwaitGate(game);
    expect(pending.hunterName).toBe(hunter.username);

    // Stage 1 before stage 2, on every inbox: you_died/player_died(hunter)
    // BEFORE hunter_revenge_pending.
    for (const p of game.players) {
      const diedIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
      const pendingIdx = indexOfMsg(p.inbox, m => m.type === "hunter_revenge_pending");
      expect(diedIdx).toBeGreaterThanOrEqual(0);
      expect(pendingIdx).toBeGreaterThan(diedIdx);
    }
    const youDiedIdx = indexOfMsg(hunter.inbox, m => m.type === "you_died");
    expect(youDiedIdx).toBeGreaterThanOrEqual(0);
    expect(youDiedIdx).toBeLessThan(indexOfMsg(hunter.inbox, m => m.type === "hunter_revenge_pending"));

    // The hunter — and ONLY the hunter — got the target list: exactly the
    // five living players.
    const targetsMsg = hunter.inbox.find(m => m.type === "hunter_revenge_targets");
    expect(targetsMsg).toBeDefined();
    const targetIds = targetsMsg.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const livingIds = game.players.filter(p => p.userId !== hunter.userId).map(p => p.userId).sort((a, b) => a - b);
    expect(targetIds).toEqual(livingIds);
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue;
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // Spectator isolation (§3.9 server side): the prompted hunter received
    // NO dead-spectator panel at the gated dawn.
    expect(hunter.inbox.find(m => m.type === "spectator_kill_confirmed")).toBeUndefined();

    // The dawn is HELD: no phase_change / day cue / game_over while gated.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(1); // game-start night only
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);

    // ── Revenge: hunter shoots a citizen ──────────────────────────────────
    const victimDiedPromise = waitFor(citA.ws, "you_died", 5000);
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "deferred dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });

    const victimDied = await victimDiedPromise;
    expect(victimDied.isLoverDeath).toBeUndefined();
    const dayChange = await dayPromise;
    expect(dayChange.round).toBe(1);
    // The deferred dawn now carries TWO lines: [0] the ONE cause-neutral
    // night-batch line (the hunter, who died at night — names WHO, never HOW),
    // then [1] the separate hunter-revenge line naming the victim.
    expect(dayChange.messages.length).toBe(2);
    expect(dayChange.messages[0]).toContain(hunter.username);
    expect(dayChange.messages[0]).not.toMatch(/Mafia|Vigilante|heartbreak/i);
    expect(dayChange.messages[1]).toContain(citA.username);
    expect(Array.isArray(dayChange.events)).toBe(true);
    await Bun.sleep(150);

    // Order on the admin inbox: pending < player_died(victim) < day cue <
    // phase_change(day). And no game_over anywhere (1 mafia vs 3 town).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === citA.userId);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day");
    const dIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "day");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(cueIdx).toBeGreaterThan(vIdx);
    expect(dIdx).toBeGreaterThan(cueIdx);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // ── Robustness: a second hunter_revenge after resolution is rejected
    // by the gate-open guard — no death, no broadcast.
    send(hunter.ws, { type: "hunter_revenge", targetId: citB.userId });
    await assertSilence(admin.ws, ["player_died", "phase_change", "you_died", "game_over", "hunter_revenge_pending"], 500);

    // ── Night-timer machinery intact after the revenge lifecycle (E9's
    // sequential direction): night 2 arms/fires its sub-phase timers and
    // resolves a plain dawn.
    const night2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "night 2");
    send(admin.ws, { type: "end_day" });
    const night2 = await night2Promise;
    expect(night2.round).toBe(2);
    const day2Promise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2");
    await mafiaSoloKill(game.players[MAFIA], citB);
    await day2Promise;
    // No second gate: the hunter is long dead, nobody re-prompts.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);

  test("win-check timing: revenge kills the last mafia — game_over arrives only AFTER resolution", async () => {
    const game = await setupGame(serverA!);
    const [admin, mafia, hunter] = [game.players[ADMIN], game.players[MAFIA], game.players[HUNTER]];

    await killHunterAndAwaitGate(game);

    // Gated: no premature win evaluation on the pre-revenge board.
    await assertSilence(admin.ws, ["game_over", "phase_change", "sound_cue"], 600);

    const overPromise = waitFor(admin.ws, "game_over", 5000);
    send(hunter.ws, { type: "hunter_revenge", targetId: mafia.userId });
    const over = await overPromise;
    expect(over.winner).toBe("town");
    await Bun.sleep(150);

    // Sequence: pending < player_died(mafia) < day cue < phase_change
    // (phase=game_over — the night-path game_over shape, golden #7) <
    // game_over.
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === mafia.userId);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day");
    const pcIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "game_over");
    const goIdx = indexOfMsg(admin.inbox, m => m.type === "game_over");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(cueIdx).toBeGreaterThan(vIdx);
    expect(pcIdx).toBeGreaterThan(cueIdx);
    expect(goIdx).toBeGreaterThan(pcIdx);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E6 — decline ×3: identical observable sequences
// ═══════════════════════════════════════════════════════════════════════

describe("E6: decline — explicit decline and admin force-skip are one path", () => {
  test("both resolutions produce the identical per-seat message sequence", async () => {
    // (a) hunter_revenge { targetId: null }
    const gameA = await setupGame(serverA!);
    await killHunterAndAwaitGate(gameA);
    const dayA = waitMatch(gameA.players[ADMIN].ws, m => m.type === "phase_change" && m.phase === "day", 5000, "decline dawn");
    send(gameA.players[HUNTER].ws, { type: "hunter_revenge", targetId: null });
    const dayChangeA = await dayA;
    await Bun.sleep(200);

    // The deferred dawn now carries [0] the cause-neutral night-batch line
    // (names the hunter, who died at night) and [1] the decline line, which
    // names no player. (The combined line is delivered even on the decline
    // path so living clients always get the one neutral announcement.)
    expect(dayChangeA.messages.length).toBe(2);
    expect(dayChangeA.messages[0]).toContain(gameA.players[HUNTER].username);
    for (const p of gameA.players) {
      expect(dayChangeA.messages[1]).not.toContain(p.username);
    }

    // (b) admin force_skip_revenge
    const gameB = await setupGame(serverA!);
    await killHunterAndAwaitGate(gameB);
    const dayB = waitMatch(gameB.players[ADMIN].ws, m => m.type === "phase_change" && m.phase === "day", 5000, "skip dawn");
    send(gameB.players[ADMIN].ws, { type: "force_skip_revenge" });
    await dayB;
    await Bun.sleep(200);

    // Identical observable sequence, per seat, across both games (modulo
    // narrator prose and timing — the summarizer drops both). No deaths in
    // the slice; the decline line rides the closing phase_change. The
    // night-kill gate frames the slice with the hunter_open / hunter_close
    // wake cues (Change 1), which the summarizer keeps — both paths emit
    // them identically, so the sequences still match.
    for (let i = 0; i < DEAL_ROLES.length; i++) {
      const seqA = summarizeSlice(gameA, gameA.players[i].inbox);
      const seqB = summarizeSlice(gameB, gameB.players[i].inbox);
      expect(seqA.length).toBeGreaterThanOrEqual(2); // at least pending + phase_change
      expect(seqA.find(s => s.type === "player_died")).toBeUndefined();
      expect(seqA.find(s => s.type === "you_died")).toBeUndefined();
      expect(seqB).toEqual(seqA);
    }

    // The declined game continues: night-timer machinery is intact after the
    // decline resolution (end_day → night 2 → kill → dawn 2).
    const adminA = gameA.players[ADMIN];
    const night2 = waitMatch(adminA.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "night 2 after decline");
    send(adminA.ws, { type: "end_day" });
    await night2;
    const day2 = waitMatch(adminA.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2 after decline");
    await mafiaSoloKill(gameA.players[MAFIA], gameA.players[CIT_A]);
    await day2;

    closeAll(gameA); closeAll(gameB);
  }, 90000);
});

// ═══════════════════════════════════════════════════════════════════════
// E9 — force_dawn clears the gate
// ═══════════════════════════════════════════════════════════════════════

describe("E9: force_dawn while gated", () => {
  test("force_dawn clears the gate (no revenge, no late fire); night timers unaffected", async () => {
    const game = await setupGame(serverA!);
    const admin = game.players[ADMIN];

    await killHunterAndAwaitGate(game);

    // force_dawn while the gate is open: a sanctioned gate-CLEARING forced
    // transition (§6) — straight to day, no revenge.
    const dayPromise = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "forced dawn");
    send(admin.ws, { type: "force_dawn" });
    const day = await dayPromise;
    expect(day.round).toBe(1);
    expect(day.messages).toContain("The host has forced dawn. No one was killed tonight.");
    await Bun.sleep(100);

    // No revenge happened: the only player_died is the hunter's own death.
    expect(admin.inbox.filter(m => m.type === "player_died").length).toBe(1);

    // The gate was truly CLEARED, not left dangling: there is no revenge
    // timer (Change 2) — nothing can auto-resolve — so the gate is simply
    // gone after force_dawn. Hold the window open well past any prior
    // would-be expiry and assert total silence: no second phase_change, no
    // late decline resolution, no stale re-prompt or wake cue.
    await assertSilence(admin.ws,
      ["phase_change", "player_died", "you_died", "game_over", "hunter_revenge_pending", "sound_cue"],
      2200);

    // Night timers never collided with the revenge slot: night 2 arms its
    // own sub-phase timers (resolve timer included) and a plain dawn lands.
    const night2 = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "night 2");
    send(admin.ws, { type: "end_day" });
    await night2;
    const day2 = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2");
    await mafiaSoloKill(game.players[MAFIA], game.players[CIT_A]);
    const day2Msg = await day2;
    expect(day2Msg.phase).toBe("day");
    // Still exactly one gate ever opened (round 1's), no stale re-prompt.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// Guard rejections for the two new handlers
// ═══════════════════════════════════════════════════════════════════════

describe("guards: hunter_revenge / force_skip_revenge rejections", () => {
  test("non-hunter, non-admin, dead/invalid targets all rejected; gate stays open; hunter retries successfully", async () => {
    const game = await setupGame(serverA!); // 60s timeout: gate stays open through the silence windows
    const [admin, , hunter, citA] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER], game.players[CIT_A],
    ];
    const resolutionTypes = ["player_died", "you_died", "phase_change", "game_over", "sound_cue"];

    await killHunterAndAwaitGate(game);

    // (1) non-hunter sends hunter_revenge → rejected
    send(citA.ws, { type: "hunter_revenge", targetId: admin.userId });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (2) non-admin sends force_skip_revenge → rejected
    send(citA.ws, { type: "force_skip_revenge" });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (3) hunter targets a nonexistent player → rejected, gate stays open
    send(hunter.ws, { type: "hunter_revenge", targetId: 999999 });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (4) hunter targets a DEAD player (themselves) → rejected
    send(hunter.ws, { type: "hunter_revenge", targetId: hunter.userId });
    await assertSilence(admin.ws, resolutionTypes, 400);

    // (5) the gate is still open: a valid retry resolves normally
    const victimDied = waitMatch(admin.ws, m => m.type === "player_died" && m.playerId === citA.userId, 5000, "retry kill");
    const dayChange = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "retry dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });
    await victimDied;
    await dayChange;

    closeAll(game);
  }, 60000);
});
