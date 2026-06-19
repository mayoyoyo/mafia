// Shared engine-level fixtures for the Hunter revenge-flow suites
// (tests/hunter-engine.test.ts, tests/hunter-edge-matrix.test.ts).
//
// Both files carried drifted copies of makeGame / lockTarget, and the edge
// matrix added runNight / runVote. C8a extracts the UNION here so the
// upcoming C8 edge-matrix completion doesn't fork a 3rd copy. These drive
// the REAL engine flows (fixed-deal seam, night consensus + sub-phase
// advance, callVote/castVote/resolveVote) — no hand-built state.
//
// Reconciliations (all provably non-behavioral for the importing tests):
//   - makeGame: the edge-matrix copy set game.awaitingNarratorReady = false
//     INSIDE the fixture; the engine copy left it to each call site. Every
//     makeGame call in hunter-engine.test.ts already sets it false on the
//     immediately following line, so doing it inside the shared fixture is a
//     no-op for those bodies (the field is never read between the two) — the
//     call-site assignments stay in the test bodies, now harmlessly
//     idempotent.
//   - lockTarget: byte-identical across both copies.
//   - runVote: gains an optional `abstain` parameter (session-1 note —
//     "runVote needs an abstention shape"). Abstention in this engine is
//     simply NOT casting: resolveVote tallies only game.votes, so a seat
//     that never calls castVote is excluded from votesFor/votesAgainst.
//     With abstain defaulting to [] the behavior is identical to the old
//     all-alive-cast form, so this is a pure superset.
//
// NOT extracted (file-local driver helpers built on these primitives, tied
// to each file's own scenarios): hunter-engine.test.ts's nightKillHunter /
// lynchHunter. The other engine suites (conclude-round, invariants,
// reset-seam, game-engine, projections, ten-player-regression, …) keep
// their own makeGame/lockTarget variants and do NOT import this file (their
// signatures differ — out of scope by design).

import { expect } from "bun:test";
import {
  createGame, addPlayer, updateSettings, startGame, setFixedDeal,
  submitMafiaVote, advanceNightSubPhase, transitionToDay,
  callVote, castVote, resolveVote,
} from "../../src/game-engine";
import type { NightResult, VoteResult } from "../../src/game-engine";
import type { Game, GameSettings, Role } from "../../src/types";

/**
 * Deal `roles` to players 1..n in join order (player 1 = admin), apply
 * `settings`, pin the lover pair via join-order indices (assignFixedRoles),
 * start the game, and clear awaitingNarratorReady (the server-side narrator
 * confirmation step). Returns the started game.
 *
 * Caller is responsible for removeGame cleanup (the importing files track
 * live game codes in an afterEach).
 */
export function makeGame(roles: Role[], settings?: Partial<GameSettings>, lovers?: [number, number]): Game {
  const game = createGame(1, "Admin");
  for (let i = 2; i <= roles.length; i++) addPlayer(game, i, `Player${i}`);
  if (settings) updateSettings(game, settings);
  setFixedDeal({ roles, ...(lovers ? { lovers } : {}) });
  try {
    const started = startGame(game);
    expect(started).not.toBeNull();
  } finally {
    setFixedDeal(null);
  }
  game.awaitingNarratorReady = false; // narrator confirmed (server-side step)
  return game;
}

/** Mafia `mafiaId` votes maybe then lock on `targetId`; returns the lock result. */
export function lockTarget(game: Game, mafiaId: number, targetId: number) {
  submitMafiaVote(game, mafiaId, targetId, "maybe");
  return submitMafiaVote(game, mafiaId, targetId, "lock");
}

/**
 * Drive the REAL dawn flow for a doctor/detective-disabled night: mafia
 * (seat 1) night-kills `targetId`, sub-phase advances to resolving, dawn.
 */
export function runNight(game: Game, targetId: number): NightResult {
  expect(lockTarget(game, 1, targetId).consensus).toBe(true);
  advanceNightSubPhase(game); // doctor/detective disabled -> resolving
  return transitionToDay(game);
}

/**
 * Drive a REAL day ballot: admin (seat 1) calls the vote, `yes` seats vote
 * FOR, the rest vote AGAINST — EXCEPT any seat listed in `abstain`, which
 * casts no ballot at all (resolveVote tallies only votes that were cast, so
 * abstainers are excluded from both tallies). `abstain` defaults to [],
 * giving the original all-alive-cast behavior.
 */
export function runVote(game: Game, targetId: number, yes: number[], abstain: number[] = []): VoteResult {
  expect(callVote(game, 1, targetId)).toBe(true);
  for (const [id, p] of game.players) {
    if (p.isAlive && !abstain.includes(id)) castVote(game, id, yes.includes(id));
  }
  const result = resolveVote(game);
  expect(result).not.toBeNull();
  return result!;
}
