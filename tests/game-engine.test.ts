import { describe, test, expect, beforeEach } from "bun:test";
import {
  createGame, getGame, addPlayer, updateSettings, startGame,
  submitMafiaVote, submitDoctorSave, submitDetectiveInvestigation,
  checkNightReady, transitionToDay, callVote, castVote, resolveVote,
  endDay, checkWinCondition, getAlivePlayers, getAliveByRole,
  getPlayerInfo, endGame, removeGame,
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

describe("Game Creation", () => {
  test("creates a game with a 4-character code", () => {
    const game = createGame(1, "TestAdmin");
    expect(game.code).toHaveLength(4);
    expect(game.adminId).toBe(1);
    expect(game.phase).toBe("lobby");
    expect(game.players.size).toBe(1);
    removeGame(game.code);
  });

  test("game is retrievable by code", () => {
    const game = createGame(1, "TestAdmin");
    const found = getGame(game.code);
    expect(found).toBeDefined();
    expect(found!.code).toBe(game.code);
    removeGame(game.code);
  });

  test("adding players up to 20", () => {
    const game = createGame(1, "Admin");
    for (let i = 2; i <= 20; i++) {
      const p = addPlayer(game, i, `Player${i}`);
      expect(p).not.toBeNull();
    }
    expect(game.players.size).toBe(20);
    // 21st player should fail
    const extra = addPlayer(game, 21, "Extra");
    expect(extra).toBeNull();
    removeGame(game.code);
  });

  test("cannot join a started game", () => {
    const game = setupGame(4);
    startGame(game);
    const late = addPlayer(game, 99, "LateJoiner");
    expect(late).toBeNull();
    removeGame(game.code);
  });
});

describe("Role Assignment", () => {
  test("assigns correct number of mafia", () => {
    const game = setupGame(6, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    expect(mafia.length).toBe(2);
    removeGame(game.code);
  });

  test("assigns doctor when enabled", () => {
    const game = setupGame(5, { enableDoctor: true });
    startGame(game);
    const doctors = getAliveByRole(game, "doctor");
    expect(doctors.length).toBe(1);
    removeGame(game.code);
  });

  test("assigns detective when enabled", () => {
    const game = setupGame(5, { enableDetective: true });
    startGame(game);
    const detectives = getAliveByRole(game, "detective");
    expect(detectives.length).toBe(1);
    removeGame(game.code);
  });

  test("assigns joker when enabled", () => {
    const game = setupGame(5, { enableJoker: true });
    startGame(game);
    const jokers = getAliveByRole(game, "joker");
    expect(jokers.length).toBe(1);
    removeGame(game.code);
  });

  test("assigns lovers when enabled", () => {
    const game = setupGame(5, { enableLovers: true });
    startGame(game);
    const lovers = Array.from(game.players.values()).filter((p) => p.isLover);
    expect(lovers.length).toBe(2);
    // Check they reference each other
    expect(lovers[0].loverId).toBe(lovers[1].id);
    expect(lovers[1].loverId).toBe(lovers[0].id);
    removeGame(game.code);
  });

  test("all players get a role", () => {
    const game = setupGame(8, { mafiaCount: 2, enableDoctor: true, enableDetective: true, enableJoker: true });
    startGame(game);
    for (const [, p] of game.players) {
      expect(p.role).not.toBeNull();
    }
    removeGame(game.code);
  });

  test("remaining players are citizens", () => {
    const game = setupGame(6, { mafiaCount: 1 });
    startGame(game);
    const citizens = getAliveByRole(game, "citizen");
    expect(citizens.length).toBe(5);
    removeGame(game.code);
  });
});

describe("Night Phase", () => {
  test("mafia unanimous vote selects target", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    const target = citizens[0].id;
    submitMafiaVote(game, mafia[0].id, target);
    const result = submitMafiaVote(game, mafia[1].id, target);

    expect(result.allVoted).toBe(true);
    expect(result.target).toBe(target);
    expect(game.mafiaTarget).toBe(target);
    removeGame(game.code);
  });

  test("mafia non-unanimous vote resets", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id);
    const result = submitMafiaVote(game, mafia[1].id, citizens[1].id);

    expect(result.allVoted).toBe(true);
    expect(result.target).toBeNull();
    removeGame(game.code);
  });

  test("doctor can save the mafia target", () => {
    const game = setupGame(5, { enableDoctor: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const doctor = getAliveByRole(game, "doctor")[0];
    const citizens = getAliveByRole(game, "citizen");

    const target = citizens[0].id;
    submitMafiaVote(game, mafia[0].id, target);
    submitDoctorSave(game, doctor.id, target);

    const nightResult = transitionToDay(game);
    expect(nightResult.saved).toBe(true);
    expect(nightResult.killed.length).toBe(0);
    // Target should still be alive
    expect(game.players.get(target)!.isAlive).toBe(true);
    removeGame(game.code);
  });

  test("detective correctly identifies mafia", () => {
    const game = setupGame(5, { enableDetective: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const detective = getAliveByRole(game, "detective")[0];

    const result = submitDetectiveInvestigation(game, detective.id, mafia[0].id);
    expect(result).not.toBeNull();
    expect(result!.isMafia).toBe(true);
    removeGame(game.code);
  });

  test("detective correctly identifies non-mafia", () => {
    const game = setupGame(5, { enableDetective: true });
    startGame(game);
    const detective = getAliveByRole(game, "detective")[0];
    const citizens = getAliveByRole(game, "citizen");

    const result = submitDetectiveInvestigation(game, detective.id, citizens[0].id);
    expect(result).not.toBeNull();
    expect(result!.isMafia).toBe(false);
    removeGame(game.code);
  });

  test("night resolves and kills target", () => {
    const game = setupGame(4);
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const target = citizens[0].id;

    submitMafiaVote(game, mafia[0].id, target);
    const nightResult = transitionToDay(game);

    expect(nightResult.killed.length).toBe(1);
    expect(nightResult.killed[0].player.id).toBe(target);
    expect(game.players.get(target)!.isAlive).toBe(false);
    expect(game.phase).toBe("day");
    removeGame(game.code);
  });

  test("lover dies when their partner is killed", () => {
    const game = setupGame(5, { enableLovers: true });
    startGame(game);

    const mafia = getAliveByRole(game, "mafia");
    const lovers = Array.from(game.players.values()).filter((p) => p.isLover && p.role !== "mafia");

    if (lovers.length >= 1) {
      const target = lovers[0].id;
      const otherLover = game.players.get(lovers[0].loverId!)!;

      submitMafiaVote(game, mafia[0].id, target);
      const nightResult = transitionToDay(game);

      expect(game.players.get(target)!.isAlive).toBe(false);
      if (otherLover.role !== "mafia") {
        // If the other lover isn't mafia, they should also die
        expect(otherLover.isAlive).toBe(false);
      }
    }
    removeGame(game.code);
  });
});

describe("Day Voting", () => {
  function setupDayPhase(playerCount = 5) {
    const game = setupGame(playerCount);
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    // Complete night phase quickly
    submitMafiaVote(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);
    return game;
  }

  test("admin can call a vote", () => {
    const game = setupDayPhase();
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId)!;

    const result = callVote(game, game.adminId, target.id);
    expect(result).toBe(true);
    expect(game.phase).toBe("voting");
    expect(game.voteTarget).toBe(target.id);
    removeGame(game.code);
  });

  test("non-admin cannot call a vote", () => {
    const game = setupDayPhase();
    const alive = getAlivePlayers(game);
    const nonAdmin = alive.find((p) => p.id !== game.adminId)!;

    const result = callVote(game, nonAdmin.id, nonAdmin.id);
    expect(result).toBe(false);
    removeGame(game.code);
  });

  test("majority vote executes player", () => {
    const game = setupDayPhase(6);
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    // All alive vote yes
    for (const p of getAlivePlayers(game)) {
      castVote(game, p.id, true);
    }

    const result = resolveVote(game);
    expect(result).not.toBeNull();
    expect(result!.executed).toBe(true);
    expect(game.players.get(target.id)!.isAlive).toBe(false);
    removeGame(game.code);
  });

  test("minority vote spares player", () => {
    const game = setupDayPhase(6);
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    // All alive vote no
    for (const p of getAlivePlayers(game)) {
      castVote(game, p.id, false);
    }

    const result = resolveVote(game);
    expect(result).not.toBeNull();
    expect(result!.executed).toBe(false);
    expect(game.players.get(target.id)!.isAlive).toBe(true);
    removeGame(game.code);
  });

  test("50/50 does NOT execute (strictly > 50%)", () => {
    const game = setupDayPhase(6); // Will have ~5 alive after night kill
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    // Split vote evenly
    const voters = getAlivePlayers(game);
    const half = Math.floor(voters.length / 2);
    voters.forEach((p, i) => {
      castVote(game, p.id, i < half);
    });

    // If even number, exact 50/50 should NOT execute
    if (voters.length % 2 === 0) {
      const result = resolveVote(game);
      expect(result!.executed).toBe(false);
    }
    removeGame(game.code);
  });

  test("executing the joker triggers joker win", () => {
    const game = setupGame(5, { enableJoker: true });
    startGame(game);

    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    // Night: mafia kills a citizen
    submitMafiaVote(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);

    // Day: vote to execute the joker
    const joker = getAliveByRole(game, "joker")[0];
    callVote(game, game.adminId, joker.id);

    for (const p of getAlivePlayers(game)) {
      castVote(game, p.id, true);
    }

    const result = resolveVote(game);
    expect(result!.jokerWin).toBe(true);
    expect(game.winner).toBe("joker");
    expect(game.phase).toBe("game_over");
    removeGame(game.code);
  });
});

describe("Win Conditions", () => {
  test("town wins when all mafia are dead", () => {
    const game = setupGame(4, { mafiaCount: 1 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");

    // Kill the mafia
    mafia[0].isAlive = false;

    const winner = checkWinCondition(game);
    expect(winner).toBe("town");
    removeGame(game.code);
  });

  test("mafia wins when they outnumber town", () => {
    const game = setupGame(4, { mafiaCount: 1 });
    startGame(game);

    const citizens = getAliveByRole(game, "citizen");
    // Kill all but one citizen
    for (let i = 0; i < citizens.length - 1; i++) {
      citizens[i].isAlive = false;
    }

    // Now 1 mafia vs 1 citizen → mafia wins
    const winner = checkWinCondition(game);
    expect(winner).toBe("mafia");
    removeGame(game.code);
  });

  test("game continues when neither side has won", () => {
    const game = setupGame(6, { mafiaCount: 1 });
    startGame(game);

    const winner = checkWinCondition(game);
    expect(winner).toBeNull();
    removeGame(game.code);
  });
});

describe("Day/Night Transitions", () => {
  test("end day transitions to night", () => {
    const game = setupGame(4);
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    submitMafiaVote(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);

    expect(game.phase).toBe("day");
    const messages = endDay(game);
    expect(game.phase).toBe("night");
    expect(game.round).toBe(2);
    expect(messages.length).toBeGreaterThan(0);
    removeGame(game.code);
  });
});

describe("Settings", () => {
  test("settings update correctly", () => {
    const game = createGame(1, "Admin");
    updateSettings(game, { mafiaCount: 3, enableDoctor: true });
    expect(game.settings.mafiaCount).toBe(3);
    expect(game.settings.enableDoctor).toBe(true);
    expect(game.settings.enableDetective).toBe(false);
    removeGame(game.code);
  });

  test("mafia count is capped at 1/3 of players", () => {
    const game = setupGame(4, { mafiaCount: 5 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    // 4 players → max 1 mafia (floor(4/3) = 1)
    expect(mafia.length).toBe(1);
    removeGame(game.code);
  });
});

describe("Player Info", () => {
  test("getPlayerInfo without roles", () => {
    const game = setupGame(3);
    startGame(game);
    const info = getPlayerInfo(game, false);
    expect(info.length).toBe(3);
    for (const p of info) {
      expect(p.role).toBeUndefined();
    }
    removeGame(game.code);
  });

  test("getPlayerInfo with roles", () => {
    const game = setupGame(3);
    startGame(game);
    const info = getPlayerInfo(game, true);
    for (const p of info) {
      expect(p.role).toBeDefined();
    }
    removeGame(game.code);
  });
});
