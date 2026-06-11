import { describe, test, expect, afterEach } from "bun:test";

/**
 * C2a (HUNTER-DESIGN §3.5/§4) — the ENGINE half of the Hunter revenge
 * mechanism: trigger queue, gate open at concludeRound, submitHunterRevenge,
 * suppression edges E11/E12, and the §6 forced-transition clears.
 *
 * THE SEQUENCING TRAP (the program's #1 known bug hazard, pinned first):
 * notifyDeathTriggers fires inside applyDeath, which runs BEFORE the
 * caller's resetNightActions in all three flows — and pendingRevenge is
 * NIGHT_RESETS-scoped, so a gate set inside the hook is WIPED before
 * concludeRound's gate check runs. The first test FAILS on that naive
 * design by construction: it drives the engine's real day-transition flow
 * (not hand-built state) and requires the gate to be open afterwards.
 *
 * Narrator coupling is deliberately LOOSE (C6 expanded the stubs to
 * 3–5 variants): tests assert message POSITION/ORDER, event types, and
 * name inclusion — never exact prose.
 *
 * The full edge matrix E1–E5/E7 (haunt source, both lover-cascade
 * directions, revenge-into-lover, vote-path preserveHauntVoters resume,
 * parity table, doctor-cannot-block) is task C2b.
 */

import {
  removeGame, setFixedDeal,
  advanceNightSubPhase, transitionToDay, callVote, castVote,
  resolveVote, forceDawn, endDay, forceEndGame, returnToLobby, restartGame,
  applyDeath, resetNightActions, concludeRound, submitHunterRevenge,
  assertInvariants,
} from "../src/game-engine";
import { dumpGame } from "../src/debug";
import type { Game, GameSettings, Role } from "../src/types";
import { makeGame as makeGameH, lockTarget } from "./helpers/engine-fixtures";

// ── Helpers (reset-seam.test.ts patterns; fixtures: tests/helpers/engine-fixtures.ts) ──

const liveGames: string[] = [];
afterEach(() => {
  for (const code of liveGames.splice(0)) removeGame(code);
});

/** makeGame bound to this file's afterEach cleanup (registers the code). */
function makeGame(roles: Role[], settings?: Partial<GameSettings>, lovers?: [number, number]): Game {
  const game = makeGameH(roles, settings, lovers);
  liveGames.push(game.code);
  return game;
}

/**
 * Drive the REAL dawn flow with the mafia night-killing the hunter
 * (join-seat 2). Returns the game right after transitionToDay — with a
 * correct C2a implementation the gate is open and the day transition is
 * deferred; assertions live in the tests.
 */
function nightKillHunter(roles: Role[] = ["mafia", "hunter", "citizen", "citizen", "citizen"]): Game {
  const game = makeGame(roles);
  game.awaitingNarratorReady = false; // narrator confirmed (server-side step)
  expect(lockTarget(game, 1, 2).consensus).toBe(true);
  advanceNightSubPhase(game); // doctor/detective disabled -> resolving
  transitionToDay(game);
  return game;
}

/** Drive the REAL vote flow: day 1, the town lynches the hunter (seat 2). */
function lynchHunter(): Game {
  const game = makeGame(["mafia", "hunter", "citizen", "citizen", "citizen"]);
  game.awaitingNarratorReady = false;
  forceDawn(game);
  expect(callVote(game, 1, 2)).toBe(true);
  castVote(game, 1, true);
  castVote(game, 2, false);
  castVote(game, 3, true);
  castVote(game, 4, true);
  castVote(game, 5, false);
  const result = resolveVote(game);
  expect(result).not.toBeNull();
  expect(result!.executed).toBe(true);
  return game;
}

const AT = { at: "test" };

// ── The sequencing trap + gate-open shapes ──────────────────────────────────

describe("C2a sequencing trap — the gate must survive the caller's reset boundary", () => {
  test("REGRESSION: mafia night-kills the hunter -> after transitionToDay the gate is OPEN and the day transition deferred (a gate set inside notifyDeathTriggers is wiped by resetNightActions and fails this)", () => {
    const game = nightKillHunter();

    // The gate is open with the dawn resume shape (HUNTER-DESIGN §4).
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: false } });
    // The epilogue is deferred: no day, no win check, no narrator epilogue.
    expect(game.phase).toBe("night");
    expect(game.winner).toBeNull();
    // §4 phase invariants while the gate is open.
    expect(game.votes.size).toBe(0);
    expect(game.voteTarget).toBeNull();
    expect(game.players.get(2)!.isAlive).toBe(false);
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("vote path: lynching the hunter holds at 'voting' with the ballot cleared and resume.autoNight true", () => {
    const game = lynchHunter();

    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: true } });
    expect(game.phase).toBe("voting"); // auto-night deferred
    expect(game.round).toBe(1);        // no night entered yet
    expect(game.winner).toBeNull();
    // The caller's reset ran BEFORE the gate opened: ballot already clean.
    expect(game.votes.size).toBe(0);
    expect(game.voteTarget).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── submitHunterRevenge: validation (each rejection = zero state change) ────

describe("C2a submitHunterRevenge — validation rejections", () => {
  test("closed gate: rejected with no state change", () => {
    const game = makeGame(["mafia", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);

    const before = JSON.stringify(dumpGame(game));
    const res = submitHunterRevenge(game, 2, 3);
    expect(res.ok).toBe(false);
    expect(res.deaths).toEqual([]);
    expect(res.messages).toEqual([]);
    expect(JSON.stringify(dumpGame(game))).toBe(before);
  });

  test("wrong hunterId: rejected, gate stays open, no state change", () => {
    const game = nightKillHunter();
    expect(game.pendingRevenge).not.toBeNull();

    const before = JSON.stringify(dumpGame(game));
    expect(submitHunterRevenge(game, 3, 4).ok).toBe(false);
    expect(JSON.stringify(dumpGame(game))).toBe(before);
    expect(game.pendingRevenge!.hunterId).toBe(2);
  });

  test("dead target: rejected, gate stays open, no state change", () => {
    const game = nightKillHunter();
    expect(game.pendingRevenge).not.toBeNull();

    const before = JSON.stringify(dumpGame(game));
    // Seat 2 is the dead hunter — the one guaranteed-dead player.
    expect(submitHunterRevenge(game, 2, 2).ok).toBe(false);
    expect(JSON.stringify(dumpGame(game))).toBe(before);
  });

  test("nonexistent target: rejected, gate stays open, no state change", () => {
    const game = nightKillHunter();
    expect(game.pendingRevenge).not.toBeNull();

    const before = JSON.stringify(dumpGame(game));
    expect(submitHunterRevenge(game, 2, 999).ok).toBe(false);
    expect(JSON.stringify(dumpGame(game))).toBe(before);
  });
});

// ── Decline path ────────────────────────────────────────────────────────────

describe("C2a submitHunterRevenge — decline", () => {
  test("decline at parity: gate cleared, no death, deferred win check RUNS -> mafia wins (the gate defers, never skips, the check)", () => {
    // 1 mafia vs 1 citizen after the hunter's death: parity is on the board
    // but the win check was deferred behind the gate.
    const game = nightKillHunter(["mafia", "hunter", "citizen"]);
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: false } });
    expect(game.winner).toBeNull(); // deferred

    const eventsBefore = game.eventHistory.length;
    const res = submitHunterRevenge(game, 2, null);
    expect(res.ok).toBe(true);
    expect(res.deaths).toEqual([]);

    // Message order: decline line first, then exactly the deferred win line.
    expect(res.messages.length).toBe(2);
    expect(res.messages[0].length).toBeGreaterThan(0);
    expect(res.messages[1].length).toBeGreaterThan(0);

    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    // No death, no death event from a decline.
    expect(game.eventHistory.length).toBe(eventsBefore);
    expect(game.eventHistory.some((e) => e.type === "hunter_revenge")).toBe(false);
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── Revenge kill ────────────────────────────────────────────────────────────

describe("C2a submitHunterRevenge — revenge kill", () => {
  test("kill a citizen: hunter_revenge death + event (cause/source populated), gate cleared, deferred day transition completes", () => {
    const game = nightKillHunter(); // 5p: 1 mafia + 3 citizens left
    expect(game.pendingRevenge).not.toBeNull();

    const res = submitHunterRevenge(game, 2, 4);
    expect(res.ok).toBe(true);
    expect(res.deaths.length).toBe(1);
    expect(res.deaths[0].player.id).toBe(4);
    expect(res.deaths[0].source).toBe("hunter_revenge");
    expect(res.deaths[0].cause).toBe("direct");
    expect(res.deaths[0].eventType).toBe("hunter_revenge");
    expect(res.deaths[0].message).toContain("Player4");

    // Message order: the revenge death line is first; the dawn resume to a
    // plain day appends no epilogue line (same as a normal dawn).
    expect(res.messages.length).toBe(1);
    expect(res.messages[0]).toBe(res.deaths[0].message);

    // eventHistory entry with the additive B3 wire fields.
    expect(game.eventHistory[game.eventHistory.length - 1]).toMatchObject({
      round: 1,
      type: "hunter_revenge",
      playerName: "Player4",
      cause: "direct",
      source: "hunter_revenge",
    });

    expect(game.pendingRevenge).toBeNull();
    expect(game.players.get(4)!.isAlive).toBe(false);
    expect(game.phase).toBe("day"); // 1 mafia vs 2 citizens: game continues
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("revenge kills the LAST mafia: win check runs AFTER the death -> town wins from beyond the grave", () => {
    const game = nightKillHunter(["mafia", "hunter", "citizen", "citizen"]);
    expect(game.pendingRevenge).not.toBeNull();

    const res = submitHunterRevenge(game, 2, 1);
    expect(res.ok).toBe(true);
    expect(res.deaths.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [1, "hunter_revenge", "direct"],
    ]);
    // Order: revenge death line, then the win line the death produced.
    expect(res.messages.length).toBe(2);
    expect(res.messages[0]).toContain("Admin");

    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("town"); // only possible if the check ran post-death
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("vote-path resume: revenge after a lynch re-enters with autoNight -> night falls", () => {
    const game = lynchHunter(); // gate open at voting, resume.autoNight true
    expect(game.pendingRevenge).not.toBeNull();

    const res = submitHunterRevenge(game, 2, 3);
    expect(res.ok).toBe(true);
    expect(res.deaths.length).toBe(1);
    // Order: revenge death line, then beginNight's night-falls line.
    expect(res.messages.length).toBe(2);
    expect(res.messages[0]).toContain("Player3");

    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("night"); // the deferred auto-night completed
    expect(game.round).toBe(2);
    expect(game.nightSubPhase).toBe("mafia");
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── Suppression edges (consume-time) ────────────────────────────────────────

describe("C2a suppression — gate never opens", () => {
  test("E11 no living target: hunter dies with nobody left alive -> no gate, resolution runs straight through to the win check", () => {
    // Engine-level pre-epilogue construction (conclude-round.test.ts
    // pattern): the whole board dies in one resolution, hunter included.
    const game = makeGame(["mafia", "hunter", "citizen"]);
    game.awaitingNarratorReady = false;
    applyDeath(game, 3, "mafia", "kill 3");
    applyDeath(game, 1, "mafia", "kill 1");
    applyDeath(game, 2, "mafia", "kill 2"); // the hunter — trigger fires here
    resetNightActions(game);

    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: false });

    expect(game.pendingRevenge).toBeNull(); // gate never opened
    expect(game.phase).toBe("game_over");   // win check ran directly
    expect(game.winner).toBe("town");       // no mafia left alive
    expect(messages.length).toBe(1);        // exactly the win line
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("E12 house-joker instant win: joker's lover is the hunter -> cascade at phase game_over opens no gate, joker win stands; queue cannot leak into a restart", () => {
    // p1 mafia, p2 joker, p3 hunter (joker's lover), p4/p5 citizens.
    const roles: Role[] = ["mafia", "joker", "hunter", "citizen", "citizen"];
    const game = makeGame(roles, { enableJoker: true, jokerMode: "house" }, [1, 2]);
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(callVote(game, 1, 2)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 4, true);
    castVote(game, 5, true);
    castVote(game, 2, false);
    castVote(game, 3, false);

    const result = resolveVote(game);
    expect(result!.jokerWin).toBe(true);
    expect(result!.killed.map((d) => [d.player.id, d.cause])).toEqual([
      [2, "direct"],
      [3, "lover_cascade"], // the hunter, heartbreak-dead AT game_over
    ]);

    // The instant win was already on the board: no gate, joker win stands.
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("joker");
    expect(assertInvariants(game, AT)).toEqual([]);

    // LEAK PIN: the discarded trigger must not resurface after a restart —
    // a normal round that kills a NON-hunter must not open a bogus gate for
    // the (now alive again) previous game's hunter.
    setFixedDeal({ roles, lovers: [1, 2] });
    let restarted: string[] | null;
    try {
      restarted = restartGame(game);
    } finally {
      setFixedDeal(null);
    }
    expect(restarted).not.toBeNull();
    game.awaitingNarratorReady = false;
    expect(lockTarget(game, 1, 4).consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    transitionToDay(game);
    expect(game.pendingRevenge).toBeNull(); // no stale gate from the old game
    expect(game.phase).toBe("day");
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── Forced-transition clears (HUNTER-DESIGN §6, L2 row) ─────────────────────

describe("C2a forced transitions — gate cleared, no revenge, invariants hold", () => {
  test("force_dawn with the gate open: gate discarded, straight to day, no revenge happened", () => {
    const game = nightKillHunter();
    expect(game.pendingRevenge).not.toBeNull(); // dawn gate open, phase night

    const messages = forceDawn(game);
    expect(messages.length).toBe(1);
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("day");
    expect(game.players.get(2)!.isAlive).toBe(false); // still dead, no shot fired
    expect(game.eventHistory.some((e) => e.type === "hunter_revenge")).toBe(false);
    expect(assertInvariants(game, AT)).toEqual([]);

    // The gate is gone for good: a late submission is rejected.
    expect(submitHunterRevenge(game, 2, 3).ok).toBe(false);
  });

  test("end_day with a (hand-set) gate: belt-and-braces reset-table clear", () => {
    // A gate at 'day' is unreachable in real flow (the §3.6 guard list);
    // the NIGHT_RESETS line still clears it — pinned as belt-and-braces.
    const game = makeGame(["mafia", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);
    game.pendingRevenge = { hunterId: 2, resume: { autoNight: false } };

    endDay(game);
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("night");
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("restart_game with the gate open: gate cleared, fresh night 1, everyone revived", () => {
    const roles: Role[] = ["mafia", "hunter", "citizen", "citizen", "citizen"];
    const game = nightKillHunter(roles);
    expect(game.pendingRevenge).not.toBeNull();

    setFixedDeal({ roles });
    let messages: string[] | null;
    try {
      messages = restartGame(game);
    } finally {
      setFixedDeal(null);
    }
    expect(messages).not.toBeNull();
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("night");
    expect(game.round).toBe(1);
    for (const [, p] of game.players) expect(p.isAlive).toBe(true);
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("return_to_lobby with a (hand-set) gate at game_over: resetGameState clears it", () => {
    // game_over with an open gate is unreachable in real flow (the gate
    // defers win checks; forceEndGame clears before setting game_over) —
    // the whole-game reset still clears it. Belt-and-braces pin.
    const game = makeGame(["mafia", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    expect(lockTarget(game, 1, 3).consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    transitionToDay(game);
    expect(game.phase).toBe("game_over"); // 1 mafia vs 1 town
    game.pendingRevenge = { hunterId: 2, resume: { autoNight: false } };

    expect(returnToLobby(game)).toBe(true);
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("lobby");
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("end_game with the gate open: forceEndGame hand-clears (in-flight state frozen, gate not)", () => {
    const game = nightKillHunter();
    expect(game.pendingRevenge).not.toBeNull();

    forceEndGame(game);
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("game_over");
    expect(game.forceEnded).toBe(true);
    expect(game.winner).toBe("town");
    expect(game.eventHistory.some((e) => e.type === "hunter_revenge")).toBe(false);
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});
