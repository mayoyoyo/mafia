import { describe, test, expect, beforeEach } from "bun:test";
import {
  createGame, getGame, addPlayer, updateSettings, startGame,
  submitMafiaVote, submitDoctorSave, submitDetectiveInvestigation,
  checkNightReady, transitionToDay, advanceNightSubPhase, callVote, castVote, resolveVote,
  cancelVote, endDay, checkWinCondition, getAlivePlayers, getAliveByRole,
  getPlayerInfo, forceEndGame, removeGame, restartGame,
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

// Helper: shortcut to maybe+lock a target (replaces old submitMafiaVote default behavior)
function lockTarget(game: Game, mafiaId: number, targetId: number) {
  submitMafiaVote(game, mafiaId, targetId, "maybe");
  return submitMafiaVote(game, mafiaId, targetId, "lock");
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
    lockTarget(game, mafia[0].id, target);
    const result = lockTarget(game, mafia[1].id, target);

    expect(result.consensus).toBe(true);
    expect(result.target).toBe(target);
    expect(game.mafiaTarget).toBe(target);
    removeGame(game.code);
  });

  test("mafia non-unanimous vote resets", () => {
    const game = setupGame(7, { mafiaCount: 2 });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");

    lockTarget(game, mafia[0].id, citizens[0].id);
    const result = lockTarget(game, mafia[1].id, citizens[1].id);

    expect(result.consensus).toBe(false);
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
    lockTarget(game, mafia[0].id, target);
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

    lockTarget(game, mafia[0].id, target);
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

      lockTarget(game, mafia[0].id, target);
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
    lockTarget(game, mafia[0].id, citizens[0].id);
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
    lockTarget(game, mafia[0].id, citizens[0].id);
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

    lockTarget(game, mafia[0].id, citizens[0].id);
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

describe("Doctor Consecutive Save Restriction", () => {
  test("doctor cannot save the same player two nights in a row", () => {
    const game = setupGame(5, { enableDoctor: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const doctor = getAliveByRole(game, "doctor")[0];
    const citizens = getAliveByRole(game, "citizen");

    // Night 1: doctor saves citizen[0]
    const target = citizens[0].id;
    lockTarget(game, mafia[0].id, citizens[1].id);
    submitDoctorSave(game, doctor.id, target);
    transitionToDay(game);

    // Transition to night 2
    endDay(game);

    // Night 2: doctor tries to save same target — should fail
    const result = submitDoctorSave(game, doctor.id, target);
    expect(result).toBe(false);

    // But can save a different target
    const result2 = submitDoctorSave(game, doctor.id, citizens[2].id);
    expect(result2).toBe(true);
    removeGame(game.code);
  });
});

describe("Game createdAt", () => {
  test("game has createdAt timestamp", () => {
    const before = Date.now();
    const game = createGame(1, "Admin");
    expect(game.createdAt).toBeGreaterThanOrEqual(before);
    expect(game.createdAt).toBeLessThanOrEqual(Date.now());
    removeGame(game.code);
  });

  test("restartGame resets createdAt", () => {
    const game = setupGame(4);
    startGame(game);
    const originalCreatedAt = game.createdAt;

    // Small delay to ensure new timestamp differs
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    lockTarget(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);

    restartGame(game);
    expect(game.createdAt).toBeGreaterThanOrEqual(originalCreatedAt);
    removeGame(game.code);
  });
});

describe("Auto-night after execution", () => {
  function setupDayPhaseForVote(playerCount = 6) {
    const game = setupGame(playerCount);
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    lockTarget(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);
    return game;
  }

  test("execution auto-transitions to night", () => {
    const game = setupDayPhaseForVote();
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;
    const roundBefore = game.round;

    callVote(game, game.adminId, target.id);

    for (const p of getAlivePlayers(game)) {
      castVote(game, p.id, true);
    }

    const result = resolveVote(game);
    expect(result!.executed).toBe(true);
    expect(game.phase).toBe("night");
    expect(game.round).toBe(roundBefore + 1);
    removeGame(game.code);
  });

  test("sparing keeps phase as day", () => {
    const game = setupDayPhaseForVote();
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    for (const p of getAlivePlayers(game)) {
      castVote(game, p.id, false);
    }

    const result = resolveVote(game);
    expect(result!.executed).toBe(false);
    expect(game.phase).toBe("day");
    removeGame(game.code);
  });
});

describe("Early Vote Resolution", () => {
  function setupVoting(playerCount = 7) {
    const game = setupGame(playerCount);
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    lockTarget(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);
    return game;
  }

  test("majority for triggers early resolve (non-anonymous)", () => {
    const game = setupVoting(7);
    game.voteAnonymous = false;
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    // Vote yes until majority reached
    const voters = getAlivePlayers(game);
    const majority = Math.floor(voters.length / 2) + 1;
    let earlyResult = { allVoted: false, earlyResolve: false };
    for (let i = 0; i < majority; i++) {
      earlyResult = castVote(game, voters[i].id, true);
    }

    expect(earlyResult.earlyResolve).toBe(true);
    expect(earlyResult.allVoted).toBe(false);
    removeGame(game.code);
  });

  test("impossible to pass triggers early spare (non-anonymous)", () => {
    const game = setupVoting(7);
    game.voteAnonymous = false;
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    // Vote no until impossible to reach majority
    const voters = getAlivePlayers(game);
    const totalAlive = voters.length;
    const noNeeded = Math.ceil(totalAlive / 2);
    let earlyResult = { allVoted: false, earlyResolve: false };
    for (let i = 0; i < noNeeded; i++) {
      earlyResult = castVote(game, voters[i].id, false);
    }

    expect(earlyResult.earlyResolve).toBe(true);
    expect(earlyResult.allVoted).toBe(false);
    removeGame(game.code);
  });

  test("no early resolve in anonymous mode", () => {
    const game = setupVoting(7);
    game.voteAnonymous = true;
    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;

    callVote(game, game.adminId, target.id);

    const voters = getAlivePlayers(game);
    const majority = Math.floor(voters.length / 2) + 1;
    let earlyResult = { allVoted: false, earlyResolve: false };
    for (let i = 0; i < majority; i++) {
      earlyResult = castVote(game, voters[i].id, true);
    }

    expect(earlyResult.earlyResolve).toBe(false);
    removeGame(game.code);
  });
});

describe("Cancel Vote", () => {
  test("admin can cancel an active vote", () => {
    const game = setupGame(5);
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    lockTarget(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);

    const alive = getAlivePlayers(game);
    const target = alive.find((p) => p.id !== game.adminId && p.role !== "mafia")!;
    callVote(game, game.adminId, target.id);
    expect(game.phase).toBe("voting");

    const cancelled = cancelVote(game, game.adminId);
    expect(cancelled).toBe(true);
    expect(game.phase).toBe("day");
    expect(game.voteTarget).toBeNull();
    removeGame(game.code);
  });
});

describe("Joker Execution with Lovers", () => {
  test("joker is marked dead when executed", () => {
    const game = setupGame(5, { enableJoker: true });
    startGame(game);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    const joker = getAliveByRole(game, "joker")[0];

    lockTarget(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);

    callVote(game, game.adminId, joker.id);
    for (const p of getAlivePlayers(game)) castVote(game, p.id, true);
    const result = resolveVote(game);

    expect(result!.jokerWin).toBe(true);
    expect(game.winner).toBe("joker");
    expect(joker.isAlive).toBe(false);
    removeGame(game.code);
  });

  test("joker execution kills their lover via heartbreak", () => {
    const game = setupGame(5, { enableJoker: true, enableLovers: true });
    startGame(game);

    const players = Array.from(game.players.values());
    for (const p of players) { p.role = "citizen"; p.isLover = false; p.loverId = null; }
    players[0].role = "mafia";
    players[1].role = "joker";
    players[2].role = "citizen";
    players[3].role = "citizen";
    players[4].role = "citizen";
    // Joker and citizen are lovers
    players[1].isLover = true; players[1].loverId = players[2].id;
    players[2].isLover = true; players[2].loverId = players[1].id;

    game.phase = "night";
    game.round = 1;
    lockTarget(game, players[0].id, players[3].id);
    transitionToDay(game);

    callVote(game, game.adminId, players[1].id);
    for (const p of getAlivePlayers(game)) castVote(game, p.id, true);
    const result = resolveVote(game);

    expect(result!.jokerWin).toBe(true);
    expect(players[1].isAlive).toBe(false); // joker dead
    expect(players[2].isAlive).toBe(false); // lover dead from heartbreak
    expect(result!.killed.length).toBe(2);  // joker + lover
    removeGame(game.code);
  });
});

describe("Room Lifecycle", () => {
  test("createGame initializes forceEnded as false", () => {
    const game = createGame(1, "Admin");
    expect(game.forceEnded).toBe(false);
    removeGame(game.code);
  });

  test("forceEndGame sets phase to game_over and forceEnded to true but keeps game in map", () => {
    const game = setupGame(4);
    startGame(game);
    const code = game.code;

    forceEndGame(game);

    expect(game.phase).toBe("game_over");
    expect(game.forceEnded).toBe(true);
    // Game should still be in the map
    expect(getGame(code)).toBeDefined();
    removeGame(game.code);
  });

  test("removeGame actually deletes the game from the map", () => {
    const game = createGame(1, "Admin");
    const code = game.code;
    expect(getGame(code)).toBeDefined();

    removeGame(code);
    expect(getGame(code)).toBeUndefined();
  });

  test("restartGame resets forceEnded to false", () => {
    const game = setupGame(4);
    startGame(game);

    forceEndGame(game);
    expect(game.forceEnded).toBe(true);

    restartGame(game);
    expect(game.forceEnded).toBe(false);
    expect(game.phase).toBe("night"); // restarted into active game
    removeGame(game.code);
  });
});

describe("advanceNightSubPhase", () => {
  function setupNightGame(playerCount: number, settings?: Partial<import("../src/types").GameSettings>): Game {
    const game = setupGame(playerCount, settings);
    startGame(game);
    expect(game.phase).toBe("night");
    expect(game.nightSubPhase).toBe("mafia");
    return game;
  }

  test("mafia → doctor (doctor alive + enabled) returns isFake: false", () => {
    const game = setupNightGame(5, { enableDoctor: true });
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("doctor");
    expect(result.isFake).toBe(false);
    expect(game.nightSubPhase).toBe("doctor");
    removeGame(game.code);
  });

  test("mafia → doctor (doctor dead + enabled) returns isFake: true", () => {
    const game = setupNightGame(5, { enableDoctor: true });
    const doctor = getAliveByRole(game, "doctor")[0];
    doctor.isAlive = false; // simulate dead
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("doctor");
    expect(result.isFake).toBe(true);
    expect(game.nightSubPhase).toBe("doctor");
    removeGame(game.code);
  });

  test("mafia → detective (doctor disabled, detective alive)", () => {
    const game = setupNightGame(5, { enableDoctor: false, enableDetective: true });
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("detective");
    expect(result.isFake).toBe(false);
    expect(game.nightSubPhase).toBe("detective");
    removeGame(game.code);
  });

  test("mafia → resolving (both disabled)", () => {
    const game = setupNightGame(4, { enableDoctor: false, enableDetective: false });
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("resolving");
    expect(result.isFake).toBe(false);
    expect(game.nightSubPhase).toBe("resolving");
    removeGame(game.code);
  });

  test("doctor → detective (detective alive) returns isFake: false", () => {
    const game = setupNightGame(6, { enableDoctor: true, enableDetective: true });
    game.nightSubPhase = "doctor"; // simulate already on doctor
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("detective");
    expect(result.isFake).toBe(false);
    removeGame(game.code);
  });

  test("doctor → detective (detective dead + enabled) returns isFake: true", () => {
    const game = setupNightGame(6, { enableDoctor: true, enableDetective: true });
    game.nightSubPhase = "doctor";
    const detective = getAliveByRole(game, "detective")[0];
    detective.isAlive = false;
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("detective");
    expect(result.isFake).toBe(true);
    removeGame(game.code);
  });

  test("doctor → resolving (detective disabled)", () => {
    const game = setupNightGame(5, { enableDoctor: true, enableDetective: false });
    game.nightSubPhase = "doctor";
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("resolving");
    expect(result.isFake).toBe(false);
    removeGame(game.code);
  });

  test("detective → resolving", () => {
    const game = setupNightGame(5, { enableDetective: true });
    game.nightSubPhase = "detective";
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("resolving");
    expect(result.isFake).toBe(false);
    removeGame(game.code);
  });

  test("startGame initializes nightSubPhase to mafia", () => {
    const game = setupGame(4);
    startGame(game);
    expect(game.nightSubPhase).toBe("mafia");
    removeGame(game.code);
  });

  test("transitionToDay resets nightSubPhase to null", () => {
    const game = setupNightGame(4);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    submitMafiaVote(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);
    expect(game.nightSubPhase).toBeNull();
    removeGame(game.code);
  });

  test("endDay sets nightSubPhase to mafia", () => {
    const game = setupNightGame(4);
    const mafia = getAliveByRole(game, "mafia");
    const citizens = getAliveByRole(game, "citizen");
    submitMafiaVote(game, mafia[0].id, citizens[0].id);
    transitionToDay(game);
    endDay(game);
    expect(game.nightSubPhase).toBe("mafia");
    removeGame(game.code);
  });

  test("restartGame sets nightSubPhase to mafia", () => {
    const game = setupNightGame(4);
    restartGame(game);
    expect(game.nightSubPhase).toBe("mafia");
    removeGame(game.code);
  });
});

describe("Lover Death Broadcast", () => {
  // Helper: set up a game with deterministic lover pairing
  function setupLoversGame(playerCount = 6) {
    const game = setupGame(playerCount, { enableLovers: true });
    startGame(game);

    // Override random assignment for deterministic tests
    const players = Array.from(game.players.values());
    for (const p of players) { p.isLover = false; p.loverId = null; }

    // Make the first two non-mafia players lovers
    const nonMafia = players.filter(p => p.role !== "mafia");
    nonMafia[0].isLover = true;
    nonMafia[0].loverId = nonMafia[1].id;
    nonMafia[1].isLover = true;
    nonMafia[1].loverId = nonMafia[0].id;

    return { game, loverA: nonMafia[0], loverB: nonMafia[1], mafia: players.filter(p => p.role === "mafia") };
  }

  test("night kill of a lover produces two killed entries in correct order", () => {
    const { game, loverA, loverB, mafia } = setupLoversGame();

    lockTarget(game, mafia[0].id, loverA.id);
    const nightResult = transitionToDay(game);

    expect(nightResult.killed.length).toBe(2);
    // First entry: the mafia target (direct kill)
    expect(nightResult.killed[0].player.id).toBe(loverA.id);
    // Second entry: the lover who died of heartbreak
    expect(nightResult.killed[1].player.id).toBe(loverB.id);
    expect(nightResult.killed[1].player.isLover).toBe(true);
    removeGame(game.code);
  });

  test("heartbreak death is second in killed array (isLoverDeath flag relies on index > 0)", () => {
    const { game, loverA, loverB, mafia } = setupLoversGame();

    // Kill loverB (the other lover) to verify order is always target-first
    lockTarget(game, mafia[0].id, loverB.id);
    const nightResult = transitionToDay(game);

    expect(nightResult.killed.length).toBe(2);
    expect(nightResult.killed[0].player.id).toBe(loverB.id); // mafia target
    expect(nightResult.killed[1].player.id).toBe(loverA.id); // heartbreak
    removeGame(game.code);
  });

  test("night lover death records lover_death event type", () => {
    const { game, loverA, loverB, mafia } = setupLoversGame();

    lockTarget(game, mafia[0].id, loverA.id);
    transitionToDay(game);

    const loverDeathEvent = game.eventHistory.find(e => e.type === "lover_death");
    expect(loverDeathEvent).toBeDefined();
    expect(loverDeathEvent!.playerName).toBe(loverB.username);
    removeGame(game.code);
  });

  test("killing a non-lover produces only one killed entry", () => {
    const { game, mafia } = setupLoversGame();

    // Find a non-lover citizen
    const nonLover = Array.from(game.players.values()).find(
      p => p.role !== "mafia" && !p.isLover
    )!;

    lockTarget(game, mafia[0].id, nonLover.id);
    const nightResult = transitionToDay(game);

    expect(nightResult.killed.length).toBe(1);
    expect(nightResult.killed[0].player.id).toBe(nonLover.id);
    // No lover_death event
    const loverDeathEvent = game.eventHistory.find(e => e.type === "lover_death");
    expect(loverDeathEvent).toBeUndefined();
    removeGame(game.code);
  });

  test("doctor saving a lover prevents both deaths (no heartbreak)", () => {
    const game = setupGame(6, { enableLovers: true, enableDoctor: true });
    startGame(game);

    const players = Array.from(game.players.values());
    for (const p of players) { p.isLover = false; p.loverId = null; }

    const nonMafia = players.filter(p => p.role !== "mafia" && p.role !== "doctor");
    nonMafia[0].isLover = true;
    nonMafia[0].loverId = nonMafia[1].id;
    nonMafia[1].isLover = true;
    nonMafia[1].loverId = nonMafia[0].id;

    const mafia = players.filter(p => p.role === "mafia");
    const doctor = players.find(p => p.role === "doctor")!;

    // Mafia targets lover, doctor saves them
    lockTarget(game, mafia[0].id, nonMafia[0].id);
    submitDoctorSave(game, doctor.id, nonMafia[0].id);
    const nightResult = transitionToDay(game);

    expect(nightResult.saved).toBe(true);
    expect(nightResult.killed.length).toBe(0);
    expect(nonMafia[0].isAlive).toBe(true);
    expect(nonMafia[1].isAlive).toBe(true);
    removeGame(game.code);
  });

  test("execution of a lover produces heartbreak as second killed entry", () => {
    const game = setupGame(6, { enableLovers: true });
    startGame(game);

    const players = Array.from(game.players.values());
    for (const p of players) { p.isLover = false; p.loverId = null; }

    const mafia = players.filter(p => p.role === "mafia");
    const nonMafia = players.filter(p => p.role !== "mafia");
    nonMafia[0].isLover = true;
    nonMafia[0].loverId = nonMafia[1].id;
    nonMafia[1].isLover = true;
    nonMafia[1].loverId = nonMafia[0].id;

    // Complete night to get to day
    const nonLover = nonMafia.find(p => !p.isLover)!;
    lockTarget(game, mafia[0].id, nonLover.id);
    transitionToDay(game);

    // Execute loverA
    callVote(game, game.adminId, nonMafia[0].id);
    for (const p of getAlivePlayers(game)) castVote(game, p.id, true);
    const result = resolveVote(game);

    expect(result).not.toBeNull();
    expect(result!.executed).toBe(true);
    expect(result!.killed.length).toBe(2);
    // First: executed player
    expect(result!.killed[0].player.id).toBe(nonMafia[0].id);
    // Second: lover heartbreak
    expect(result!.killed[1].player.id).toBe(nonMafia[1].id);
    expect(result!.killed[1].player.isLover).toBe(true);

    // Event history records both
    const execEvent = game.eventHistory.find(e => e.type === "execution" && e.playerName === nonMafia[0].username);
    const loverEvent = game.eventHistory.find(e => e.type === "lover_death" && e.playerName === nonMafia[1].username);
    expect(execEvent).toBeDefined();
    expect(loverEvent).toBeDefined();
    removeGame(game.code);
  });

  test("lover death message includes both lover names", () => {
    const { game, loverA, loverB, mafia } = setupLoversGame();

    lockTarget(game, mafia[0].id, loverA.id);
    const nightResult = transitionToDay(game);

    // The heartbreak death message should include the heartbreak lover's name
    const heartbreakMsg = nightResult.killed[1].message;
    expect(heartbreakMsg).toContain(loverB.username);
    removeGame(game.code);
  });

  test("already-dead lover does not die again", () => {
    const { game, loverA, loverB, mafia } = setupLoversGame();

    // Kill loverB manually first
    loverB.isAlive = false;

    lockTarget(game, mafia[0].id, loverA.id);
    const nightResult = transitionToDay(game);

    // Only the mafia target dies, no heartbreak (lover already dead)
    expect(nightResult.killed.length).toBe(1);
    expect(nightResult.killed[0].player.id).toBe(loverA.id);
    removeGame(game.code);
  });
});
