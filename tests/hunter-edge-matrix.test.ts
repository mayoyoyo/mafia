import { describe, test, expect, afterEach } from "bun:test";

/**
 * C2b (HUNTER-DESIGN §9) — the ENGINE half of the edge-test matrix:
 * E1 (haunt-killed Hunter), E2 (Hunter-as-lover heartbreak), E3 (revenge
 * into a lover), E4 (heartbreak during the vote, incl. the official-joker
 * variant — the resume payload's reason to exist), E5 (the §7 win table),
 * E7 (Doctor cannot block). The WS halves of E1/E2/E4 are task C3.
 *
 * Deliberately NOT here (already pinned in tests/hunter-engine.test.ts,
 * C2a): the sequencing-trap regression, validation rejections, the decline
 * path incl. decline-at-parity (§7 last row), revenge-kills-the-last-mafia
 * (§7 row 1 == E5b), suppression edges E11/E12, forced-transition clears.
 *
 * Narrator coupling is LOOSE (C6 rewords): assertions pin message
 * POSITION/COUNT, Death cause/source keys, event types, and name
 * inclusion — never prose.
 *
 * Scenario forcing: the fixed-deal seam deals roles in JOIN ORDER and pins
 * the lover pair via join-order indices (assignFixedRoles), so every case
 * here is reached through REAL engine flows (night consensus, sub-phase
 * advance, callVote/castVote/resolveVote) — no hand-built state.
 */

import {
  removeGame, setDeathTriggerSpy, advanceNightSubPhase, transitionToDay,
  forceDawn, submitHunterRevenge, submitDoctorSave, submitJokerHaunt,
  assertInvariants, projectGameOver,
} from "../src/game-engine";
import type { NightResult } from "../src/game-engine";
import type { Game, GameSettings, Role } from "../src/types";
import { makeGame as makeGameH, lockTarget, runNight, runVote } from "./helpers/engine-fixtures";

// ── Helpers (fixtures: tests/helpers/engine-fixtures.ts) ─────────────────────

const liveGames: string[] = [];
afterEach(() => {
  for (const code of liveGames.splice(0)) removeGame(code);
  setDeathTriggerSpy(null); // belt-and-braces: E2 also clears via finally
});

/** makeGame bound to this file's afterEach cleanup (registers the code). */
function makeGame(roles: Role[], settings?: Partial<GameSettings>, lovers?: [number, number]): Game {
  const game = makeGameH(roles, settings, lovers);
  liveGames.push(game.code);
  return game;
}

const AT = { at: "test" };

// ── E1 — Haunt-killed Hunter (engine half) ──────────────────────────────────

describe("E1 — official-joker haunt kills the Hunter", () => {
  test("gate opens at the dawn AFTER death processing; revenge resolves; concludeRound then transitions to day with the win check run post-revenge", () => {
    // 8p so the game continues past the revenge: 1 mafia, joker, hunter,
    // 5 citizens.
    const game = makeGame(
      ["mafia", "joker", "hunter", "citizen", "citizen", "citizen", "citizen", "citizen"],
      { enableJoker: true, jokerMode: "official" },
    );

    // Night 1: plain mafia kill, then day.
    runNight(game, 8);
    expect(game.phase).toBe("day");

    // Day 1: the town lynches the joker; the HUNTER votes FOR (seat 3),
    // entering jokerHauntVoters.
    const vote = runVote(game, 2, [1, 3, 4, 5]);
    expect(vote.executed).toBe(true);
    expect(vote.jokerWin).toBe(true);
    // Membership + size, not insertion order: no consumer is order-sensitive.
    expect([...game.jokerHauntVoters].sort((a, b) => a - b)).toEqual([1, 3, 4, 5]);
    // No Hunter died: no gate; the haunt night begins normally.
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);

    // Haunt night: the dead joker haunts the Hunter; mafia kills a citizen.
    expect(submitJokerHaunt(game, 2, 3)).toBe(true);
    expect(lockTarget(game, 1, 7).consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    const dawn = transitionToDay(game);

    // Death processing COMPLETED inside this resolution (both kills in the
    // result, hunter's haunt death bookkept)...
    expect(dawn.killed.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [7, "mafia", "direct"],
      [3, "joker_haunt", "direct"],
    ]);
    expect(game.players.get(3)!.isAlive).toBe(false);
    expect(game.eventHistory[game.eventHistory.length - 1]).toMatchObject({
      round: 2, type: "joker_haunt", playerName: "Player3",
      cause: "direct", source: "joker_haunt",
    });
    // ...and THEN the gate opened, deferring the day transition + win check.
    expect(game.pendingRevenge).toEqual({ hunterId: 3, resume: { autoNight: false } });
    expect(game.phase).toBe("night");
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);

    // Revenge resolves; concludeRound completes the deferred dawn. Reaching
    // "day" is only possible AFTER concludeRound's win check evaluated the
    // post-revenge board (1 mafia vs 2 citizens -> no winner).
    const res = submitHunterRevenge(game, 3, 4);
    expect(res.ok).toBe(true);
    expect(res.deaths.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [4, "hunter_revenge", "direct"],
    ]);
    expect(res.messages.length).toBe(1); // revenge line only — plain day appends nothing
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("day");
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── E2 — Hunter-as-lover, heartbreak direction (engine half) ────────────────

describe("E2 — mafia kills the Hunter's lover; the cascade kills the Hunter", () => {
  test("trigger fires for the CASCADE death (B3 bypass-fix payoff); both deaths recorded, then the gate; revenge works", () => {
    // Hunter (seat 2) paired with citizen X (seat 3) via the fixed deal
    // (join-order indices 1 and 2).
    const game = makeGame(
      ["mafia", "hunter", "citizen", "citizen", "citizen", "citizen"],
      undefined,
      [1, 2],
    );

    // Observe the death-trigger hook itself: on pre-P2 code the lover
    // cascade bypassed applyDeath, so the hook NEVER saw the Hunter's
    // heartbreak death — this assertion is the bypass-fix payoff.
    const seen: Array<{ id: number; role: Role | null; cause: string; source: string }> = [];
    setDeathTriggerSpy((_g, d) => seen.push({
      id: d.player.id, role: d.player.role, cause: d.cause, source: d.source,
    }));
    let dawn: NightResult;
    try {
      dawn = runNight(game, 3); // mafia kills X, NOT the hunter
    } finally {
      setDeathTriggerSpy(null);
    }
    expect(seen).toContainEqual({ id: 2, role: "hunter", cause: "lover_cascade", source: "mafia" });

    // Both deaths recorded — direct kill first, heartbreak second...
    expect(dawn.killed.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [3, "mafia", "direct"],
      [2, "mafia", "lover_cascade"],
    ]);
    expect(game.eventHistory.slice(-2)).toMatchObject([
      { type: "kill", playerName: "Player3", cause: "direct", source: "mafia" },
      { type: "lover_death", playerName: "Player2", cause: "lover_cascade", source: "mafia" },
    ]);
    // ...THEN the gate, opened by the cascade death.
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: false } });
    expect(game.phase).toBe("night");
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);

    // Revenge works from the heartbreak-opened gate.
    const res = submitHunterRevenge(game, 2, 4);
    expect(res.ok).toBe(true);
    expect(res.deaths.map((d) => [d.player.id, d.cause])).toEqual([[4, "direct"]]);
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("day"); // 1 mafia vs 2 citizens: game continues
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── E3 — Revenge into a lover ───────────────────────────────────────────────

describe("E3 — the revenge target is a lover", () => {
  test("target + partner die via cascade inside submitHunterRevenge, cause-keyed; ONE win check after BOTH deaths", () => {
    // Lovers are the citizens at seats 3+4 (join-order indices 2 and 3).
    // Board chosen so the win threshold is reached ONLY by the pair's
    // combined deaths: post-revenge alive = 1 mafia vs 1 citizen -> mafia;
    // after the direct death alone it would be 1 vs 2 -> no winner. The
    // "mafia" outcome therefore proves the single win check ran after the
    // cascade (§7 row 3: cascade applies first, then ONE check).
    const game = makeGame(
      ["mafia", "hunter", "citizen", "citizen", "citizen"],
      undefined,
      [2, 3],
    );
    runNight(game, 2); // mafia night-kills the hunter
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: false } });

    const eventsBefore = game.eventHistory.length;
    const res = submitHunterRevenge(game, 2, 3);
    expect(res.ok).toBe(true);

    // deaths[] is cause-keyed: direct first, then the lover cascade.
    expect(res.deaths.map((d) => [d.player.id, d.source, d.cause, d.eventType])).toEqual([
      [3, "hunter_revenge", "direct", "hunter_revenge"],
      [4, "hunter_revenge", "lover_cascade", "lover_death"],
    ]);

    // Correct event types, exactly the two death entries appended.
    expect(game.eventHistory.length).toBe(eventsBefore + 2);
    expect(game.eventHistory.slice(-2)).toMatchObject([
      { type: "hunter_revenge", playerName: "Player3", cause: "direct", source: "hunter_revenge" },
      { type: "lover_death", playerName: "Player4", cause: "lover_cascade", source: "hunter_revenge" },
    ]);

    // Message order pinned STRUCTURALLY: revenge line (target's name), then
    // the heartbreak line (partner's name), then exactly ONE epilogue line —
    // a second win evaluation would have appended a second win line.
    expect(res.messages.length).toBe(3);
    expect(res.messages[0]).toBe(res.deaths[0].message);
    expect(res.messages[0]).toContain("Player3");
    expect(res.messages[1]).toBe(res.deaths[1].message);
    expect(res.messages[1]).toContain("Player4");
    expect(res.messages[2].length).toBeGreaterThan(0);

    // The single deferred win check saw the POST-cascade board.
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── E4 — Heartbreak-during-vote (engine half) ───────────────────────────────

describe("E4 — the lynch target is the Hunter's lover (Hunter NOT executed)", () => {
  test("execution + cascade recorded; gate opens BEFORE the auto-night; phase held at voting with the ballot cleared; resume.autoNight true; revenge -> night", () => {
    // Hunter seat 2, lover citizen X seat 3 (join-order indices 1 and 2).
    const game = makeGame(
      ["mafia", "hunter", "citizen", "citizen", "citizen", "citizen"],
      undefined,
      [1, 2],
    );
    forceDawn(game); // skip night 1: straight to day

    const vote = runVote(game, 3, [1, 4, 5, 6]); // lynch X — the hunter votes NO
    expect(vote.executed).toBe(true);
    expect(vote.killed.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [3, "execution", "direct"],
      [2, "execution", "lover_cascade"],
    ]);

    // Gate open BEFORE the auto-transition to night: held at "voting" with
    // the ballot already cleared, the resume carrying the auto-night.
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: true } });
    expect(game.phase).toBe("voting");
    expect(game.round).toBe(1); // no night entered yet
    expect(game.votes.size).toBe(0);
    expect(game.voteTarget).toBeNull();
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);

    // After revenge -> night begins (the deferred auto-night).
    const res = submitHunterRevenge(game, 2, 4);
    expect(res.ok).toBe(true);
    expect(res.messages.length).toBe(2); // revenge line, then night-falls
    expect(res.messages[0]).toContain("Player4");
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
    expect(game.nightSubPhase).toBe("mafia");
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("VARIANT: official-mode joker lynched, joker's lover is the Hunter — resume.preserveHauntVoters true; post-revenge the haunt night still happens with jokerHauntVoters intact", () => {
    // Joker seat 2 + Hunter seat 3 are the lover pair (indices 1 and 2).
    const game = makeGame(
      ["mafia", "joker", "hunter", "citizen", "citizen", "citizen"],
      { enableJoker: true, jokerMode: "official" },
      [1, 2],
    );
    forceDawn(game);

    const vote = runVote(game, 2, [1, 4, 5, 6]); // lynch the joker — hunter votes NO
    expect(vote.executed).toBe(true);
    expect(vote.jokerWin).toBe(true);
    expect(vote.killed.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [2, "execution", "direct"],
      [3, "execution", "lover_cascade"], // the Hunter, heartbreak-dead
    ]);

    // The gate holds the OFFICIAL-JOKER epilogue: preserveHauntVoters rides
    // the resume (its reason to exist), and the captured FOR-voters survive
    // the gated wait untouched. The assertInvariants line is the fix(C2b)
    // regression: this REAL engine state used to flag
    // night_scope_dirty:jokerHauntVoters, which would make the server's
    // handleMessage choke point throw on EVERY message while the gate is
    // open (test mode throws; production logs per message).
    expect(game.pendingRevenge).toEqual({
      hunterId: 3,
      resume: { autoNight: true, preserveHauntVoters: true },
    });
    expect(game.phase).toBe("voting");
    expect(game.votes.size).toBe(0);
    expect(game.voteTarget).toBeNull();
    // Membership + size, not insertion order: no consumer is order-sensitive.
    expect([...game.jokerHauntVoters].sort((a, b) => a - b)).toEqual([1, 4, 5, 6]);
    expect(game.jokerJointWinner).toBe(true);
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);

    // Revenge resolves -> the deferred haunt night begins WITH the voters.
    const res = submitHunterRevenge(game, 3, 4);
    expect(res.ok).toBe(true);
    expect(res.messages.length).toBe(2); // revenge line, then night-falls
    expect(game.pendingRevenge).toBeNull();
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
    expect([...game.jokerHauntVoters].sort((a, b) => a - b)).toEqual([1, 4, 5, 6]); // preserved through beginNight
    expect(assertInvariants(game, AT)).toEqual([]);

    // The haunt still happens: the dead joker can pick a (living) FOR-voter
    // and the haunt kill lands at the next dawn.
    expect(submitJokerHaunt(game, 2, 5)).toBe(true);
    expect(lockTarget(game, 1, 6).consensus).toBe(true);
    advanceNightSubPhase(game); // -> resolving
    const dawn = transitionToDay(game);
    expect(dawn.killed.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [6, "mafia", "direct"],
      [5, "joker_haunt", "direct"],
    ]);
    // Only the mafia remains: game over, with the joint-winner joker riding.
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(game.jokerJointWinner).toBe(true);
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── E5 — Win-condition matrix (HUNTER-DESIGN §7; M8 settled) ────────────────
//
// Already pinned by tests/hunter-engine.test.ts (C2a), NOT duplicated here:
//   E5b  revenge kills the last mafia -> town wins from beyond the grave
//        ("revenge kills the LAST mafia" test);
//   E5d  decline at pre-existing parity -> mafia wins on the deferred check
//        ("decline at parity" test).
// The §7 joint-winner row (official-mode jokerJointWinner riding a
// revenge-ended game_over) IS constructible and is pinned below.

describe("E5 — win-condition interactions", () => {
  test("(a) revenge-into-parity: revenge kills a townie leaving aliveMafia >= aliveNonMafia -> mafia wins", () => {
    const game = makeGame(["mafia", "hunter", "citizen", "citizen"]);
    runNight(game, 2); // hunter dead; alive: 1 mafia vs 2 citizens
    expect(game.pendingRevenge).not.toBeNull();
    expect(game.winner).toBeNull();

    const res = submitHunterRevenge(game, 2, 3);
    expect(res.ok).toBe(true);
    expect(res.messages.length).toBe(2); // revenge line, then the win line
    expect(res.messages[0]).toBe(res.deaths[0].message);
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia"); // 1 vs 1 — parity only AFTER the revenge
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("(c1) joker alive, revenge kills the LAST non-mafia townie -> mafia wins; the joker's presence does not save town (M8 §7 row endpoint)", () => {
    const game = makeGame(
      ["mafia", "hunter", "joker", "citizen"],
      { enableJoker: true },
    );
    runNight(game, 2); // hunter dead; alive: mafia, joker, citizen
    // The pre-revenge board ALREADY sits at M8 parity (1 mafia vs 1 townie,
    // joker excluded) — the gate opening here proves the check is deferred,
    // never skipped (§7: "the gate defers, never skips, the check").
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: false } });
    expect(game.winner).toBeNull();

    const res = submitHunterRevenge(game, 2, 4); // the last townie
    expect(res.ok).toBe(true);
    // Post-revenge alive: 1 mafia + 1 joker -> aliveNonMafia (excl. joker)
    // = 0 -> mafia wins; the game ENDS rather than waiting on a town that
    // no longer exists.
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(game.players.get(3)!.isAlive).toBe(true); // the joker just watches
    expect(game.jokerJointWinner).toBe(false);
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("(c2) M8 is DECISIVE: the living joker is excluded from the parity compare — counting them as town would keep the game running", () => {
    const game = makeGame(
      ["mafia", "hunter", "joker", "citizen", "citizen"],
      { enableJoker: true },
    );
    runNight(game, 2); // alive: mafia, joker, 2 citizens
    expect(game.pendingRevenge).not.toBeNull();

    const res = submitHunterRevenge(game, 2, 4);
    expect(res.ok).toBe(true);
    // Post-revenge alive: 1 mafia, 1 joker, 1 citizen. M8: 1 mafia >= 1
    // non-mafia (joker excluded) -> mafia wins NOW. A joker-counts-as-town
    // misreading would see 1 vs 2 and leave the game running — this board
    // distinguishes the two where the §7 endpoint row cannot.
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("(c3) joker alive, revenge kills the last mafia -> town wins; the living joker is NOT a winner", () => {
    const game = makeGame(
      ["mafia", "hunter", "joker", "citizen", "citizen"],
      { enableJoker: true },
    );
    runNight(game, 2); // alive: mafia, joker, 2 citizens
    expect(game.pendingRevenge).not.toBeNull();

    const res = submitHunterRevenge(game, 2, 1); // shoot the last mafia
    expect(res.ok).toBe(true);
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("town"); // hunter already dead — town still wins
    expect(game.players.get(3)!.isAlive).toBe(true);
    // Living joker is not a winner: joker only wins via lynch
    // (jokerJointWinner/house instant win) — the game-over payload carries
    // no joint-winner flag.
    expect(game.jokerJointWinner).toBe(false);
    expect(projectGameOver(game, "x")).not.toHaveProperty("jokerJointWinner");
    expect(assertInvariants(game, AT)).toEqual([]);
  });

  test("(§7 joint-winner row) official-mode jokerJointWinner rides a revenge-ended game_over unchanged — not a lettered §9 sub-case; E5(d) decline-at-parity lives in hunter-engine.test.ts", () => {
    // Day 1: the joker is lynched (joint winner, haunt night queued).
    // Night 2: mafia kills the Hunter (joker abstains from haunting).
    // Revenge creates parity -> mafia wins WITH the joint-winner flag riding.
    const game = makeGame(
      ["mafia", "joker", "hunter", "citizen", "citizen"],
      { enableJoker: true, jokerMode: "official" },
    );
    forceDawn(game);
    const vote = runVote(game, 2, [1, 4, 5]);
    expect(vote.executed).toBe(true);
    expect(game.jokerJointWinner).toBe(true);
    expect(game.pendingRevenge).toBeNull(); // no Hunter death yet
    expect(game.phase).toBe("night"); // the haunt night
    expect(game.round).toBe(2);

    runNight(game, 3); // mafia kills the Hunter; no haunt submitted
    expect(game.pendingRevenge).toEqual({ hunterId: 3, resume: { autoNight: false } });
    expect(game.winner).toBeNull();

    const res = submitHunterRevenge(game, 3, 4);
    expect(res.ok).toBe(true);
    // Post-revenge alive: 1 mafia vs 1 citizen -> mafia wins; the lynched
    // joker's joint win rides the existing payload unchanged.
    expect(game.phase).toBe("game_over");
    expect(game.winner).toBe("mafia");
    expect(game.jokerJointWinner).toBe(true);
    expect(projectGameOver(game, "x")).toMatchObject({ winner: "mafia", jokerJointWinner: true });
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});

// ── E7 — Doctor cannot block the revenge (§5: UNSTOPPABLE) ──────────────────

describe("E7 — doctor protection does not stop the revenge shot", () => {
  test("doctor protects X the night the Hunter dies; revenge targets X -> X dies, no save line, lastDoctorTarget unaffected", () => {
    const game = makeGame(
      ["mafia", "hunter", "doctor", "citizen", "citizen"],
      { enableDoctor: true },
    );

    // Real sub-phase flow: mafia locks the hunter, doctor protects X=4.
    expect(lockTarget(game, 1, 2).consensus).toBe(true);
    expect(advanceNightSubPhase(game)).toEqual({ nextPhase: "doctor", isFake: false });
    expect(submitDoctorSave(game, 3, 4)).toBe(true);
    advanceNightSubPhase(game); // detective disabled -> resolving

    const dawn = transitionToDay(game);
    expect(dawn.killed.map((d) => [d.player.id, d.source])).toEqual([[2, "mafia"]]);
    expect(dawn.saved).toBe(false); // the save sat on X, who was not attacked
    expect(game.lastDoctorTarget).toBe(4); // tonight's protection, captured at dawn
    expect(game.pendingRevenge).toEqual({ hunterId: 2, resume: { autoNight: false } });

    // Revenge targets the PROTECTED player: the shot resolves outside the
    // night-action fold and never consults the doctor's pick — X dies.
    const res = submitHunterRevenge(game, 2, 4);
    expect(res.ok).toBe(true);
    expect(res.deaths.map((d) => [d.player.id, d.source, d.cause])).toEqual([
      [4, "hunter_revenge", "direct"],
    ]);
    expect(game.players.get(4)!.isAlive).toBe(false);
    // No save message for the revenge: the one and only line is the kill.
    expect(res.messages.length).toBe(1);
    expect(res.messages[0]).toBe(res.deaths[0].message);
    // lastDoctorTarget unaffected by the revenge resolution.
    expect(game.lastDoctorTarget).toBe(4);
    expect(game.phase).toBe("day"); // 1 mafia vs doctor+citizen: game continues
    expect(game.winner).toBeNull();
    expect(assertInvariants(game, AT)).toEqual([]);
  });
});
