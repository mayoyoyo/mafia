import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Role } from "../src/types";
import {
  type HunterServer, type HunterGame,
  spawnServer, teardownServer, waitFor, waitMatch, assertSilence, collectFor,
  send, setupGame as setupGameH, forceDawnToDay, lynchByVote, mafiaSoloKill,
  closeAll, revengeGateRejects, indexOfMsg,
} from "./helpers/ws-harness";

/**
 * C3b — WS half of the Hunter revenge flow, VOTE path (HUNTER-DESIGN §3.6,
 * §4, §6, §9): edge E4 (day-lynch interrupt — direct, heartbreak, and the
 * official-joker case) and edge E8 (the M7 gate-rejection sweep). The night
 * path (E1/E6/E9) is C3a in tests/hunter-ws-night.test.ts; rejoin
 * mid-revenge (E10) is C4.
 *
 * The revenge gate has NO timer: it stays open until the hunter shoots or
 * the admin force-skips. And only a DIRECT hunter death opens it — a hunter
 * who dies as a lover-cascade SECONDARY death (heartbreak) takes no revenge,
 * so those E4 variants proceed straight through with no gate at all.
 *
 * Port band 23600-23999 is claimed by this file (taken elsewhere: 4567,
 * 5567, 6567, 7600, 8600, 9600, 10600, 11600, 12600; 13600-17600 reserved;
 * 18600-19999 + 21600-21999 goldens; 20600-20999 structured-logging;
 * 22600-22999 hunter-ws-night). Sub-bands, one fixed deal per server
 * process (the MAFIA_FIXED_DEAL env seam is process-wide):
 *   server A 23600-23689 — base deal, no lovers (direct-lynch gates that
 *     must HOLD through silence windows): E4 base ×2, E8 rejection sweep,
 *     E8 force_dawn-rejected-at-voting-gate;
 *   server B 23700-23789 — lovers hunter+P3(citizen): E4 heartbreak (the
 *     secondary-death case — no gate);
 *   server C 23800-23889 — joker at P3, lovers hunter+joker: E4
 *     official-joker variant (heartbreak hunter, so no gate — the haunt
 *     night begins immediately, the preserveHauntVoters payoff).
 *
 * Lover pairing over WS: the existing MAFIA_FIXED_DEAL seam already carries
 * `lovers: [i, j]` (join-order indices — assignFixedRoles pairs them
 * directly); no seam extension was needed.
 */

const PORT_A = 23600 + Math.floor(Math.random() * 90); // 23600-23689
const PORT_B = 23700 + Math.floor(Math.random() * 90); // 23700-23789
const PORT_C = 23800 + Math.floor(Math.random() * 90); // 23800-23889

// Seat indices into every deal (join order). P3 is the variable seat:
// citizen (A), the hunter's lover-citizen (B), the hunter's lover-joker (C).
const ADMIN = 0, MAFIA = 1, HUNTER = 2, P3 = 3, CIT_B = 4, CIT_C = 5;

const BASE_ROLES: Role[] = ["citizen", "mafia", "hunter", "citizen", "citizen", "citizen"];
const JOKER_ROLES: Role[] = ["citizen", "mafia", "hunter", "joker", "citizen", "citizen"];

const BASE_SETTINGS = {
  mafiaCount: 1, enableDoctor: false, enableDetective: false,
  enableJoker: false, enableHunter: true, enableLovers: false,
};
const LOVERS_SETTINGS = { ...BASE_SETTINGS, enableLovers: true };
const JOKER_SETTINGS = {
  ...BASE_SETTINGS, enableJoker: true, enableLovers: true, jokerMode: "official",
};

// ── Per-band server subprocesses (harness: tests/helpers/ws-harness.ts) ────

let serverA: HunterServer | null = null;
let serverB: HunterServer | null = null;
let serverC: HunterServer | null = null;

beforeAll(async () => {
  [serverA, serverB, serverC] = await Promise.all([
    spawnServer(PORT_A, "A", "vote", BASE_ROLES),
    spawnServer(PORT_B, "B", "vote", BASE_ROLES, { lovers: [HUNTER, P3] }),
    spawnServer(PORT_C, "C", "vote", JOKER_ROLES, { lovers: [HUNTER, P3] }),
  ]);
});

afterAll(() => {
  for (const srv of [serverA, serverB, serverC]) teardownServer(srv);
});

// ── This file's setupGame: the shared harness driver bound to this file's
//    username prefix (test bodies call setupGame(srv, dealRoles, settings)). ─
function setupGame(srv: HunterServer, dealRoles: Role[], settings: Record<string, unknown>): Promise<HunterGame> {
  return setupGameH(srv, { prefix: "hwv", dealRoles, settings });
}

// ═══════════════════════════════════════════════════════════════════════
// E4 — vote-path interrupt, base case: the hunter is lynched directly
// ═══════════════════════════════════════════════════════════════════════

describe("E4 base: hunter lynched by day vote", () => {
  test("vote_result + deaths precede the gate; no phase_change/cue while gated; revenge → auto-night resumes", async () => {
    const game = await setupGame(serverA!, BASE_ROLES, BASE_SETTINGS);
    const [admin, mafia, hunter, citA, citB] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3], game.players[CIT_B],
    ];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    const result = await lynchByVote(game, hunter, game.players); // all 6 alive approve
    expect(result.executed).toBe(true);
    expect(result.targetName).toBe(hunter.username);
    const pending = await pendingP;
    expect(pending.hunterName).toBe(hunter.username);
    await Bun.sleep(150);

    // Execution beats precede the gate, on every inbox: vote_result <
    // player_died(hunter) < hunter_revenge_pending.
    for (const p of game.players) {
      const vrIdx = indexOfMsg(p.inbox, m => m.type === "vote_result");
      const diedIdx = indexOfMsg(p.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
      const pendingIdx = indexOfMsg(p.inbox, m => m.type === "hunter_revenge_pending");
      expect(vrIdx).toBeGreaterThanOrEqual(0);
      expect(diedIdx).toBeGreaterThan(vrIdx);
      expect(pendingIdx).toBeGreaterThan(diedIdx);
    }
    const youDiedIdx = indexOfMsg(hunter.inbox, m => m.type === "you_died");
    expect(youDiedIdx).toBeGreaterThanOrEqual(0);
    expect(youDiedIdx).toBeLessThan(indexOfMsg(hunter.inbox, m => m.type === "hunter_revenge_pending"));

    // The hunter — and ONLY the hunter — got the target list: the 5 living.
    const targetsMsg = hunter.inbox.find(m => m.type === "hunter_revenge_targets");
    expect(targetsMsg).toBeDefined();
    const targetIds = targetsMsg.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const livingIds = game.players.filter(p => p.userId !== hunter.userId).map(p => p.userId).sort((a, b) => a - b);
    expect(targetIds).toEqual(livingIds);
    for (const p of game.players) {
      if (p.userId === hunter.userId) continue;
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // The auto-night is HELD: phase stays put — no phase_change beyond the
    // two so far (game-start night + forced day), no cue, no game_over.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(2);
    await assertSilence(admin.ws, ["phase_change", "game_over", "sound_cue"], 600);

    // ── Revenge: hunter shoots a citizen → deferred auto-night resumes ──
    const victimDiedP = waitFor(citA.ws, "you_died", 5000);
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "deferred auto-night");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });

    const victimDied = await victimDiedP;
    expect(victimDied.isLoverDeath).toBeUndefined();
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    // Closing messages: the revenge kill line + the night-falls line.
    expect(nightChange.messages.length).toBe(2);
    expect(nightChange.messages[0]).toContain(citA.username);
    expect(Array.isArray(nightChange.events)).toBe(true);
    await Bun.sleep(150);

    // Order on the admin inbox: pending < player_died(victim) <
    // phase_change(night) < night cue; NO day cue after the gate opened
    // (the vote-path resume goes to night, never dawn).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === citA.userId);
    const ncIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "night", pIdx);
    const cueIdx = indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "night", pIdx);
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(ncIdx).toBeGreaterThan(vIdx);
    expect(cueIdx).toBeGreaterThan(ncIdx);
    expect(indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day", pIdx)).toBe(-1);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // Night 2 genuinely runs: mafia is re-prompted and a plain dawn lands
    // (mafia-inbox-local index — never compared across inboxes).
    expect(indexOfMsg(mafia.inbox, m => m.type === "mafia_targets",
      indexOfMsg(mafia.inbox, m => m.type === "hunter_revenge_pending"))).toBeGreaterThan(-1);
    const day2P = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "day" && m.round === 2, 8000, "dawn 2");
    await mafiaSoloKill(mafia, citB);
    await day2P;
    // Exactly one gate ever opened.
    expect(admin.inbox.filter(m => m.type === "hunter_revenge_pending").length).toBe(1);

    closeAll(game);
  }, 60000);

  test("game_over by revenge from the voting phase: revenge kills the last mafia — town wins, no day cue", async () => {
    const game = await setupGame(serverA!, BASE_ROLES, BASE_SETTINGS);
    const [admin, mafia, hunter] = [game.players[ADMIN], game.players[MAFIA], game.players[HUNTER]];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    await lynchByVote(game, hunter, game.players);
    await pendingP;

    // Gated: no premature win evaluation on the pre-revenge board.
    await assertSilence(admin.ws, ["game_over", "phase_change", "sound_cue"], 600);

    const overP = waitFor(admin.ws, "game_over", 5000);
    send(hunter.ws, { type: "hunter_revenge", targetId: mafia.userId });
    const over = await overP;
    expect(over.winner).toBe("town");
    await Bun.sleep(150);

    // Sequence: pending < player_died(mafia) < phase_change(game_over) <
    // game_over — and NO day cue anywhere after the gate (the vote-path
    // game_over shape sends no cue, unlike the night-path golden #7).
    const pIdx = indexOfMsg(admin.inbox, m => m.type === "hunter_revenge_pending");
    const vIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === mafia.userId);
    const pcIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "game_over");
    const goIdx = indexOfMsg(admin.inbox, m => m.type === "game_over");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThan(pIdx);
    expect(pcIdx).toBeGreaterThan(vIdx);
    expect(goIdx).toBeGreaterThan(pcIdx);
    expect(indexOfMsg(admin.inbox, m => m.type === "sound_cue" && m.sound === "day", pIdx)).toBe(-1);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E4 heartbreak: the lynch target is the hunter's LOVER (hunter not executed)
// ═══════════════════════════════════════════════════════════════════════

describe("E4 heartbreak: lover lynched, hunter dies of heartbreak mid-vote", () => {
  test("cascade deaths broadcast, NO gate (heartbreak takes no revenge); auto-night proceeds", async () => {
    const game = await setupGame(serverB!, BASE_ROLES, LOVERS_SETTINGS);
    const [admin, mafia, hunter, lover] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3],
    ];

    await forceDawnToDay(game);
    // A heartbreak hunter dies as the lover-cascade SECONDARY death — cause
    // "lover_cascade", NOT "direct" — so NO revenge gate opens. The vote
    // resolution proceeds straight through to the auto-night, exactly as a
    // lover cascade with no hunter would. Arm the night waiter BEFORE the
    // lynch: with no gate to hold it, the phase_change(night) fires
    // synchronously inside lynchByVote's resolution.
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 8000, "auto-night after heartbreak");
    const result = await lynchByVote(game, lover, game.players);
    expect(result.executed).toBe(true);
    expect(result.targetName).toBe(lover.username); // the HUNTER was not the executed player
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    await Bun.sleep(150);

    // Cascade beats, then the auto-night — and NO gate anywhere on the admin
    // inbox: vote_result < player_died(lover, direct) <
    // player_died(hunter, heartbreak) < phase_change(night).
    const vrIdx = indexOfMsg(admin.inbox, m => m.type === "vote_result");
    const loverIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === lover.userId);
    const hunterIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
    const ncIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "night" && m.round === 2);
    expect(vrIdx).toBeGreaterThanOrEqual(0);
    expect(loverIdx).toBeGreaterThan(vrIdx);
    expect(hunterIdx).toBeGreaterThan(loverIdx);
    expect(ncIdx).toBeGreaterThan(hunterIdx);

    // No revenge gate ever opened — not the public reveal, not the prompt.
    for (const p of game.players) {
      expect(p.inbox.find(m => m.type === "hunter_revenge_pending")).toBeUndefined();
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // Owner ruling: heartbreak is public. The lynched lover (direct) carries NO
    // isLoverDeath; the cascade-victim Hunter DOES (private heartbreak art).
    const loverDied = lover.inbox.find(m => m.type === "you_died");
    expect(loverDied.isLoverDeath).toBeUndefined();
    const hunterDied = hunter.inbox.find(m => m.type === "you_died");
    expect(hunterDied.isLoverDeath).toBe(true);

    // The auto-night phase_change carries loverDeathName = the heartbroken
    // Hunter's name (the public "died of heartbreak" beat fires).
    expect(nightChange.loverDeathName).toBe(hunter.username);

    // Exactly the two phase_changes seen by now: game-start night + forced
    // day, plus this auto-night (the third), with no game_over.
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(3);
    expect(admin.inbox.find(m => m.type === "game_over")).toBeUndefined();

    // Night 2 prompts the mafia again (mafia-inbox-local index, anchored on
    // the auto-night phase_change).
    expect(indexOfMsg(mafia.inbox, m => m.type === "mafia_targets",
      indexOfMsg(mafia.inbox, m => m.type === "phase_change" && m.phase === "night" && m.round === 2))).toBeGreaterThan(-1);

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E4 official-joker variant: joker lynched, joker's lover is the hunter —
// the hunter dies of heartbreak (secondary cascade death) so NO gate opens;
// the HAUNT night begins immediately (preserveHauntVoters payoff)
// ═══════════════════════════════════════════════════════════════════════

describe("E4 official-joker: lynched joker's lover is the hunter", () => {
  test("NO gate after the cascade; the haunt night begins immediately and the haunt lands on a FOR-voter", async () => {
    const game = await setupGame(serverC!, JOKER_ROLES, JOKER_SETTINGS);
    const [admin, mafia, hunter, joker, citB, citC] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3], game.players[CIT_B], game.players[CIT_C],
    ];

    await forceDawnToDay(game);
    // The hunter is the joker's lover, so the lynch cascade kills the hunter
    // as a lover_cascade SECONDARY death → NO revenge gate. The official-joker
    // haunt night is therefore no longer deferred behind the gate: it begins
    // immediately on the vote resolution. Arm the night + haunt-prompt waiters
    // BEFORE the lynch (no gate holds them back now).
    const overlayP = waitFor(joker.ws, "joker_win_overlay", 8000);
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 8000, "immediate haunt night");
    const hauntPromptP = waitFor(joker.ws, "joker_haunt_targets", 8000);
    const result = await lynchByVote(game, joker, game.players); // all 6 are FOR-voters
    expect(result.executed).toBe(true);
    await overlayP; // official-mode joker win overlay still reaches the joker
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    const hauntPrompt = await hauntPromptP;
    await Bun.sleep(150);

    // Cascade then the immediate haunt night, NO gate: player_died(joker) <
    // player_died(hunter) < phase_change(night) on the admin inbox.
    const jIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === joker.userId);
    const hIdx = indexOfMsg(admin.inbox, m => m.type === "player_died" && m.playerId === hunter.userId);
    const adminNcIdx = indexOfMsg(admin.inbox, m => m.type === "phase_change" && m.phase === "night" && m.round === 2);
    expect(jIdx).toBeGreaterThanOrEqual(0);
    expect(hIdx).toBeGreaterThan(jIdx);
    expect(adminNcIdx).toBeGreaterThan(hIdx);
    // Owner ruling: the heartbroken Hunter's own you_died carries isLoverDeath.
    expect(hunter.inbox.find(m => m.type === "you_died").isLoverDeath).toBe(true);

    // No revenge gate ever opened — not the public reveal, not the prompt.
    for (const p of game.players) {
      expect(p.inbox.find(m => m.type === "hunter_revenge_pending")).toBeUndefined();
      expect(p.inbox.find(m => m.type === "hunter_revenge_targets")).toBeUndefined();
    }

    // preserveHauntVoters observable on the wire: the haunt prompt arrived
    // AFTER the night began, listing the still-living FOR-voters (indices are
    // joker-inbox-local — never compared across inboxes).
    const ncIdx = indexOfMsg(joker.inbox, m => m.type === "phase_change" && m.phase === "night" && m.round === 2);
    const hpIdx = indexOfMsg(joker.inbox, m => m.type === "joker_haunt_targets");
    expect(ncIdx).toBeGreaterThanOrEqual(0);
    expect(hpIdx).toBeGreaterThan(ncIdx);
    expect(hauntPrompt.players.map((p: any) => game.seatOfId.get(p.id)).sort())
      .toEqual(["P0", "P1", "P4", "P5"]); // alive FOR-voters (P2 hunter, P3 joker dead)

    // The haunt WORKS on a FOR-voter: joker haunts citC, mafia kills admin,
    // dawn announces both — leaving mafia vs citB (1v1 parity) → mafia wins.
    const hauntDone = waitFor(joker.ws, "night_action_done", 5000);
    send(joker.ws, { type: "joker_haunt", targetId: citC.userId });
    await hauntDone;
    const overP = waitFor(mafia.ws, "game_over", 8000);
    await mafiaSoloKill(mafia, admin);
    const over = await overP;
    expect(over.winner).toBe("mafia");
    expect(over.jokerJointWinner).toBe(true); // §7: rides the payload unchanged
    await Bun.sleep(150);
    // The haunt victim's death is real and announced at dawn (mafia-inbox-
    // local search, anchored on the haunt-night phase_change).
    const mNcIdx = indexOfMsg(mafia.inbox, m => m.type === "phase_change" && m.phase === "night" && m.round === 2);
    expect(indexOfMsg(mafia.inbox, m => m.type === "player_died" && m.playerId === citC.userId, mNcIdx)).toBeGreaterThan(-1);
    expect(citC.inbox.find(m => m.type === "you_died")).toBeDefined();

    closeAll(game);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════
// E8 — the M7 gate-rejection sweep
// ═══════════════════════════════════════════════════════════════════════

/** HUNTER-DESIGN §3.6, verbatim: rejected while game.pendingRevenge !== null. */
const GATE_REJECTED_TYPES = [
  "call_vote", "cast_vote", "abstain_vote", "cancel_vote", "end_day",
  "mafia_vote", "mafia_remove_vote", "confirm_mafia_kill", "doctor_save",
  "detective_investigate", "joker_haunt", "narrator_ready", "start_game",
] as const;

describe("E8: M7 rejection sweep while the vote-path gate is open", () => {
  test("every §3.6 message type is rejected with zero wire traffic; gate survives; hunter still resolves", async () => {
    const game = await setupGame(serverA!, BASE_ROLES, BASE_SETTINGS);
    const [admin, mafia, hunter, citA, citB, citC] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER],
      game.players[P3], game.players[CIT_B], game.players[CIT_C],
    ];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    await lynchByVote(game, hunter, game.players);
    await pendingP;
    await Bun.sleep(150);
    const preSweepPhaseChanges = admin.inbox.filter(m => m.type === "phase_change").length;
    expect(preSweepPhaseChanges).toBe(2); // game-start night + forced day

    // Bounded-collect (handler-guards.test.ts pattern) on two vantage
    // points: the admin and an alive citizen. STRICT emptiness — a rejected
    // handler produces no broadcast, no error, no private reply. The two
    // engine-reachable holes the sweep exists for: cast_vote (phase holds
    // at "voting" with a cleared ballot — castVote would record and
    // broadcast vote_update) and cancel_vote (cancelVote would wipe the
    // gate via resetNightActions and flip to day).
    const collectAdmin = collectFor(admin.ws, 1000);
    const collectCit = collectFor(citB.ws, 1000);
    send(admin.ws, { type: "call_vote", targetId: citB.userId });
    send(citB.ws, { type: "cast_vote", approve: true });
    send(admin.ws, { type: "abstain_vote" });
    send(admin.ws, { type: "cancel_vote" });
    send(admin.ws, { type: "end_day" });
    send(mafia.ws, { type: "mafia_vote", targetId: citB.userId, voteType: "lock" });
    send(mafia.ws, { type: "mafia_remove_vote", targetId: citB.userId });
    send(mafia.ws, { type: "confirm_mafia_kill" });
    send(citC.ws, { type: "doctor_save", targetId: citB.userId });
    send(citC.ws, { type: "detective_investigate", targetId: citB.userId });
    send(citC.ws, { type: "joker_haunt", targetId: citB.userId });
    send(admin.ws, { type: "narrator_ready" });
    send(admin.ws, { type: "start_game" });
    expect(await collectAdmin).toEqual([]);
    expect(await collectCit).toEqual([]);

    // Positive trace: the dispatch-level sweep bounced each of the 13 §3.6
    // types exactly once (slog "revenge_gate_reject" — the rejections are
    // deliberately silent on the wire).
    expect(revengeGateRejects(serverA!, game.code).sort())
      .toEqual([...GATE_REJECTED_TYPES].sort());

    // §3.6 exceptions still flow while gated: prefs are connection-level.
    const prefsP = waitFor(citC.ws, "player_prefs", 5000);
    send(citC.ws, { type: "update_player_pref", key: "player_color", value: "#E53935" });
    await prefsP;

    // Gate survived the sweep (no phase advanced)…
    expect(admin.inbox.filter(m => m.type === "phase_change").length).toBe(preSweepPhaseChanges);

    // …and the hunter can still resolve (decline → deferred auto-night).
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "post-sweep resolution");
    send(hunter.ws, { type: "hunter_revenge", targetId: null });
    const nightChange = await nightP;
    expect(nightChange.round).toBe(2);
    expect(nightChange.messages.length).toBe(2); // decline line + night-falls line
    for (const p of game.players) {
      expect(nightChange.messages[0]).not.toContain(p.username); // decline names nobody
    }
    await Bun.sleep(150);
    expect(admin.inbox.find(m => m.type === "player_died" && m.playerId !== hunter.userId)).toBeUndefined();

    closeAll(game);
  }, 60000);

  test("force_dawn at a VOTING gate is rejected by the engine: gate survives, hunter still resolves", async () => {
    const game = await setupGame(serverA!, BASE_ROLES, BASE_SETTINGS);
    const [admin, , hunter, citA] = [
      game.players[ADMIN], game.players[MAFIA], game.players[HUNTER], game.players[P3],
    ];

    await forceDawnToDay(game);
    const pendingP = waitFor(admin.ws, "hunter_revenge_pending", 8000);
    await lynchByVote(game, hunter, game.players);
    await pendingP;
    await Bun.sleep(150);

    // force_dawn only applies to night-phase gates: at "voting" forceDawn
    // rejects, and the rejection must NOT clear the gate.
    send(admin.ws, { type: "force_dawn" });
    await assertSilence(admin.ws,
      ["phase_change", "sound_cue", "game_over", "player_died", "you_died", "lobby_update"], 600);

    // Gate alive: revenge still resolves into the deferred auto-night.
    const victimP = waitFor(citA.ws, "you_died", 5000);
    const nightP = waitMatch(admin.ws, m => m.type === "phase_change" && m.phase === "night", 5000, "post-force_dawn resolution");
    send(hunter.ws, { type: "hunter_revenge", targetId: citA.userId });
    await victimP;
    await nightP;
    await Bun.sleep(150);

    closeAll(game);
  }, 60000);
});
