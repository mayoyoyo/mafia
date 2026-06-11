import { describe, test, expect, afterEach } from "bun:test";

/**
 * B2 (audit D4) — invariant assertions, engine level (no ports).
 *
 * assertInvariants(game, ctx) is called by server.ts at the two instrumented
 * choke points (handleMessage entry, night-timer fire). These tests exercise
 * the function directly against engine-built Game states:
 *
 *   Part 1 — violations THROW in test mode (bun test sets NODE_ENV=test, so
 *            the default mode here is "throw").
 *   Part 2 — mode mechanism: forced "log" mode emits one slog line and does
 *            NOT throw (the production failure mode); forced "throw" mode
 *            throws; both restored via the setInvariantMode return value.
 *   Part 3 — positive: full legitimate flows (including golden-game-#2's
 *            joker-execute -> haunt-night shape and the pinned
 *            voters-populated-at-game_over case from reset-seam) trigger
 *            ZERO violations — the over-strictness guard.
 *
 * Invariant formulations under test (what the code actually guarantees):
 *   - outside night, every NIGHT_RESETS-classified field is at its
 *     post-reset value, EXCEPT: voteTarget/votes during voting (live
 *     ballot); jokerHauntVoters at game_over ONLY under jokerJointWinner
 *     (the official-joker execution that ends the game keeps them — pinned
 *     in reset-seam.test.ts; narrowed from an unconditional game_over
 *     allowance in B4a); and ALL fields but awaitingNarratorReady and
 *     pendingRevenge when forceEnded (forceEndGame freezes in-flight state
 *     where it stood, clearing only those two by hand).
 *   - winner non-null at game_over (L3).
 *   - pendingRevenge null ALWAYS (B4a pre-plumbing: null-pinned for all of
 *     Program B; Program C relaxes this to the phase-scoped form in
 *     HUNTER-DESIGN §4).
 *   - the TRACKED night-timer slot (caller-provided) empty outside night.
 */

import {
  createGame, addPlayer, updateSettings, startGame, removeGame, setFixedDeal,
  submitMafiaVote, submitJokerHaunt, advanceNightSubPhase, transitionToDay,
  callVote, castVote, resolveVote, forceDawn, forceEndGame, returnToLobby,
  assertInvariants, setInvariantMode, assertPhaseEdge,
} from "../src/game-engine";
import type { Game, GameSettings, Role } from "../src/types";
import { dumpGame } from "../src/debug";

// ── Helpers (reset-seam.test.ts patterns) ───────────────────────────────────

const liveGames: string[] = [];
afterEach(() => {
  for (const code of liveGames.splice(0)) removeGame(code);
});

/** Deal `roles` to players 1..n in join order (player 1 = admin). */
function makeGame(roles: Role[], settings?: Partial<GameSettings>): Game {
  const game = createGame(1, "Admin");
  liveGames.push(game.code);
  for (let i = 2; i <= roles.length; i++) addPlayer(game, i, `Player${i}`);
  if (settings) updateSettings(game, settings);
  setFixedDeal({ roles });
  try {
    const started = startGame(game);
    expect(started).not.toBeNull();
  } finally {
    setFixedDeal(null);
  }
  return game;
}

function lockTarget(game: Game, mafiaId: number, targetId: number) {
  submitMafiaVote(game, mafiaId, targetId, "maybe");
  return submitMafiaVote(game, mafiaId, targetId, "lock");
}

/** Plain mafia game settled in day phase (night fields all clean). */
function gameInDay(): Game {
  const game = makeGame(["mafia", "citizen", "citizen", "citizen", "citizen"]);
  game.awaitingNarratorReady = false; // narrator confirmed (server-side step)
  forceDawn(game);
  expect(game.phase).toBe("day");
  return game;
}

/** Real flow to a natural (non-forced) game_over: night-1 kill -> mafia parity. */
function gameAtNaturalGameOver(): Game {
  const game = makeGame(["mafia", "citizen", "citizen"]);
  game.awaitingNarratorReady = false;
  expect(lockTarget(game, 1, 3).consensus).toBe(true);
  advanceNightSubPhase(game); // -> resolving
  transitionToDay(game);
  expect(game.phase).toBe("game_over");
  expect(game.winner).toBe("mafia");
  return game;
}

const AT = { at: "test" };

// ── Part 1: violations throw in test mode (default under bun test) ─────────

describe("D4 assertInvariants — violations throw in test mode", () => {
  test("night-action field dirty in day phase", () => {
    const game = gameInDay();
    game.mafiaTarget = 3;
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:mafiaTarget/);
  });

  test("awaitingNarratorReady true outside night (L2 class)", () => {
    const game = gameInDay();
    game.awaitingNarratorReady = true;
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:awaitingNarratorReady/);
  });

  test("jokerHauntVoters populated in day phase (H1 class)", () => {
    const game = gameInDay();
    game.jokerHauntVoters = [2];
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:jokerHauntVoters/);
  });

  test("night-action field dirty during voting (ballot fields are allowed, others are not)", () => {
    const game = gameInDay();
    expect(callVote(game, 1, 5)).toBe(true);
    castVote(game, 1, true);
    expect(game.phase).toBe("voting");
    game.mafiaVotes.set(999, [{ targetId: 998, voteType: "maybe" }]);
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:mafiaVotes/);
  });

  test("votes/voteTarget populated at natural game_over (L9 class)", () => {
    const game = gameAtNaturalGameOver();
    game.voteTarget = 2;
    game.votes.set(2, true);
    expect(() => assertInvariants(game, AT)).toThrow(
      /night_scope_dirty:voteTarget.*night_scope_dirty:votes|night_scope_dirty:votes.*night_scope_dirty:voteTarget/,
    );
  });

  test("winner null at game_over (L3 class)", () => {
    const game = gameAtNaturalGameOver();
    game.winner = null;
    expect(() => assertInvariants(game, AT)).toThrow(/winner_null_at_game_over/);
  });

  test("pendingRevenge non-null DURING night (B4a: null-pinned in Program B, even where night-scope checks are skipped)", () => {
    const game = makeGame(["mafia", "citizen", "citizen"]);
    expect(game.phase).toBe("night");
    game.pendingRevenge = { hunterId: 2, resume: { autoNight: false } };
    expect(() => assertInvariants(game, AT)).toThrow(/pending_revenge_nonnull/);
  });

  test("pendingRevenge non-null in day phase (caught by BOTH the explicit pin and the night-scope table)", () => {
    const game = gameInDay();
    game.pendingRevenge = { hunterId: 2, resume: { autoNight: true, preserveHauntVoters: true } };
    expect(() => assertInvariants(game, AT)).toThrow(/pending_revenge_nonnull/);
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:pendingRevenge/);
  });

  test("jokerHauntVoters populated at a NON-joker game_over (B4a narrowing: the allowance requires jokerJointWinner)", () => {
    const game = gameAtNaturalGameOver();
    expect(game.jokerJointWinner).toBe(false);
    game.jokerHauntVoters = [2];
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:jokerHauntVoters/);
  });

  test("tracked night timer pending outside night (M2 class)", () => {
    const game = gameInDay();
    expect(() => assertInvariants(game, { at: "test", hasPendingNightTimer: true }))
      .toThrow(/pending_night_timer_outside_night:day/);
  });

  test("tracked night timer pending DURING night is legal", () => {
    const game = makeGame(["mafia", "citizen", "citizen"]);
    expect(game.phase).toBe("night");
    expect(assertInvariants(game, { at: "test", hasPendingNightTimer: true })).toEqual([]);
  });
});

// ── Part 2: mode mechanism — log-don't-throw in production mode ────────────

describe("D4 assertInvariants — mode mechanism", () => {
  test("forced 'log' mode: violation does not throw, returns it, and slogs one invariant_violation line", () => {
    const game = gameInDay();
    game.mafiaTarget = 3;

    const lines: string[] = [];
    const realLog = console.log;
    const prevMode = setInvariantMode("log");
    try {
      console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
      const violations = assertInvariants(game, { at: "prod-sim" });
      expect(violations).toEqual(["night_scope_dirty:mafiaTarget"]);
    } finally {
      console.log = realLog;
      setInvariantMode(prevMode);
    }

    const events = lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e && e.slog === "invariant_violation");
    expect(events.length).toBe(1);
    expect(events[0].code).toBe(game.code);
    expect(events[0].at).toBe("prod-sim");
    expect(events[0].violations).toEqual(["night_scope_dirty:mafiaTarget"]);
  });

  test("forced 'throw' mode throws; default mode under bun test is already 'throw' (NODE_ENV=test)", () => {
    const game = gameInDay();
    game.mafiaTarget = 3;

    // Default (untouched) mode: bun test sets NODE_ENV=test -> throw.
    expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:mafiaTarget/);

    // Explicitly forced throw mode behaves the same.
    const prevMode = setInvariantMode("throw");
    try {
      expect(prevMode).toBe("throw"); // confirms the bun-test default
      expect(() => assertInvariants(game, AT)).toThrow(/night_scope_dirty:mafiaTarget/);
    } finally {
      setInvariantMode(prevMode);
    }
  });
});

// ── Part 3: positive — legitimate flows produce ZERO violations ────────────

describe("D4 assertInvariants — legitimate flows are violation-free", () => {
  test("full official-joker game (golden #2 shape): start -> night -> day -> vote -> haunt night -> game_over -> lobby", () => {
    // p1 mafia, p2 joker, p3-p5 citizens.
    const game = createGame(1, "Admin");
    liveGames.push(game.code);
    for (let i = 2; i <= 5; i++) addPlayer(game, i, `Player${i}`);
    updateSettings(game, { enableJoker: true, jokerMode: "official" });
    expect(assertInvariants(game, { at: "lobby", hasPendingNightTimer: false })).toEqual([]);

    setFixedDeal({ roles: ["mafia", "joker", "citizen", "citizen", "citizen"] });
    try {
      expect(startGame(game)).not.toBeNull();
    } finally {
      setFixedDeal(null);
    }
    expect(assertInvariants(game, { at: "night1_gate", hasPendingNightTimer: false })).toEqual([]);

    // Night 1: mafia kills p4.
    game.awaitingNarratorReady = false; // narrator confirmed (server-side step)
    expect(lockTarget(game, 1, 4).consensus).toBe(true);
    expect(assertInvariants(game, { at: "night1_locked", hasPendingNightTimer: true })).toEqual([]);
    advanceNightSubPhase(game); // doctor/detective disabled -> resolving
    transitionToDay(game);
    expect(game.phase).toBe("day"); // 1 mafia vs 2 town + joker: continues
    expect(assertInvariants(game, { at: "day1", hasPendingNightTimer: false })).toEqual([]);

    // Day 1: vote out the joker (official mode -> joint winner + haunt night).
    expect(callVote(game, 1, 2)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 3, true);
    expect(assertInvariants(game, { at: "voting_midballot", hasPendingNightTimer: false })).toEqual([]);
    castVote(game, 5, true);
    castVote(game, 2, false);
    const voteResult = resolveVote(game);
    expect(voteResult!.jokerWin).toBe(true);
    expect(game.phase).toBe("night"); // auto haunt night (1 mafia vs 2 town)
    expect(game.jokerHauntVoters).toEqual([1, 3, 5]); // preserved FOR-voters
    expect(assertInvariants(game, { at: "haunt_night", hasPendingNightTimer: false })).toEqual([]);

    // Haunt night: dead joker haunts a yes-voter, mafia kills the other.
    expect(submitJokerHaunt(game, 2, 3)).toBe(true);
    expect(assertInvariants(game, { at: "haunt_picked", hasPendingNightTimer: true })).toEqual([]);
    expect(lockTarget(game, 1, 5).consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    const night2 = transitionToDay(game);
    expect(night2.killed.map((k) => k.player.id).sort()).toEqual([3, 5]);
    expect(game.phase).toBe("game_over"); // mafia alone
    expect(game.winner).toBe("mafia");
    expect(assertInvariants(game, { at: "game_over", hasPendingNightTimer: false })).toEqual([]);

    expect(returnToLobby(game)).toBe(true);
    expect(assertInvariants(game, { at: "lobby_again", hasPendingNightTimer: false })).toEqual([]);
  });

  test("pinned carve-out: official-joker execution ending the game keeps jokerHauntVoters at game_over — no violation", () => {
    const game = makeGame(["mafia", "joker", "citizen"], { enableJoker: true, jokerMode: "official" });
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(callVote(game, 1, 2)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, true);
    castVote(game, 3, true);
    const result = resolveVote(game);
    expect(result!.jokerWin).toBe(true);
    expect(game.phase).toBe("game_over"); // joker dead -> 1 mafia vs 1 town
    expect(game.jokerHauntVoters).toEqual([1, 2, 3]); // pinned: NOT cleared here

    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("force-ended carve-out: end_game mid-night freezes in-flight night state — no violation", () => {
    const game = makeGame(["mafia", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    expect(lockTarget(game, 1, 3).consensus).toBe(true); // in-flight mafiaVotes/mafiaTarget
    expect(game.nightSubPhase).toBe("mafia");

    forceEndGame(game);
    expect(game.phase).toBe("game_over");
    expect(game.forceEnded).toBe(true);
    expect(game.mafiaTarget).toBe(3); // frozen, not reset

    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("non-perturbation: assertInvariants leaves the live game byte-identical (shield-copy tripwire)", () => {
    // Guards the nightRestingSnapshot shield (game-engine.ts): any in-place
    // reset fn missing a fresh-copy line there would mutate the LIVE game
    // through the shallow spread — here, scrubbing the populated ballot.
    // A voting-phase game with a real callVote/castVote ballot is the
    // sensitive case: votes is one of the Maps reset via .clear().
    const game = gameInDay();
    expect(callVote(game, 1, 5)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, false);
    castVote(game, 3, true);
    expect(game.phase).toBe("voting");
    expect(game.votes.size).toBe(3);

    const before = JSON.stringify(dumpGame(game));
    expect(assertInvariants(game, { at: "non-perturbation", hasPendingNightTimer: false })).toEqual([]);
    const after = JSON.stringify(dumpGame(game));
    expect(after).toBe(before);
  });

  test("force-ended carve-out: end_game mid-voting freezes the live ballot — no violation", () => {
    const game = gameInDay();
    expect(callVote(game, 1, 5)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, false);

    forceEndGame(game);
    expect(game.phase).toBe("game_over");
    expect(game.voteTarget).toBe(5); // frozen, not reset
    expect(game.votes.size).toBe(2);

    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── Part 4: B4b (audit D1) — phase-edge assertion for phase_change builds ──
//
// assertPhaseEdge(game, from, to) backs the server's single phase_change
// assembly point (broadcastPhaseChange in src/server.ts). The legal-edge
// table documents what the 12 broadcast sites actually do TODAY — including
// the odd-but-real edges (day→day on abstain, voting→day on a spared vote,
// any→night via restart_game, lobby→game_over via an unguarded end_game).
// Same mode mechanism as assertInvariants: throw under bun test, one
// slog("invariant_violation") line in production.

describe("D1 assertPhaseEdge — legal-edge table for phase_change broadcasts", () => {
  // Every edge a phase_change broadcast site can produce today. NB: "voting"
  // and "lobby" are never broadcast as a phase_change `to` (voting enters via
  // vote_called, lobby via lobby_update), so they appear only as `from`s.
  const LEGAL: Array<[Game["phase"], Game["phase"]]> = [
    ["lobby", "night"],       // start_game; restart_game from lobby
    ["lobby", "game_over"],   // end_game (no lobby guard — odd-but-real)
    ["night", "day"],         // force_dawn; night resolution
    ["night", "night"],       // restart_game mid-night (M2's enabler)
    ["night", "game_over"],   // night resolution win; admin leave; end_game
    ["day", "day"],           // abstain_vote (self-edge)
    ["day", "night"],         // end_day; restart_game from day
    ["day", "game_over"],     // admin leave; end_game
    ["voting", "day"],        // cancel_vote; spared vote
    ["voting", "night"],      // execution auto-night; restart_game
    ["voting", "game_over"],  // vote-resolved win; admin leave; end_game
    ["game_over", "night"],   // restart_game
  ];

  const ALL_PHASES: Game["phase"][] = ["lobby", "night", "day", "voting", "game_over"];

  test("every documented legal edge passes silently (test mode would throw)", () => {
    const game = gameInDay();
    for (const [from, to] of LEGAL) {
      expect(() => assertPhaseEdge(game, from, to)).not.toThrow();
    }
  });

  test("every undocumented edge throws in test mode (default under bun test)", () => {
    const game = gameInDay();
    const legalSet = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));
    for (const from of ALL_PHASES) {
      for (const to of ALL_PHASES) {
        if (legalSet.has(`${from}->${to}`)) continue;
        expect(() => assertPhaseEdge(game, from, to))
          .toThrow(new RegExp(`illegal_phase_edge:${from}->${to}`));
      }
    }
  });

  test("forced 'log' mode: illegal edge does not throw and slogs one invariant_violation line", () => {
    const game = gameInDay();

    const lines: string[] = [];
    const realLog = console.log;
    const prevMode = setInvariantMode("log");
    try {
      console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
      expect(() => assertPhaseEdge(game, "game_over", "day")).not.toThrow();
    } finally {
      console.log = realLog;
      setInvariantMode(prevMode);
    }

    const events = lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e && e.slog === "invariant_violation");
    expect(events.length).toBe(1);
    expect(events[0].code).toBe(game.code);
    expect(events[0].at).toBe("phase_change_broadcast");
    expect(events[0].violations).toEqual(["illegal_phase_edge:game_over->day"]);
  });
});
