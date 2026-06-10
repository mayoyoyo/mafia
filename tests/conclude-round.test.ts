import { describe, test, expect, afterEach } from "bun:test";

/**
 * B4a (audit P5) — concludeRound: the SINGLE win-check/auto-transition
 * epilogue, plus the Hunter revenge gate (null-pinned pre-plumbing).
 *
 * What is pinned here:
 *   Part 1 — the gate: a non-null pendingRevenge defers BOTH the win check
 *            and the transition (concludeRound is a byte-level no-op), and
 *            clearing the gate + re-calling with the stored resume options
 *            produces exactly the deferred outcome — this IS Program C's
 *            submitHunterRevenge resume path, exercised before C exists.
 *            pendingRevenge is set BY HAND in these tests: production code
 *            never sets it anywhere in Program B (the invariants pin that).
 *   Part 2 — the three former epilogue shapes (transitionToDay's tail,
 *            resolveVote's official-joker tail, resolveVote's normal tail)
 *            expressed as concludeRound option sets: day-with-winner,
 *            auto-night (with and without the preserveHauntVoters
 *            carve-out), game_over precedence over autoNight, spared-day.
 *   Part 3 — single-call-site: checkWinCondition is called from exactly ONE
 *            place in src/ (inside concludeRound). The goldens + full suite
 *            prove the wire is unchanged; this pins the structure.
 */

import {
  createGame, addPlayer, updateSettings, startGame, removeGame, setFixedDeal,
  submitMafiaVote, advanceNightSubPhase, transitionToDay, callVote, castVote,
  resolveVote, forceDawn, resetNightActions, concludeRound, applyDeath,
} from "../src/game-engine";
import { dumpGame } from "../src/debug";
import type { Game, GameSettings, Role } from "../src/types";

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

/**
 * A game paused at the exact pre-epilogue point of a dawn resolution:
 * phase=night, deaths applied, per-night reset done — everything the real
 * transitionToDay does before its (former) win-check tail.
 */
function dawnPreEpilogue(roles: Role[], killIds: number[]): Game {
  const game = makeGame(roles);
  game.awaitingNarratorReady = false;
  for (const id of killIds) applyDeath(game, id, "mafia", `night kill ${id}`);
  resetNightActions(game);
  expect(game.phase).toBe("night");
  return game;
}

/**
 * A game paused at the exact pre-epilogue point of a vote resolution:
 * phase=voting, execution applied, vote+night state reset — everything the
 * real resolveVote does before its (former) win-check tail.
 */
function votePreEpilogue(roles: Role[], executeId: number | null): Game {
  const game = makeGame(roles);
  game.awaitingNarratorReady = false;
  forceDawn(game);
  expect(callVote(game, 1, executeId ?? 2)).toBe(true);
  if (executeId !== null) applyDeath(game, executeId, "execution", `executed ${executeId}`);
  resetNightActions(game);
  expect(game.phase).toBe("voting");
  return game;
}

// ── Part 1: the Hunter gate (null-pinned in Program B) ─────────────────────

describe("B4a concludeRound — pendingRevenge gate defers, resume completes", () => {
  test("open gate: concludeRound is a no-op even with a winner on the board (dumpGame byte-identical)", () => {
    // 1 mafia vs 1 citizen after the night kill: mafia parity is ALREADY on
    // the board, but the gate must defer the win check (HUNTER-DESIGN §4).
    const game = dawnPreEpilogue(["mafia", "citizen", "citizen"], [3]);
    game.pendingRevenge = { hunterId: 3, resume: { autoNight: false } };

    const messages: string[] = [];
    const before = JSON.stringify(dumpGame(game));
    concludeRound(game, messages, { autoNight: false });
    expect(JSON.stringify(dumpGame(game))).toBe(before);

    expect(game.phase).toBe("night"); // transition deferred
    expect(game.winner).toBeNull();   // win check deferred
    expect(messages).toEqual([]);     // no narrator line emitted
  });

  test("clear gate + re-call with the stored resume = the deferred outcome (C's decline path, shape-checked early)", () => {
    const game = dawnPreEpilogue(["mafia", "citizen", "citizen"], [3]);
    game.pendingRevenge = { hunterId: 3, resume: { autoNight: false } };
    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: false });
    expect(game.phase).toBe("night");

    // Program C's submitHunterRevenge(null): clear the gate, re-enter with
    // the stored resume options — same path, one branch (audit §P5).
    const resume = game.pendingRevenge!.resume;
    game.pendingRevenge = null;
    concludeRound(game, messages, resume);

    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(messages.length).toBe(1); // exactly the win line
  });

  test("open gate defers the auto-night transition too (vote shape)", () => {
    const game = votePreEpilogue(["mafia", "citizen", "citizen", "citizen", "citizen"], 5);
    game.pendingRevenge = { hunterId: 5, resume: { autoNight: true } };

    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: true });
    expect(game.phase).toBe("voting"); // no night entered
    expect(game.round).toBe(1);        // no round bump
    expect(messages).toEqual([]);

    game.pendingRevenge = null;
    concludeRound(game, messages, { autoNight: true });
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
    expect(game.nightSubPhase).toBe("mafia");
    expect(messages.length).toBe(1); // the night-falls line
  });
});

// ── Part 2: the three former epilogue shapes, one function ─────────────────

describe("B4a concludeRound — epilogue shapes (formerly triplicated tails)", () => {
  test("dawn shape, no winner: -> day, no narrator line (transitionToDay tail)", () => {
    const game = dawnPreEpilogue(["mafia", "citizen", "citizen", "citizen", "citizen"], [5]);
    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: false });
    expect(game.phase).toBe("day");
    expect(game.winner).toBeNull();
    expect(messages).toEqual([]);
  });

  test("dawn shape, mafia parity: -> game_over + exactly one win line", () => {
    const game = dawnPreEpilogue(["mafia", "citizen", "citizen"], [3]);
    const messages: string[] = ["the kill line"];
    concludeRound(game, messages, { autoNight: false });
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(messages.length).toBe(2); // appended, not replaced
  });

  test("vote shape, executed the last mafia: -> game_over town + one win line (win beats autoNight)", () => {
    const game = votePreEpilogue(["mafia", "citizen", "citizen", "citizen"], 1);
    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: true });
    expect(game.phase).toBe("game_over"); // NOT night: win check runs first
    expect(game.winner).toBe("town");
    expect(messages.length).toBe(1);
  });

  test("vote shape, executed a citizen: -> auto-night with full per-night reset", () => {
    const game = votePreEpilogue(["mafia", "citizen", "citizen", "citizen", "citizen"], 5);
    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: true });
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
    expect(game.nightSubPhase).toBe("mafia");
    expect(game.jokerHauntVoters).toEqual([]); // default reset clears them
    expect(messages.length).toBe(1);
  });

  test("vote shape, official-joker carve-out: preserveHauntVoters survives the auto-night", () => {
    const game = votePreEpilogue(
      ["mafia", "joker", "citizen", "citizen", "citizen"],
      2,
    );
    game.jokerHauntVoters = [1, 3, 4]; // as captured by the official branch
    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: true, preserveHauntVoters: true });
    expect(game.phase).toBe("night");
    expect(game.jokerHauntVoters).toEqual([1, 3, 4]); // carve-out forwarded to beginNight
    expect(messages.length).toBe(1);
  });

  test("vote shape, spared: -> day, no narrator line (resolveVote spared tail)", () => {
    const game = votePreEpilogue(["mafia", "citizen", "citizen", "citizen"], null);
    const messages: string[] = [];
    concludeRound(game, messages, { autoNight: false });
    expect(game.phase).toBe("day");
    expect(game.winner).toBeNull();
    expect(messages).toEqual([]);
  });
});

// ── Part 2b: the real flows still route through the one epilogue ───────────

describe("B4a — production flows produce the same end states (single epilogue)", () => {
  test("transitionToDay still ends games at dawn (mafia parity)", () => {
    const game = makeGame(["mafia", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    submitMafiaVote(game, 1, 3, "maybe");
    expect(submitMafiaVote(game, 1, 3, "lock").consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    transitionToDay(game);
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(game.pendingMessages.length).toBeGreaterThan(0);
  });

  test("resolveVote executed-citizen still auto-transitions to night", () => {
    const game = makeGame(["mafia", "citizen", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(callVote(game, 1, 5)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, true);
    castVote(game, 3, true);
    castVote(game, 4, false);
    castVote(game, 5, false);
    const result = resolveVote(game);
    expect(result!.executed).toBe(true);
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
  });
});

// ── Part 3: checkWinCondition has exactly ONE call site in src/ ────────────

describe("B4a — checkWinCondition single call site (structural pin)", () => {
  test("the only src/ call site is inside concludeRound", async () => {
    const engine = await Bun.file(new URL("../src/game-engine.ts", import.meta.url)).text();
    const server = await Bun.file(new URL("../src/server.ts", import.meta.url)).text();

    // Every mention in game-engine.ts: the export, the definition, and the
    // single call inside concludeRound.
    const calls = engine.match(/checkWinCondition\(/g) ?? [];
    const definitions = engine.match(/function checkWinCondition\(/g) ?? [];
    expect(definitions.length).toBe(1);
    expect(calls.length - definitions.length).toBe(1); // exactly one call site

    expect(server.includes("checkWinCondition")).toBe(false);
  });
});
