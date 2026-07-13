import { describe, test, expect, afterEach } from "bun:test";

/**
 * B1 (audit P1) — reset-seam tests: reset parity + field-scope coverage.
 *
 * Part 1 — RESET PARITY: after each of the seven audited transitions
 * (transitionToDay, both resolveVote auto-night paths, forceDawn, endDay,
 * returnToLobby, restartGame) every per-night Game field must be back at its
 * createGame value, compared FIELD-BY-FIELD against a fresh createGame()
 * (via dumpGame snapshots). The two deliberate carve-outs are asserted
 * positively:
 *   1. transitionToDay captures lastDoctorTarget = doctorTarget BEFORE the
 *      reset (and forceDawn leaves lastDoctorTarget completely untouched);
 *   2. the official-joker execution preserves jokerHauntVoters through its
 *      auto-night (the haunt night needs them), and keeps them populated
 *      when that same execution ends the game instead.
 *
 * TDD note: written against the PRE-SEAM code first. The drift these tests
 * exposed in the seven hand-rolled lists (each unreachable-with-dirty-state
 * at the server boundary, so unobservable on the wire):
 *   - transitionToDay + both resolveVote auto-nights did not clear
 *     awaitingNarratorReady (forceDawn/endDay did — the L2 fix);
 *   - the normal-execution auto-night did not clear jokerHauntVoters
 *     (always [] there in real flow);
 *   - endDay did not clear voteTarget/votes (always empty in day phase);
 *   - the spared path cleared only vote state, not night-action fields
 *     (always null/empty in voting phase).
 * The seam normalizes all of these to "cleared" via the single night-scope
 * table; the goldens + full suite prove the wire is unchanged.
 *
 * Part 2 — FIELD-SCOPE COVERAGE: every mutable Game key is classified in
 * EXACTLY one reset scope (per-night, whole-game, or the explicit
 * persistent allowlist). The key universe comes from dumpGame(), whose
 * `satisfies Record<keyof Game, unknown>` guard forces new Game fields into
 * it — so a new field that isn't classified fails this test (and the
 * matching `satisfies`-style guard in game-engine.ts fails compilation).
 */

import {
  createGame, addPlayer, updateSettings, startGame, removeGame, setFixedDeal,
  submitMafiaVote, submitDoctorSave, submitDetectiveInvestigation, submitJokerHaunt,
  advanceNightSubPhase, transitionToDay, callVote, castVote, resolveVote, cancelVote,
  forceDawn, endDay, returnToLobby, restartGame,
  resetNightActions, NIGHT_RESET_FIELDS, GAME_RESET_FIELDS, PERSISTENT_GAME_FIELDS,
} from "../src/game-engine";
import { dumpGame } from "../src/debug";
import type { Game, GameSettings, Role } from "../src/types";

// ── The test's OWN field classification (independent of the engine's) ──────
// Deliberately duplicated from the engine's table: moving a field between
// scopes must be a conscious edit in BOTH places.

const NIGHT_KEYS = [
  "mafiaVotes",
  "mafiaTarget",
  "doctorTarget",
  "detectiveTarget",
  "vigilanteTarget",
  "jokerHauntTarget",
  "jokerHauntVoters",
  "nightSubPhase",
  "voteTarget",
  "votes",
  "sleepVote",
  "awaitingNarratorReady",
  // B4a (Hunter pre-plumbing): the revenge gate clears at every forced
  // transition (HUNTER-DESIGN §6 L2 row) — per-night scope covers all of
  // them via resetNightActions; null-pinned until Program C sets it.
  "pendingRevenge",
] as const;

const GAME_KEYS = [
  "phase",
  "round",
  "players",
  "lastDoctorTarget",
  "jokerJointWinner",
  "nightKill",
  "doctorSaved",
  "detectiveResult",
  "winner",
  "forceEnded",
  "pendingMessages",
  "eventHistory",
  "dayStartedAt",
  "dayVoteCount",
  "narratorHistory",
  "detectiveHistory",
  // Player-initiated accusations are DAY-scoped: cleared by beginNight, and in
  // whole-game scope here (lobby resets). They intentionally survive the
  // per-night resetNightActions so a failed vote leaves them standing.
  "accusations",
  "accusationsMade",
  "secondsMade",
  "nextAccusationId",
] as const;

const PERSISTENT_KEYS = [
  "code",
  "adminId",
  "createdAt",
  "settings",
  "mafiaVariant",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

// Games created via makeGame are removed here, not at the end of each test,
// so a failing assertion can't leak registry entries.
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

/** Field-value oracle: a fresh createGame, snapshotted then removed. */
function freshSnapshot(): Record<string, unknown> {
  const fresh = createGame(424242, "FreshOracle");
  const snap = dumpGame(fresh);
  removeGame(fresh.code);
  return snap;
}

function pick(snap: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = snap[k];
  return out;
}

/**
 * Assert every per-night field equals its fresh-createGame value, except the
 * listed overrides (transition-owned values like nightSubPhase="mafia" after
 * a night entry, or the haunt-voter carve-out). Single toEqual so a failure
 * diff shows ALL drifted fields at once.
 */
function expectNightParity(game: Game, overrides: Record<string, unknown> = {}): void {
  const expected = { ...pick(freshSnapshot(), NIGHT_KEYS), ...overrides };
  expect(pick(dumpGame(game), NIGHT_KEYS)).toEqual(expected);
}

/**
 * Dirty per-night fields the transition under test does NOT read, so a list
 * that forgets a field is exposed. Callers pass `skip` for fields the
 * transition consumes (e.g. votes/voteTarget for resolveVote) or overwrites.
 */
function dirtyNightFields(game: Game, skip: string[] = []): void {
  const dirty: Record<(typeof NIGHT_KEYS)[number], () => void> = {
    mafiaVotes: () => game.mafiaVotes.set(999, [{ targetId: 998, voteType: "maybe" }]),
    mafiaTarget: () => { game.mafiaTarget = 998; },
    doctorTarget: () => { game.doctorTarget = 998; },
    detectiveTarget: () => { game.detectiveTarget = 998; },
    vigilanteTarget: () => { game.vigilanteTarget = 998; },
    jokerHauntTarget: () => { game.jokerHauntTarget = 998; },
    jokerHauntVoters: () => { game.jokerHauntVoters = [998]; },
    nightSubPhase: () => { /* transition-owned; never dirtied */ },
    voteTarget: () => { game.voteTarget = 998; },
    votes: () => game.votes.set(999, true),
    sleepVote: () => { game.sleepVote = true; },
    awaitingNarratorReady: () => { game.awaitingNarratorReady = true; },
    pendingRevenge: () => { game.pendingRevenge = { hunterId: 998, resume: { autoNight: false } }; },
  };
  for (const key of NIGHT_KEYS) {
    if (!skip.includes(key)) dirty[key]();
  }
}

// ── Part 1: reset parity across the seven transition paths ─────────────────

describe("P1 reset parity — per-night fields return to createGame values", () => {
  test("transitionToDay: full real night, every per-night field reset; lastDoctorTarget carve-out captured first", () => {
    const game = makeGame(
      ["mafia", "doctor", "detective", "citizen", "citizen"],
      { enableDoctor: true, enableDetective: true },
    );
    // p1 mafia (admin), p2 doctor, p3 detective, p4/p5 citizens.
    expect(lockTarget(game, 1, 5).consensus).toBe(true); // mafiaTarget = 5
    advanceNightSubPhase(game); // -> doctor
    expect(submitDoctorSave(game, 2, 4)).toBe(true);     // doctorTarget = 4
    advanceNightSubPhase(game); // -> detective
    expect(submitDetectiveInvestigation(game, 3, 1)).not.toBeNull();
    advanceNightSubPhase(game); // -> resolving

    // Fields resolveNight does not read; awaitingNarratorReady is genuinely
    // still true here at engine level (startGame set it).
    game.jokerHauntVoters = [998];
    game.voteTarget = 998;
    game.votes.set(999, true);
    expect(game.awaitingNarratorReady).toBe(true);

    const result = transitionToDay(game);
    expect(result.killed.map((k) => k.player.id)).toEqual([5]);
    expect(game.phase).toBe("day"); // 1 mafia vs 3 town: game continues

    expectNightParity(game);
    // Carve-out 1: tonight's save target survives the reset.
    expect(game.lastDoctorTarget).toBe(4);
  });

  test("resolveVote official-joker execution: auto-night preserves haunt voters (carve-out), resets the rest; voters then work and clear at dawn", () => {
    const game = makeGame(
      ["mafia", "joker", "citizen", "citizen", "citizen"],
      { enableJoker: true, jokerMode: "official" },
    );
    game.awaitingNarratorReady = false; // narrator confirmed (server-side step)
    forceDawn(game);
    expect(game.phase).toBe("day");

    expect(callVote(game, 1, 2)).toBe(true); // vote on the joker
    castVote(game, 1, true);
    castVote(game, 3, true);
    castVote(game, 4, true);
    castVote(game, 5, false);
    castVote(game, 2, false);

    dirtyNightFields(game, ["voteTarget", "votes", "sleepVote", "jokerHauntVoters", "awaitingNarratorReady"]);
    game.awaitingNarratorReady = true;

    const result = resolveVote(game);
    expect(result).not.toBeNull();
    expect(result!.jokerWin).toBe(true);
    expect(game.jokerJointWinner).toBe(true);
    expect(game.phase).toBe("night"); // auto-night (1 mafia vs 3 non-joker town)
    expect(game.round).toBe(2);

    // Carve-out 2: the FOR-voters survive into the haunt night.
    expectNightParity(game, { nightSubPhase: "mafia", jokerHauntVoters: [1, 3, 4] });

    // The preserved voters are live data: the dead joker can haunt one.
    expect(submitJokerHaunt(game, 2, 3)).toBe(true);

    // Play night 2 out: the haunt voters clear at the following dawn.
    expect(lockTarget(game, 1, 4).consensus).toBe(true);
    advanceNightSubPhase(game); // doctor/detective disabled -> resolving
    const night2 = transitionToDay(game);
    expect(night2.killed.map((k) => k.player.id).sort()).toEqual([3, 4]);
    expect(game.phase).toBe("game_over"); // 1 mafia vs 1 town: mafia parity
    expect(game.winner).toBe("mafia");
    expectNightParity(game);
  });

  test("resolveVote official-joker execution into game_over: voters stay populated (pinned current behavior)", () => {
    const game = makeGame(
      ["mafia", "joker", "citizen"],
      { enableJoker: true, jokerMode: "official" },
    );
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(callVote(game, 1, 2)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, true);
    castVote(game, 3, true);

    const result = resolveVote(game);
    expect(result!.jokerWin).toBe(true);
    expect(game.phase).toBe("game_over"); // joker dead -> 1 mafia vs 1 town
    expect(game.winner).toBe("mafia");
    expect(game.jokerJointWinner).toBe(true);

    // Pinned: the captured voters are NOT cleared when the same execution
    // ends the game (only a lobby reset clears them from here).
    expect(dumpGame(game).jokerHauntVoters).toEqual([1, 2, 3]);
    // Vote state itself is cleared in every resolveVote outcome.
    expect(game.voteTarget).toBeNull();
    expect(game.votes.size).toBe(0);
  });

  test("resolveVote normal execution: auto-night resets every per-night field (including jokerHauntVoters)", () => {
    const game = makeGame(["mafia", "citizen", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);

    expect(callVote(game, 1, 5)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, true);
    castVote(game, 3, true);
    castVote(game, 4, false);
    castVote(game, 5, false);

    dirtyNightFields(game, ["voteTarget", "votes", "sleepVote"]);

    const result = resolveVote(game);
    expect(result!.executed).toBe(true);
    expect(game.phase).toBe("night"); // 1 mafia vs 3 town: auto-night
    expect(game.round).toBe(2);
    expectNightParity(game, { nightSubPhase: "mafia" });
  });

  test("resolveVote spared: stays in day, per-night fields reset", () => {
    const game = makeGame(["mafia", "citizen", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);

    expect(callVote(game, 1, 5)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, false);
    castVote(game, 3, false);
    castVote(game, 4, false);
    castVote(game, 5, false);

    dirtyNightFields(game, ["voteTarget", "votes", "sleepVote"]);

    const result = resolveVote(game);
    expect(result!.executed).toBe(false);
    expect(game.phase).toBe("day");
    expectNightParity(game);
  });

  test("cancelVote: ballot abort goes through the reset seam — per-night fields back at parity", () => {
    const game = makeGame(["mafia", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(game.phase).toBe("day");

    expect(callVote(game, 1, 4)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, false);
    dirtyNightFields(game, ["voteTarget", "votes", "sleepVote"]);

    expect(cancelVote(game, 1)).toBe(true);
    expect(game.phase).toBe("day");
    expectNightParity(game);
  });

  test("forceDawn: every per-night field reset; lastDoctorTarget left untouched (no capture)", () => {
    const game = makeGame(["mafia", "doctor", "citizen", "citizen"], { enableDoctor: true });
    game.lastDoctorTarget = 3; // simulate a previous night's save
    dirtyNightFields(game, ["awaitingNarratorReady"]);
    expect(game.awaitingNarratorReady).toBe(true); // genuinely true since startGame

    const messages = forceDawn(game);
    expect(messages.length).toBe(1);
    expect(game.phase).toBe("day");
    expectNightParity(game);
    // forceDawn discards the pending doctorTarget WITHOUT capturing it.
    expect(game.lastDoctorTarget).toBe(3);
  });

  test("endDay: every per-night field reset (vote state included)", () => {
    const game = makeGame(["mafia", "citizen", "citizen", "citizen"]);
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(game.phase).toBe("day");

    dirtyNightFields(game);

    const messages = endDay(game);
    expect(messages.length).toBe(1);
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
    expectNightParity(game, { nightSubPhase: "mafia" });
  });

  test("returnToLobby: every resettable field back at its createGame value; persistent fields untouched", () => {
    const game = makeGame(["mafia", "citizen", "citizen"]);
    const createdAt = game.createdAt;
    game.awaitingNarratorReady = false;
    // Real game to game_over: night-1 kill leaves 1 mafia vs 1 town.
    expect(lockTarget(game, 1, 3).consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    transitionToDay(game);
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");

    // Dirty everything resettable that the real game left clean.
    dirtyNightFields(game);
    game.lastDoctorTarget = 2;
    game.jokerJointWinner = true;
    game.nightKill = 7;
    game.doctorSaved = true;
    game.detectiveResult = { targetId: 2, isMafia: false };
    game.dayStartedAt = Date.now();
    game.dayVoteCount = 5;
    game.narratorHistory.push("a narrator line");
    game.detectiveHistory.push({ round: 1, targetName: "x", isMafia: true });
    game.mafiaVariant = 3; // persistent: must survive

    expect(returnToLobby(game)).toBe(true);

    const snap = dumpGame(game);
    const fresh = freshSnapshot();
    expect(pick(snap, NIGHT_KEYS)).toEqual(pick(fresh, NIGHT_KEYS));
    expect(pick(snap, GAME_KEYS.filter((k) => k !== "players")))
      .toEqual(pick(fresh, GAME_KEYS.filter((k) => k !== "players")));
    // Players: membership kept, per-player game state reset.
    expect(game.players.size).toBe(3);
    for (const [, p] of game.players) {
      expect(p.role).toBeNull();
      expect(p.isAlive).toBe(true);
      expect(p.isLover).toBe(false);
      expect(p.loverId).toBeNull();
      expect(p.variant).toBe(0);
    }
    // Persistent: untouched by returnToLobby.
    expect(game.createdAt).toBe(createdAt);
    expect(game.mafiaVariant).toBe(3);
    expect(game.adminId).toBe(1);
  });

  test("restartGame: whole-game reset (haunt voters included) then a fresh night 1; createdAt refreshed", () => {
    const game = makeGame(
      ["mafia", "joker", "citizen"],
      { enableJoker: true, jokerMode: "official" },
    );
    game.awaitingNarratorReady = false;
    forceDawn(game);
    expect(callVote(game, 1, 2)).toBe(true);
    castVote(game, 1, true);
    castVote(game, 2, true);
    castVote(game, 3, true);
    resolveVote(game);
    expect(game.phase).toBe("game_over");
    expect(dumpGame(game).jokerHauntVoters).toEqual([1, 2, 3]); // populated at game_over

    dirtyNightFields(game, ["jokerHauntVoters"]);
    game.lastDoctorTarget = 2;
    game.nightKill = 7;
    game.doctorSaved = true;
    game.detectiveResult = { targetId: 2, isMafia: false };
    game.dayStartedAt = Date.now();
    game.dayVoteCount = 5;
    game.narratorHistory.push("a narrator line");
    game.detectiveHistory.push({ round: 1, targetName: "x", isMafia: true });

    const before = game.createdAt;
    setFixedDeal({ roles: ["mafia", "joker", "citizen"] });
    let messages: string[] | null;
    try {
      messages = restartGame(game);
    } finally {
      setFixedDeal(null);
    }
    expect(messages).not.toBeNull();

    // Fresh night 1 behind the Begin Night gate.
    expect(game.phase).toBe("night");
    expect(game.round).toBe(1);
    expect(game.nightSubPhase).toBe("mafia");
    expect(game.awaitingNarratorReady).toBe(true);
    expect(game.createdAt).toBeGreaterThanOrEqual(before);
    expect(game.pendingMessages).toEqual(messages!);

    // Whole-game fields back at createGame values.
    const snap = dumpGame(game);
    expect(snap.jokerHauntVoters).toEqual([]);
    expect(snap.jokerJointWinner).toBe(false);
    expect(snap.lastDoctorTarget).toBeNull();
    expect(snap.nightKill).toBeNull();
    expect(snap.doctorSaved).toBe(false);
    expect(snap.detectiveResult).toBeNull();
    expect(snap.winner).toBeNull();
    expect(snap.forceEnded).toBe(false);
    expect(snap.eventHistory).toEqual([]);
    expect(snap.dayStartedAt).toBeNull();
    expect(snap.dayVoteCount).toBe(0);
    expect(snap.narratorHistory).toEqual([]);
    expect(snap.detectiveHistory).toEqual([]);
    expect(snap.mafiaVotes).toEqual({});
    expect(snap.mafiaTarget).toBeNull();
    expect(snap.doctorTarget).toBeNull();
    expect(snap.detectiveTarget).toBeNull();
    expect(snap.jokerHauntTarget).toBeNull();
    expect(snap.voteTarget).toBeNull();
    expect(snap.votes).toEqual({});

    // Players re-dealt the fixed deal, everyone revived.
    for (const [, p] of game.players) expect(p.isAlive).toBe(true);
    expect(game.players.get(1)!.role).toBe("mafia");
    expect(game.players.get(2)!.role).toBe("joker");
    expect(game.players.get(3)!.role).toBe("citizen");
  });
});

// ── Part 1b: resetNightActions carve-out, unit level ────────────────────────

describe("P1 resetNightActions — preserveHauntVoters carve-out", () => {
  test("default clears jokerHauntVoters; preserveHauntVoters keeps them and clears everything else", () => {
    const game = makeGame(["mafia", "citizen", "citizen"]);
    dirtyNightFields(game);
    game.jokerHauntVoters = [2, 3];

    resetNightActions(game, { preserveHauntVoters: true });
    expectNightParity(game, { jokerHauntVoters: [2, 3] });

    resetNightActions(game);
    expectNightParity(game);
  });
});

// ── Part 2: field-scope coverage — every mutable Game key in EXACTLY one scope ──

describe("P1 field-scope coverage — every Game field classified exactly once", () => {
  // dumpGame's `satisfies Record<keyof Game, unknown>` guard makes its key set
  // the complete runtime universe of Game fields: a new field that isn't added
  // to dumpGame fails compilation there, and one that isn't classified in the
  // engine's reset tables fails BOTH the engine's compile-time guard and this
  // test. (This is what makes Hunter's pendingRevenge a one-line addition.)
  const allGameKeys = Object.keys(freshSnapshot()).sort();

  test("the three scopes are disjoint and cover every Game key", () => {
    const scopes: Record<string, readonly string[]> = {
      night: NIGHT_RESET_FIELDS,
      game: GAME_RESET_FIELDS,
      persistent: PERSISTENT_GAME_FIELDS,
    };
    const classification: Record<string, string[]> = {};
    for (const [scope, keys] of Object.entries(scopes)) {
      for (const key of keys) {
        (classification[key] ??= []).push(scope);
      }
    }
    // Exactly one scope per key, no phantom keys, full coverage.
    for (const [key, inScopes] of Object.entries(classification)) {
      expect({ key, scopes: inScopes }).toEqual({ key, scopes: [inScopes[0]] });
    }
    expect(Object.keys(classification).sort()).toEqual(allGameKeys);
  });

  test("the engine's classification matches this test's independent copy", () => {
    // Moving a field between scopes must be a deliberate edit HERE too.
    expect([...NIGHT_RESET_FIELDS].sort()).toEqual([...NIGHT_KEYS].sort());
    expect([...GAME_RESET_FIELDS].sort()).toEqual([...GAME_KEYS].sort());
    expect([...PERSISTENT_GAME_FIELDS].sort()).toEqual([...PERSISTENT_KEYS].sort());
  });
});
