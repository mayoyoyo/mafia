import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Role } from "../src/types";
import {
  type HunterServer, type HunterGame,
  spawnServer, teardownServer, waitFor, waitMatch, assertSilence,
  send, setupGame as setupGameH, mafiaSoloKill, closeAll,
  revengeTimerEvents, indexOfMsg,
} from "./helpers/ws-harness";

/**
 * C8b — the §9 edge-matrix COMPLETION file. The audit below (the C8b task)
 * walked every case in HUNTER-DESIGN §9 against the four existing hunter
 * test files, confirming the asserted behavior (not just the test name)
 * matches each §9 case. It found exactly ONE missing half: E2's WS side
 * (night-path heartbreak over the wire). That half is filled here. The
 * other twelve cases were already complete; this header is the
 * self-documenting coverage map (§9 case → spec-required halves → where
 * covered → gap?).
 *
 * ── §9 EDGE-MATRIX COVERAGE TABLE ────────────────────────────────────────
 * Halves: which side(s) §9 marks for the case (engine / WS / both).
 *
 *  Case  Spec halves   Engine half covered by                  WS half covered by                       Gap?
 *  ────  ───────────   ─────────────────────────────────────   ──────────────────────────────────────  ────
 *  E1    engine + WS   hunter-edge-matrix "E1 official-joker     hunter-ws-night "E1: two-stage dawn"     no
 *                      haunt kills the Hunter" (gate AFTER       (deaths→reveal; only-hunter prompted;
 *                      death announcements; revenge; win-        phase_change deferred; revenge→day) +
 *                      check post-revenge)                       the win-check-post-revenge test.
 *                                                                NOTE: the WS half exercises the two-
 *                                                                stage-dawn TRANSPORT via a mafia night-
 *                                                                kill; the death-SOURCE specificity
 *                                                                (haunt) is engine-pinned — the dawn wire
 *                                                                flow is source-agnostic (one
 *                                                                resolveNightAndTransition path).
 *  E2    engine + WS   hunter-edge-matrix "E2 mafia kills the    hunter-ws-matrix (THIS FILE)             FILLED
 *                      Hunter's lover; the cascade kills the     "E2 (WS): night heartbreak" — was the
 *                      Hunter" (trigger on the CASCADE death;    one missing half (C8b).
 *                      two deaths then gate; revenge)
 *  E3    engine        hunter-edge-matrix "E3 the revenge        — (engine-only case)                     no
 *                      target is a lover"
 *  E4    engine + WS   hunter-edge-matrix "E4 …Hunter NOT        hunter-ws-vote "E4 base" ×2 +            no
 *                      executed" + the official-joker variant    "E4 heartbreak" + "E4 official-joker"
 *  E5    engine        hunter-edge-matrix "E5" (a/c1/c2/c3 +     — (engine-only case)                     no
 *                      §7 joint-winner row) + hunter-engine
 *                      E5b (last mafia) & E5d (decline-at-
 *                      parity)
 *  E6    engine + WS   hunter-engine "decline at parity" (the    hunter-ws-night "E6: decline ×3 —        no
 *                      engine decline path; force-skip & timer   identical per-seat sequence" (all
 *                      are server-only constructs with no        three resolutions asserted equal via
 *                      engine entry point)                       summarizeSlice)
 *  E7    engine        hunter-edge-matrix "E7 doctor             — (engine-only case)                     no
 *                      protection does not stop the revenge"
 *  E8    WS            — (WS-only case)                          hunter-ws-vote "E8 M7 rejection sweep"   no
 *                                                                + "gate-clearing forced transitions"
 *  E9    WS            — (WS-only case)                          hunter-ws-night "E9 timer isolation;     no
 *                                                                force_dawn while gated" (+ the night-2
 *                                                                timer direction inside E1)
 *  E10   WS            — (WS-only case)                          hunter-ws-rejoin "E10a/b/c/d"            no
 *  E11   engine        hunter-engine "E11 no living target"      — (engine-only case)                     no
 *  E12   engine        hunter-engine "E12 house-joker instant    — (engine-only case)                     no
 *                      win"
 *  E13   WS            — (WS-only case)                          hunter-ws-rejoin "E13 role secrecy"      no
 *
 * ── THE GAP THIS FILE FILLS ──────────────────────────────────────────────
 * E2 is the heartbreak-DIRECTION case at NIGHT: mafia night-kills the
 * Hunter's lover X; the cascade kills the Hunter; the gate opens at dawn.
 * The vote-path heartbreak is E4 (covered in hunter-ws-vote); the night-path
 * heartbreak (E2) had only its ENGINE half (hunter-edge-matrix). This file
 * supplies the WS half: TWO death announcements (X direct, then the Hunter's
 * heartbreak, isLoverDeath true) BEFORE the reveal, only the Hunter prompted,
 * the dawn phase_change deferred until revenge resolves.
 *
 * ── BAND / SEAM CONVENTIONS (C8b) ────────────────────────────────────────
 * Port band 25600-25999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging;
 * 22600-22999 hunter-ws-night; 23600-23999 hunter-ws-vote; 24600-24999
 * hunter-ws-rejoin). One server, default 60s revenge timeout — the gate is
 * resolved explicitly, never by expiry. Deterministic deal via the
 * MAFIA_FIXED_DEAL seam (one deal per process), lovers threaded as
 * join-order indices [HUNTER, X] exactly as hunter-ws-vote server B does.
 *
 * Username prefix "hmx" (matches no "hunter" substring), preserving the E13
 * mechanical-sweep guarantee per the established convention.
 */

const PORT_A = 25600 + Math.floor(Math.random() * 390); // 25600-25989

// Seat indices into the deal (join order). X (the hunter's lover) is P3.
const ADMIN = 0, MAFIA = 1, HUNTER = 2, LOVER_X = 3, CIT_B = 4, CIT_C = 5;

const DEAL_ROLES: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen"];
const LOVERS_SETTINGS = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: true,
};

// ── Server subprocess (harness: tests/helpers/ws-harness.ts) ───────────────
// Lovers = the hunter (P2) + the citizen X (P3), pinned via the
// MAFIA_FIXED_DEAL `lovers` join-order index pair (assignFixedRoles).

let serverA: HunterServer | null = null;

beforeAll(async () => {
  serverA = await spawnServer(PORT_A, "A", "matrix", DEAL_ROLES, { lovers: [HUNTER, LOVER_X] });
});

afterAll(() => {
  teardownServer(serverA);
});

// ── This file's setupGame: the shared harness driver bound to this band's
//    fixed deal/settings/username prefix (test bodies call setupGame(srv)). ─
function setupGame(srv: HunterServer): Promise<HunterGame> {
  return setupGameH(srv, { prefix: "hmx", dealRoles: DEAL_ROLES, settings: LOVERS_SETTINGS });
}

// ═══════════════════════════════════════════════════════════════════════
// E2 (WS half) — night-path heartbreak: mafia night-kills the lover X;
// the cascade kills the Hunter; the gate opens at dawn.
// ═══════════════════════════════════════════════════════════════════════

describe("E2 (WS): night heartbreak — mafia kills the hunter's lover, cascade kills the hunter", () => {
  test("two death announcements (X direct, hunter heartbreak) precede the reveal; only the hunter is prompted; phase_change deferred until revenge resolves", async () => {
    const game = await setupGame(serverA!);
    const [admin, mafia, hunter, loverX, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[LOVER_X], game.players[CIT_B],
    ];

    // Night 1: mafia night-kills X (the hunter's lover) — NOT the hunter.
    // The heartbreak cascade kills the hunter, opening the gate at dawn.
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    await mafiaSoloKill(mafia, loverX);
    const pending = await pendingP;
    expect(pending.hunterName).toBe(hunter.username); // the reveal names the HUNTER, not X
    await Bun.sleep(150);

    // ── Two death announcements precede the reveal, on EVERY inbox: ───────
    // player_died(X, direct) < player_died(hunter, heartbreak) < pending.
    for (const p of game.players) {
      const xIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === loverX.userId);
      const hIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
      const pendIdx = indexOfMsg(p.inbox, m => m.type === "hunter_revenge_pending");
      expect(xIdx).toBeGreaterThanOrEqual(0);
      expect(hIdx).toBeGreaterThan(xIdx);     // the cascade death announced AFTER the direct kill
      expect(pendIdx).toBeGreaterThan(hIdx);  // …and BOTH before the gate (the E2 ordering)
    }

    // Death labels keyed on cause (B3): X died direct (no isLoverDeath), the
    // hunter of heartbreak (isLoverDeath true — the cascade-victim copy).
    const xDied = loverX.inbox.find(m => m.type === "you_died");
    expect(xDied).toBeDefined();
    expect(xDied.isLoverDeath).toBeUndefined();
    const hunterDied = hunter.inbox.find(m => m.type === "you_died");
    expect(hunterDied).toBeDefined();
    expect(hunterDied.isLoverDeath).toBe(true);
    // The hunter's own you_died precedes their reveal/prompt.
    const hYouDiedIdx = indexOfMsg(hunter.inbox, m => m.type === "you_died");
    expect(hYouDiedIdx).toBeLessThan(indexOfMsg(hunter.inbox, m => m.type === "hunter_revenge_pending"));

    // The hunter — and ONLY the hunter — got the target list: exactly the
    // four living players (X and the hunter are both dead).
    const targetsMsg = hunter.inbox.find(m => m.type === "hunter_revenge_targets");
    expect(targetsMsg).toBeDefined();
    const targetSeats = targetsMsg.players.map((p: any) => game.seatOfId.get(p.id)).sort();
    expect(targetSeats).toEqual(["P0", "P1", "P4", "P5"]); // P2 (hunter) & P3 (X) dead
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue;
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // Spectator isolation (§3.9 server side): the prompted hunter received no
    // dead-spectator panel at the gated dawn.
    expect(hunter.inbox.find(m => m.type === "spectator_kill_confirmed")).toBeUndefined();

    // The dawn is HELD: only the game-start night phase_change so far, and no
    // day cue / game_over while gated.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(1);
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);
    // The revenge timeout is armed while gated (never collided with anything).
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed"]);

    // ── Revenge over the wire: the heartbreak-dead hunter shoots a citizen ─
    const victimDiedP = waitFor(citB.ws, "you_died", 5000);
    const dayP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 5000, "deferred dawn");
    send(hunter.ws, { type: "hunter_revenge", targetId: citB.userId });

    const victimDied = await victimDiedP;
    expect(victimDied.isLoverDeath).toBeUndefined(); // the citizen is no lover
    const dayChange = await dayP;
    expect(dayChange.round).toBe(1);
    // The closing phase_change carries the revenge narrator line (loose prose
    // match: the victim's name). The gated vote's own cascade name was
    // announced via the death loop, never re-attached here.
    expect(dayChange.messages.length).toBe(1);
    expect(dayChange.messages[0]).toContain(citB.username);
    expect(dayChange.loverDeathName).toBeUndefined();
    await Bun.sleep(150);

    // Order on the admin inbox: pending < player_died(victim) < day cue <
    // phase_change(day). No game_over (1 mafia vs admin + 2 citizens = town
    // majority still).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === citB.userId);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day");
    const dIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "day");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(cueIdx).toBeGreaterThan(vIdx);
    expect(dIdx).toBeGreaterThan(cueIdx);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // Gate resolved → timer cleared (slog lifecycle, never orphaned).
    expect(revengeTimerEvents(serverA!, game.code)).toEqual(["armed", "cleared"]);
    // Exactly one gate ever opened.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);
});
