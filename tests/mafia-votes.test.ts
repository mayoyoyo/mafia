import { describe, test, expect } from "bun:test";
import {
  createGame, addPlayer, updateSettings, startGame,
  submitMafiaVote, removeMafiaVote, submitDoctorSave,
  submitDetectiveInvestigation, checkNightReady, transitionToDay,
  getAliveByRole, getMafiaVoteStatus, removeGame,
} from "../src/game-engine";
import type { Game } from "../src/types";

function setupGame(playerCount: number, settings?: Partial<import("../src/types").GameSettings>): Game {
  const game = createGame(1, "Admin");
  for (let i = 2; i <= playerCount; i++) {
    addPlayer(game, i, `Player${i}`);
  }
  if (settings) updateSettings(game, settings);
  return game;
}

describe("Mafia Votes - Maybe", () => {
  test("maybe: toggle on", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].voteType).toBe("maybe");
    expect(votes[0].targetId).toBe(citizens[0].id);
    removeGame(game.code);
  });

  test("maybe: toggle off", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe"); // toggle off
    const votes = game.mafiaVotes.get(mafia[0].id) || [];
    expect(votes.length).toBe(0);
    removeGame(game.code);
  });

  test("maybe: limit of 4", () => {
    const game = setupGame(10, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const nonMafia = Array.from(game.players.values()).filter(p => p.role !== "mafia" && p.isAlive);

    // Add 4 maybes
    for (let i = 0; i < 4; i++) {
      submitMafiaVote(game, mafia[0].id, nonMafia[i].id, "maybe");
    }
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(4);

    // 5th should fail
    const result = submitMafiaVote(game, mafia[0].id, nonMafia[4].id, "maybe");
    expect(game.mafiaVotes.get(mafia[0].id)!.length).toBe(4);
    removeGame(game.code);
  });

  test("maybe: remove one then add another", () => {
    const game = setupGame(10, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const nonMafia = Array.from(game.players.values()).filter(p => p.role !== "mafia" && p.isAlive);

    // Add 4 maybes
    for (let i = 0; i < 4; i++) {
      submitMafiaVote(game, mafia[0].id, nonMafia[i].id, "maybe");
    }

    // Remove one
    submitMafiaVote(game, mafia[0].id, nonMafia[0].id, "maybe"); // toggle off
    expect(game.mafiaVotes.get(mafia[0].id)!.length).toBe(3);

    // Now can add another
    submitMafiaVote(game, mafia[0].id, nonMafia[4].id, "maybe");
    expect(game.mafiaVotes.get(mafia[0].id)!.length).toBe(4);
    removeGame(game.code);
  });
});

describe("Mafia Votes - Lock", () => {
  test("lock: requires prior maybe", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    // Lock without maybe should fail
    const result = submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");
    const votes = game.mafiaVotes.get(mafia[0].id) || [];
    expect(votes.length).toBe(0);
    removeGame(game.code);
  });

  test("lock: upgrades maybe to lock", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].voteType).toBe("lock");
    expect(votes[0].targetId).toBe(citizens[0].id);
    removeGame(game.code);
  });

  test("lock: only 1 lock allowed", () => {
    const game = setupGame(10, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const nonMafia = Array.from(game.players.values()).filter(p => p.role !== "mafia" && p.isAlive);

    submitMafiaVote(game, mafia[0].id, nonMafia[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, nonMafia[1].id, "maybe");
    submitMafiaVote(game, mafia[0].id, nonMafia[0].id, "lock");

    // Try to lock a second target — should fail
    const result = submitMafiaVote(game, mafia[0].id, nonMafia[1].id, "lock");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    const locks = votes.filter(v => v.voteType === "lock");
    expect(locks.length).toBe(1);
    expect(locks[0].targetId).toBe(nonMafia[0].id);
    removeGame(game.code);
  });

  test("lock: toggle off reverts to maybe", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock"); // toggle off
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].voteType).toBe("maybe"); // reverted to maybe
    removeGame(game.code);
  });

  test("lock: 3 maybe + 1 lock = 4 slots, can't add more maybe", () => {
    const game = setupGame(10, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const nonMafia = Array.from(game.players.values()).filter(p => p.role !== "mafia" && p.isAlive);

    // Add 4 maybes
    for (let i = 0; i < 4; i++) {
      submitMafiaVote(game, mafia[0].id, nonMafia[i].id, "maybe");
    }

    // Lock one of them (still 4 total: 3 maybe + 1 lock)
    submitMafiaVote(game, mafia[0].id, nonMafia[0].id, "lock");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(4);

    // Can't add a 5th
    submitMafiaVote(game, mafia[0].id, nonMafia[4].id, "maybe");
    expect(game.mafiaVotes.get(mafia[0].id)!.length).toBe(4);
    removeGame(game.code);
  });
});

describe("Mafia Votes - Letsnot", () => {
  test("letsnot: toggle on/off", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "letsnot");
    let votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].voteType).toBe("letsnot");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "letsnot"); // toggle off
    votes = game.mafiaVotes.get(mafia[0].id) || [];
    expect(votes.length).toBe(0);
    removeGame(game.code);
  });

  test("letsnot: limit of 4", () => {
    const game = setupGame(10, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const nonMafia = Array.from(game.players.values()).filter(p => p.role !== "mafia" && p.isAlive);

    for (let i = 0; i < 4; i++) {
      submitMafiaVote(game, mafia[0].id, nonMafia[i].id, "letsnot");
    }
    expect(game.mafiaVotes.get(mafia[0].id)!.length).toBe(4);

    // 5th should fail
    submitMafiaVote(game, mafia[0].id, nonMafia[4].id, "letsnot");
    expect(game.mafiaVotes.get(mafia[0].id)!.length).toBe(4);
    removeGame(game.code);
  });
});

describe("Mafia Votes - Mutual Exclusion", () => {
  test("can't have maybe+letsnot on same target", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "letsnot");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].voteType).toBe("letsnot"); // replaced maybe with letsnot
    removeGame(game.code);
  });

  test("letsnot→maybe clears letsnot", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "letsnot");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].voteType).toBe("maybe"); // replaced letsnot with maybe
    removeGame(game.code);
  });
});

describe("Mafia Votes - Consensus", () => {
  test("all mafia lock same target → consensus", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");
    submitMafiaVote(game, mafia[1].id, target, "maybe");
    const result = submitMafiaVote(game, mafia[1].id, target, "lock");

    expect(result.consensus).toBe(true);
    expect(result.target).toBe(target);
    expect(game.mafiaTarget).toBe(target);
    removeGame(game.code);
  });

  test("mafia lock different targets → no consensus", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");
    submitMafiaVote(game, mafia[1].id, citizens[1].id, "maybe");
    const result = submitMafiaVote(game, mafia[1].id, citizens[1].id, "lock");

    expect(result.consensus).toBe(false);
    expect(game.mafiaTarget).toBeNull();
    removeGame(game.code);
  });

  test("not all mafia have locks → no consensus", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    const result = submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");

    expect(result.consensus).toBe(false);
    expect(game.mafiaTarget).toBeNull();
    removeGame(game.code);
  });

  test("solo mafia: lock immediately resolves", () => {
    const game = setupGame(4, { mafiaCount: 1 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    const result = submitMafiaVote(game, mafia[0].id, target, "lock");

    expect(result.consensus).toBe(true);
    expect(result.target).toBe(target);
    expect(game.mafiaTarget).toBe(target);
    removeGame(game.code);
  });

  test("3 mafia: 2 lock same, 1 different → no consensus", () => {
    const game = setupGame(12, { mafiaCount: 3 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    // Mafia 0 and 1 lock citizen 0
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");
    submitMafiaVote(game, mafia[1].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[1].id, citizens[0].id, "lock");

    // Mafia 2 locks citizen 1
    submitMafiaVote(game, mafia[2].id, citizens[1].id, "maybe");
    const result = submitMafiaVote(game, mafia[2].id, citizens[1].id, "lock");

    expect(result.consensus).toBe(false);
    expect(game.mafiaTarget).toBeNull();
    removeGame(game.code);
  });

  test("consensus locks mafiaTarget — further votes rejected", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    // Achieve consensus
    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");
    submitMafiaVote(game, mafia[1].id, target, "maybe");
    submitMafiaVote(game, mafia[1].id, target, "lock");
    expect(game.mafiaTarget).toBe(target);

    // Once consensus is reached (auto-kill), further votes are rejected
    const result = submitMafiaVote(game, mafia[0].id, target, "lock");
    expect(result.consensus).toBe(false);
    expect(game.mafiaTarget).toBe(target); // still locked
    removeGame(game.code);
  });
});

describe("Mafia Votes - Edge Cases", () => {
  test("rapid toggle: maybe→lock→toggle lock off→relock", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");
    submitMafiaVote(game, mafia[0].id, target, "lock"); // toggle off → maybe
    submitMafiaVote(game, mafia[0].id, target, "lock"); // relock
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes[0].voteType).toBe("lock");
    removeGame(game.code);
  });

  test("lock target A, then try to lock target B (should fail — must also have maybe on B)", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[0].id, "lock");

    // Try to lock B without maybe on B — should fail due to only 1 lock allowed
    submitMafiaVote(game, mafia[0].id, citizens[1].id, "maybe");
    const result = submitMafiaVote(game, mafia[0].id, citizens[1].id, "lock");
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    const locks = votes.filter(v => v.voteType === "lock");
    expect(locks.length).toBe(1);
    expect(locks[0].targetId).toBe(citizens[0].id); // still locked on A
    removeGame(game.code);
  });

  test("removeMafiaVote: remove specific target", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[1].id, "maybe");

    const removed = removeMafiaVote(game, mafia[0].id, citizens[0].id);
    expect(removed).toBe(true);
    const votes = game.mafiaVotes.get(mafia[0].id)!;
    expect(votes.length).toBe(1);
    expect(votes[0].targetId).toBe(citizens[1].id);
    removeGame(game.code);
  });

  test("removeMafiaVote: remove all votes", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[1].id, "letsnot");

    const removed = removeMafiaVote(game, mafia[0].id);
    expect(removed).toBe(true);
    expect(game.mafiaVotes.has(mafia[0].id)).toBe(false);
    removeGame(game.code);
  });

  test("vote status format is correct with multiple votes per mafia", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id, "maybe");
    submitMafiaVote(game, mafia[0].id, citizens[1].id, "letsnot");

    const status = getMafiaVoteStatus(game);
    const m0Name = game.players.get(mafia[0].id)!.username;
    expect(status.voterTargets[m0Name]).toBeDefined();
    expect(status.voterTargets[m0Name].length).toBe(2);
    expect(status.lockedTarget).toBeNull();
    removeGame(game.code);
  });
});

describe("Mafia Votes - Integration", () => {
  test("unanimous lock triggers night resolution with doctor ready", () => {
    const game = setupGame(5, { mafiaCount: 1, enableDoctor: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const doctor = getAliveByRole(game, "doctor")[0];
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");
    submitDoctorSave(game, doctor.id, citizens[1].id);

    expect(game.mafiaTarget).toBe(target);
    expect(checkNightReady(game)).toBe(true);
    removeGame(game.code);
  });

  test("unanimous lock but doctor not ready → waits", () => {
    const game = setupGame(5, { mafiaCount: 1, enableDoctor: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");

    expect(game.mafiaTarget).toBe(target);
    expect(checkNightReady(game)).toBe(false); // doctor hasn't acted
    removeGame(game.code);
  });

  test("doctor saves locked target → target survives", () => {
    const game = setupGame(5, { mafiaCount: 1, enableDoctor: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const doctor = getAliveByRole(game, "doctor")[0];
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");
    submitDoctorSave(game, doctor.id, target);

    const nightResult = transitionToDay(game);
    expect(nightResult.saved).toBe(true);
    expect(game.players.get(target)!.isAlive).toBe(true);
    removeGame(game.code);
  });

  test("game resets all mafia votes on day transition", () => {
    const game = setupGame(5, { mafiaCount: 1 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target, "maybe");
    submitMafiaVote(game, mafia[0].id, target, "lock");

    transitionToDay(game);
    expect(game.mafiaVotes.size).toBe(0);
    expect(game.mafiaTarget).toBeNull();
    removeGame(game.code);
  });
});
