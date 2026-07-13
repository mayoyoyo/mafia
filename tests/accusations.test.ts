// Player-initiated accusation system — engine unit tests.
//
// Covers the full day-phase state machine (accuse → second → vote), the
// anti-spam limits (one accusation + one second per player per day), eligibility
// (self/dead/accuser/accused/already-used rejections), the withdraw path, the
// sleep-proposal (no-lynch) path, the ≤2-alive second waiver, and the reset
// seam (accusations clear at night, persist across a failed vote).
//
// Games are dealt via the shared fixtures (starts in night, narrator confirmed);
// forceDawn takes us to the day phase where accusations live.

import { describe, test, expect, afterEach } from "bun:test";
import {
  createGame, addPlayer, updateSettings, startGame, setFixedDeal, removeGame,
  forceDawn, endDay, castVote, resolveVote, cancelVote,
  accuse, secondAccusation, withdrawAccusation, getAlivePlayers,
  submitMafiaVote, advanceNightSubPhase, transitionToDay,
} from "../src/game-engine";

function lockTarget(game: Game, mafiaId: number, targetId: number) {
  submitMafiaVote(game, mafiaId, targetId, "maybe");
  return submitMafiaVote(game, mafiaId, targetId, "lock");
}
import type { Game, GameSettings, Role } from "../src/types";

const liveGames: string[] = [];
afterEach(() => { for (const c of liveGames.splice(0)) removeGame(c); });

/** Deal roles in join order (player 1 = admin), start, confirm narrator, force to day. */
function dayGame(roles: Role[], settings?: Partial<GameSettings>): Game {
  const game = createGame(1, "Admin");
  liveGames.push(game.code);
  for (let i = 2; i <= roles.length; i++) addPlayer(game, i, `Player${i}`);
  if (settings) updateSettings(game, settings);
  setFixedDeal({ roles });
  try { expect(startGame(game)).not.toBeNull(); } finally { setFixedDeal(null); }
  game.awaitingNarratorReady = false;
  forceDawn(game); // night → day, no deaths
  expect(game.phase).toBe("day");
  return game;
}

// Five-player town (1 mafia, 4 citizens) — plenty of living seats for seconds.
const FIVE: Role[] = ["mafia", "citizen", "citizen", "citizen", "citizen"];

describe("accuse — validation", () => {
  test("living player may accuse another living player", () => {
    const game = dayGame(FIVE);
    const r = accuse(game, 2, 3);
    expect(r.ok).toBe(true);
    expect(r.voteStarted).toBe(false);
    expect(game.accusations.length).toBe(1);
    expect(game.accusations[0]).toMatchObject({ accuserId: 2, targetId: 3 });
    expect(game.accusationsMade).toContain(2);
  });

  test("cannot accuse outside the day phase", () => {
    const game = dayGame(FIVE);
    endDay(game); // → night
    expect(game.phase).toBe("night");
    expect(accuse(game, 2, 3).ok).toBe(false);
    expect(game.accusations.length).toBe(0);
  });

  test("cannot accuse while a vote is in progress", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    secondAccusation(game, 4, game.accusations[0]?.id ?? 0);
    expect(game.phase).toBe("voting");
    expect(accuse(game, 5, 2).ok).toBe(false);
  });

  test("dead player cannot accuse", () => {
    const game = dayGame(FIVE);
    game.players.get(2)!.isAlive = false;
    expect(accuse(game, 2, 3).error).toBe("not_alive");
  });

  test("cannot accuse self", () => {
    const game = dayGame(FIVE);
    expect(accuse(game, 2, 2).error).toBe("self");
  });

  test("cannot accuse a dead target", () => {
    const game = dayGame(FIVE);
    game.players.get(3)!.isAlive = false;
    expect(accuse(game, 2, 3).error).toBe("invalid_target");
  });

  test("one accusation per player per day (double-accuse rejected)", () => {
    const game = dayGame(FIVE);
    expect(accuse(game, 2, 3).ok).toBe(true);
    const r = accuse(game, 2, 4);
    expect(r.error).toBe("already_accused");
    expect(game.accusations.length).toBe(1);
  });

  test("multiple different accusers may have pending accusations simultaneously", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    accuse(game, 3, 4);
    accuse(game, 4, 5);
    expect(game.accusations.length).toBe(3);
  });
});

describe("second_accusation — eligibility + vote start", () => {
  test("a different living player seconds → day transitions to voting on the target", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    const id = game.accusations[0].id;
    const r = secondAccusation(game, 4, id);
    expect(r.ok).toBe(true);
    expect(game.phase).toBe("voting");
    expect(game.voteTarget).toBe(3);
    expect(game.sleepVote).toBe(false);
    expect(game.accusations.length).toBe(0); // consumed
    expect(game.secondsMade).toContain(4);
  });

  test("accuser cannot second their own accusation", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    expect(secondAccusation(game, 2, game.accusations[0].id).error).toBe("own_accusation");
    expect(game.phase).toBe("day");
  });

  test("the accused cannot second their own trial", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    expect(secondAccusation(game, 3, game.accusations[0].id).error).toBe("accused_cannot_second");
    expect(game.phase).toBe("day");
  });

  test("cannot second twice in one day", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    accuse(game, 3, 5);
    const first = game.accusations.find((a) => a.accuserId === 2)!;
    secondAccusation(game, 4, first.id); // 4 spends their second → vote starts
    expect(game.phase).toBe("voting");
    cancelVote(game, 1); // admin aborts, back to day, other accusation persists
    expect(game.phase).toBe("day");
    const second = game.accusations.find((a) => a.accuserId === 3)!;
    expect(secondAccusation(game, 4, second.id).error).toBe("already_seconded");
  });

  test("seconding a non-existent accusation is rejected", () => {
    const game = dayGame(FIVE);
    expect(secondAccusation(game, 4, 999).error).toBe("no_such_accusation");
  });

  test("dead player cannot second", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    game.players.get(4)!.isAlive = false;
    expect(secondAccusation(game, 4, game.accusations[0].id).error).toBe("not_alive");
  });
});

describe("withdraw_accusation", () => {
  test("accuser withdraws own un-seconded accusation; does NOT refund the accusation", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    const id = game.accusations[0].id;
    expect(withdrawAccusation(game, 2, id).ok).toBe(true);
    expect(game.accusations.length).toBe(0);
    // No refund: the accuser still cannot accuse again this day.
    expect(accuse(game, 2, 4).error).toBe("already_accused");
  });

  test("cannot withdraw someone else's accusation", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    expect(withdrawAccusation(game, 5, game.accusations[0].id).ok).toBe(false);
    expect(game.accusations.length).toBe(1);
  });

  test("cannot withdraw after seconded (already consumed → no longer pending)", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    const id = game.accusations[0].id;
    secondAccusation(game, 4, id);
    expect(withdrawAccusation(game, 2, id).ok).toBe(false);
  });
});

describe("failed / cancelled vote — pending accusations persist", () => {
  test("spared execution vote → back to day; other pending accusations still standing", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);           // seconded → vote on 3
    accuse(game, 3, 5);           // stays pending
    secondAccusation(game, 4, game.accusations.find((a) => a.accuserId === 2)!.id);
    expect(game.phase).toBe("voting");
    // Spare 3: only 1 for, rest against.
    for (const [id, p] of game.players) if (p.isAlive) castVote(game, id, false);
    const res = resolveVote(game)!;
    expect(res.executed).toBe(false);
    expect(game.phase).toBe("day");
    // The other accusation survived the failed vote.
    expect(game.accusations.length).toBe(1);
    expect(game.accusations[0].accuserId).toBe(3);
  });

  test("cancelVote keeps pending accusations", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    accuse(game, 3, 5);
    secondAccusation(game, 4, game.accusations.find((a) => a.accuserId === 2)!.id);
    cancelVote(game, 1);
    expect(game.phase).toBe("day");
    expect(game.accusations.length).toBe(1);
  });
});

describe("accusation state clears at night", () => {
  test("endDay (→night) clears every accusation field", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, 3);
    accuse(game, 3, 4);
    endDay(game);
    expect(game.phase).toBe("night");
    expect(game.accusations).toEqual([]);
    expect(game.accusationsMade).toEqual([]);
    expect(game.secondsMade).toEqual([]);
    expect(game.nextAccusationId).toBe(0);
  });

  test("execution auto-night clears accusations; new day gives everyone a fresh accusation", () => {
    const game = dayGame(["mafia", "citizen", "citizen", "citizen", "citizen", "citizen"]);
    accuse(game, 2, 6);           // pending
    accuse(game, 3, 4);
    secondAccusation(game, 5, game.accusations.find((a) => a.accuserId === 3)!.id); // vote on 4
    // Execute 4.
    for (const [id, p] of game.players) if (p.isAlive) castVote(game, id, id !== 4);
    const res = resolveVote(game)!;
    expect(res.executed).toBe(true);
    expect(game.phase).toBe("night");     // auto-night after execution
    expect(game.accusations).toEqual([]);
    expect(game.accusationsMade).toEqual([]);
    // Next day: player 2 (who accused last day) may accuse again.
    lockTarget(game, 1, 5);
    advanceNightSubPhase(game);
    transitionToDay(game);
    if (game.phase === "day") {
      expect(accuse(game, 2, 3).ok).toBe(true);
    }
  });
});

describe("sleep proposal (no-lynch path)", () => {
  test("propose sleep (targetId null) → second → majority YES ends the day (night)", () => {
    const game = dayGame(FIVE);
    const r = accuse(game, 2, null);
    expect(r.ok).toBe(true);
    expect(game.accusations[0].targetId).toBe(null);
    const id = game.accusations[0].id;
    expect(secondAccusation(game, 4, id).ok).toBe(true);
    expect(game.phase).toBe("voting");
    expect(game.sleepVote).toBe(true);
    expect(game.voteTarget).toBe(null);
    // Everyone votes YES to sleep.
    for (const [pid, p] of game.players) if (p.isAlive) castVote(game, pid, true);
    const res = resolveVote(game)!;
    expect(res.sleep).toBe(true);
    expect(res.sleepPassed).toBe(true);
    expect(res.killed.length).toBe(0);
    expect(game.phase).toBe("night");     // day ended, night began
    expect(game.round).toBe(2);
  });

  test("sleep vote fails (majority NO) → day continues, remaining accusations stand", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, null);        // sleep proposal (seconded below)
    accuse(game, 3, 5);           // ordinary accusation, stays pending
    secondAccusation(game, 4, game.accusations.find((a) => a.targetId === null)!.id);
    expect(game.sleepVote).toBe(true);
    // Majority NO.
    for (const [pid, p] of game.players) if (p.isAlive) castVote(game, pid, false);
    const res = resolveVote(game)!;
    expect(res.sleep).toBe(true);
    expect(res.sleepPassed).toBe(false);
    expect(game.phase).toBe("day");
    expect(game.sleepVote).toBe(false);
    expect(game.accusations.length).toBe(1); // the ordinary accusation survives
    expect(game.accusations[0].accuserId).toBe(3);
  });

  test("a sleep proposal consumes the proposer's one accusation for the day", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, null);
    expect(accuse(game, 2, 3).error).toBe("already_accused");
  });

  test("proposer cannot second their own sleep proposal", () => {
    const game = dayGame(FIVE);
    accuse(game, 2, null);
    expect(secondAccusation(game, 2, game.accusations[0].id).error).toBe("own_accusation");
  });
});

describe("small-endgame waiver (≤2 alive)", () => {
  test("with 2 alive, an accusation goes straight to the vote (no second needed)", () => {
    const game = dayGame(FIVE);
    // Kill down to 2 alive: players 2 and 3.
    for (const id of [1, 4, 5]) game.players.get(id)!.isAlive = false;
    expect(getAlivePlayers(game).length).toBe(2);
    const r = accuse(game, 2, 3);
    expect(r.ok).toBe(true);
    expect(r.voteStarted).toBe(true);
    expect(game.phase).toBe("voting");
    expect(game.voteTarget).toBe(3);
    expect(game.accusations.length).toBe(0); // never left pending
  });

  test("with 2 alive, a sleep proposal goes straight to the sleep ballot", () => {
    const game = dayGame(FIVE);
    for (const id of [1, 4, 5]) game.players.get(id)!.isAlive = false;
    const r = accuse(game, 2, null);
    expect(r.voteStarted).toBe(true);
    expect(game.phase).toBe("voting");
    expect(game.sleepVote).toBe(true);
  });
});
