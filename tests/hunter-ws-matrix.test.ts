import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Role } from "../src/types";
import {
  type HunterServer, type HunterGame,
  spawnServer, teardownServer, waitMatch, assertSilence,
  setupGame as setupGameH, mafiaSoloKill, closeAll,
  slogEvents, indexOfMsg,
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
 *                      Hunter" (NO trigger on the CASCADE        one missing half (C8b).
 *                      death; two deaths then straight to day,
 *                      no gate, no revenge — direct-only rule)
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
 * Hunter's lover X; the cascade kills the Hunter. Under the DIRECT-ONLY
 * revenge rule, a Hunter who dies as the lover-cascade SECONDARY death takes
 * NO revenge — the gate opens only for a DIRECT Hunter death. So the night
 * resolves straight through to day: NO reveal, NO prompt, NO gate. The
 * vote-path heartbreak is E4 (covered in hunter-ws-vote); the night-path
 * heartbreak (E2) had only its ENGINE half (hunter-edge-matrix). This file
 * supplies the WS half: TWO death announcements (X direct, then the Hunter's
 * heartbreak, isLoverDeath true) precede the dawn, and the phase_change to
 * day fires immediately with NO hunter_revenge_pending / _targets anywhere.
 *
 * ── BAND / SEAM CONVENTIONS (C8b) ────────────────────────────────────────
 * Port band 25600-25999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging;
 * 22600-22999 hunter-ws-night; 23600-23999 hunter-ws-vote; 24600-24999
 * hunter-ws-rejoin). One server, no revenge timer (fully removed — the gate,
 * when it opens at all, is resolved only by an explicit shot or force-skip).
 * Deterministic deal via the MAFIA_FIXED_DEAL seam (one deal per process),
 * lovers threaded as join-order indices [HUNTER, X] exactly as hunter-ws-vote
 * server B does.
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
// E2 (WS half) — night-path heartbreak: mafia night-kills the lover X; the
// cascade kills the Hunter. The Hunter dies as the SECONDARY (lover_cascade)
// death, so under the direct-only revenge rule NO gate opens — the night
// resolves straight through to day.
// ═══════════════════════════════════════════════════════════════════════

describe("E2 (WS): night heartbreak — mafia kills the hunter's lover, cascade kills the hunter (no revenge gate)", () => {
  test("two death announcements (X direct, hunter heartbreak) precede the dawn; NO revenge gate; phase_change to day fires immediately", async () => {
    const game = await setupGame(serverA!);
    const [admin, mafia, hunter, loverX, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[LOVER_X], game.players[CIT_B],
    ];

    // Night 1: mafia night-kills X (the hunter's lover) — NOT the hunter.
    // The heartbreak cascade kills the hunter as the SECONDARY death. Under
    // the direct-only revenge rule a lover-cascade Hunter death opens NO gate:
    // the night resolves straight through to day.
    const dayP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day", 8000, "dawn");
    await mafiaSoloKill(mafia, loverX);
    const dayChange = await dayP;
    await Bun.sleep(200); // let per-socket fan-out settle on every inbox

    // ── Two death announcements precede the dawn, on EVERY inbox: ─────────
    // player_died(X, direct) < player_died(hunter, heartbreak) < phase_change.
    for (const p of game.players) {
      const xIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === loverX.userId);
      const hIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
      const dayIdx = indexOfMsg(p.inbox, m => m.type === "phase_change" && m.phase === "day");
      expect(xIdx).toBeGreaterThanOrEqual(0);
      expect(hIdx).toBeGreaterThan(xIdx);   // the cascade death announced AFTER the direct kill
      expect(dayIdx).toBeGreaterThan(hIdx); // …and BOTH before the dawn phase_change
    }

    // Death labels keyed on cause (B3): X died direct (no isLoverDeath), the
    // hunter of heartbreak (isLoverDeath true — the cascade-victim copy).
    const xDied = loverX.inbox.find(m => m.type === "you_died");
    expect(xDied).toBeDefined();
    expect(xDied.isLoverDeath).toBeUndefined();
    const hunterDied = hunter.inbox.find(m => m.type === "you_died");
    expect(hunterDied).toBeDefined();
    expect(hunterDied.isLoverDeath).toBe(true);

    // ── NO revenge gate anywhere (direct-only rule): the cascade Hunter death
    // never triggers a reveal, a prompt, or a target list, on ANY inbox. ────
    for (const p of game.players) {
      expect(p.inbox.find(m => m.type === "hunter_revenge_pending")).toBeUndefined();
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }
    // No engine-side trace either: the cascade death never queued/opened a
    // hunter gate, so no hunter_gate slog line was ever emitted for this game.
    expect(slogEvents(serverA!, "hunter_gate", game.code)).toEqual([]);

    // The dawn carries the standard night→day shape: round 1, the cascade's
    // loverDeathName is the hunter (the secondary victim), no game_over (1
    // mafia vs admin + 2 citizens = town majority still alive).
    expect(dayChange.round).toBe(1);
    expect(dayChange.loverDeathName).toBe(hunter.username);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // Order on the admin inbox: player_died(X) < player_died(hunter) < day cue
    // < phase_change(day). Exactly one night→day phase_change; no gate cues.
    const xIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === loverX.userId);
    const hIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day");
    const dIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "day");
    expect(xIdx).toBeGreaterThanOrEqual(0);
    expect(hIdx).toBeGreaterThan(xIdx);
    expect(cueIdx).toBeGreaterThan(hIdx);
    expect(dIdx).toBeGreaterThan(cueIdx);
    // Exactly one phase_change reached the day (the dawn), and no hunter cues.
    expect(admin.inbox.filter(m => m.type === "phase_change" && m.phase === "day").length).toBe(1);
    expect(admin.inbox.find(m => m.type === "sound_cue" && (m.sound === "hunter_open" || m.sound === "hunter_close"))).toBeUndefined();

    // Day has settled: no further phase_change / game_over / revenge reveal.
    await assertSilence(admin.ws, ["phase_change", "game_over", "hunter_revenge_pending"], 600);

    closeAll(game);
  }, 60000);
});
