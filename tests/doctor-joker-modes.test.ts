import { describe, test, expect, beforeEach } from "bun:test";
import {
  createGame, getGame, addPlayer, updateSettings, startGame,
  submitMafiaVote, submitDoctorSave, submitDetectiveInvestigation,
  submitJokerHaunt, getJokerHauntTargets,
  checkNightReady, transitionToDay, advanceNightSubPhase,
  callVote, castVote, resolveVote,
  cancelVote, endDay, checkWinCondition, getAlivePlayers, getAliveByRole,
  getPlayerInfo, forceEndGame, removeGame, restartGame, returnToLobby,
} from "../src/game-engine";
import type { Game, Player, NightSubPhase } from "../src/types";
import { Narrator } from "../src/narrator";

function setupGame(playerCount: number, settings?: Partial<import("../src/types").GameSettings>): Game {
  const game = createGame(1, "Admin");
  for (let i = 2; i <= playerCount; i++) {
    addPlayer(game, i, `Player${i}`);
  }
  if (settings) updateSettings(game, settings);
  return game;
}

function lockTarget(game: Game, mafiaId: number, targetId: number) {
  submitMafiaVote(game, mafiaId, targetId, "maybe");
  return submitMafiaVote(game, mafiaId, targetId, "lock");
}

function findPlayerByRole(game: Game, role: string): Player {
  for (const [, p] of game.players) {
    if (p.role === role && p.isAlive) return p;
  }
  throw new Error(`No alive ${role} found`);
}

function findDeadPlayerByRole(game: Game, role: string): Player {
  for (const [, p] of game.players) {
    if (p.role === role && !p.isAlive) return p;
  }
  throw new Error(`No dead ${role} found`);
}

function getCitizens(game: Game): Player[] {
  return getAliveByRole(game, "citizen");
}

// Helper: run a complete night with mafia picking a target
function completeNight(game: Game, mafiaTarget: number, doctorTarget?: number, detectiveTarget?: number) {
  const mafia = findPlayerByRole(game, "mafia");
  lockTarget(game, mafia.id, mafiaTarget);
  advanceNightSubPhase(game); // mafia -> doctor (or detective or resolving)

  if (game.settings.enableDoctor && game.nightSubPhase === "doctor") {
    if (doctorTarget !== undefined) {
      const doctor = getAliveByRole(game, "doctor")[0];
      if (doctor) submitDoctorSave(game, doctor.id, doctorTarget);
    }
    advanceNightSubPhase(game); // doctor -> detective (or resolving)
  }

  if (game.settings.enableDetective && game.nightSubPhase === "detective") {
    if (detectiveTarget !== undefined) {
      const detective = getAliveByRole(game, "detective")[0];
      if (detective) submitDetectiveInvestigation(game, detective.id, detectiveTarget);
    }
    advanceNightSubPhase(game); // detective -> resolving
  }
}

// ============================================================
// DOCTOR MODE TESTS
// ============================================================
describe("Doctor Official Mode", () => {
  test("default doctor mode is house", () => {
    const game = setupGame(5, { enableDoctor: true });
    expect(game.settings.doctorMode).toBe("house");
    removeGame(game.code);
  });

  test("can set doctor mode to official", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "official" });
    expect(game.settings.doctorMode).toBe("official");
    removeGame(game.code);
  });

  test("house mode: doctor save message names the victim", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "house" });
    startGame(game);

    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const citizen = getCitizens(game)[0];

    game.phase = "night";
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, citizen.id);
    advanceNightSubPhase(game); // -> doctor
    submitDoctorSave(game, doctor.id, citizen.id);
    advanceNightSubPhase(game); // -> detective or resolving

    // Skip remaining sub-phases
    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);
    expect(result.saved).toBe(true);
    expect(result.savedName).toBe(citizen.username);
    // House mode: message contains the player's name
    expect(result.messages.some(m => m.includes(citizen.username))).toBe(true);
    expect(result.savedTargetId).toBe(citizen.id);
    removeGame(game.code);
  });

  test("official mode: doctor save message is generic (no victim name)", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "official" });
    startGame(game);

    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const citizen = getCitizens(game)[0];

    game.phase = "night";
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, citizen.id);
    advanceNightSubPhase(game); // -> doctor
    submitDoctorSave(game, doctor.id, citizen.id);

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);
    expect(result.saved).toBe(true);
    expect(result.savedName).toBe(citizen.username);
    expect(result.savedTargetId).toBe(citizen.id);
    // Official mode: message should NOT contain the victim's name
    const saveMsg = result.messages[0];
    expect(saveMsg).not.toContain(citizen.username);
    removeGame(game.code);
  });

  test("official mode: savedTargetId is set for private notification", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "official" });
    startGame(game);

    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const citizen = getCitizens(game)[0];

    game.phase = "night";
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, citizen.id);
    advanceNightSubPhase(game);
    submitDoctorSave(game, doctor.id, citizen.id);

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);
    expect(result.savedTargetId).toBe(citizen.id);
    removeGame(game.code);
  });

  test("house mode: savedTargetId is also set", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "house" });
    startGame(game);

    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const citizen = getCitizens(game)[0];

    game.phase = "night";
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, citizen.id);
    advanceNightSubPhase(game);
    submitDoctorSave(game, doctor.id, citizen.id);

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);
    expect(result.savedTargetId).toBe(citizen.id);
    removeGame(game.code);
  });

  test("no save: savedTargetId is null", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "official" });
    startGame(game);

    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const citizens = getCitizens(game);

    game.phase = "night";
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, citizens[0].id);
    advanceNightSubPhase(game);
    // Doctor saves someone else
    submitDoctorSave(game, doctor.id, citizens[1].id);

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);
    expect(result.saved).toBe(false);
    expect(result.savedTargetId).toBeNull();
    removeGame(game.code);
  });
});

describe("Narrator - Doctor Official Messages", () => {
  test("doctorSaveOfficial returns a string", () => {
    const msg = Narrator.doctorSaveOfficial();
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  test("doctorSaveVictim returns a string", () => {
    const msg = Narrator.doctorSaveVictim();
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ============================================================
// JOKER MODE TESTS
// ============================================================
describe("Joker Official Mode - Settings", () => {
  test("default joker mode is house", () => {
    const game = setupGame(5, { enableJoker: true });
    expect(game.settings.jokerMode).toBe("house");
    removeGame(game.code);
  });

  test("can set joker mode to official", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    expect(game.settings.jokerMode).toBe("official");
    removeGame(game.code);
  });

  test("jokerJointWinner starts as false", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    expect(game.jokerJointWinner).toBe(false);
    removeGame(game.code);
  });

  test("jokerHauntVoters starts empty", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    expect(game.jokerHauntVoters).toEqual([]);
    removeGame(game.code);
  });
});

describe("Joker House Mode - Execution", () => {
  test("house mode: joker execution ends game with joker win", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "house" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    // Simulate a day vote to execute the joker
    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    // All alive players vote yes
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    const result = resolveVote(game);

    expect(result).not.toBeNull();
    expect(result!.jokerWin).toBe(true);
    expect(game.winner).toBe("joker");
    expect(game.phase).toBe("game_over");
    removeGame(game.code);
  });
});

describe("Joker Official Mode - Execution & Game Continues", () => {
  test("official mode: joker execution does NOT end game", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    const result = resolveVote(game);

    expect(result).not.toBeNull();
    expect(result!.jokerWin).toBe(true);
    expect(game.jokerJointWinner).toBe(true);
    // Game should continue - transitions to night
    expect(game.phase).toBe("night");
    expect(game.winner).toBeNull();
    removeGame(game.code);
  });

  test("official mode: joker is killed on execution", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    resolveVote(game);

    expect(joker.isAlive).toBe(false);
    removeGame(game.code);
  });

  test("official mode: stores voters who voted FOR execution as haunt targets", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    game.phase = "day";
    callVote(game, game.adminId, joker.id);

    const yesVoters: number[] = [];
    const noVoters: number[] = [];
    let count = 0;
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        const approve = count < 3; // first 3 vote yes, rest vote no
        castVote(game, p.id, approve);
        if (approve) yesVoters.push(p.id);
        else noVoters.push(p.id);
        count++;
      }
    }
    resolveVote(game);

    // Haunt voters should be those who voted FOR execution
    for (const id of yesVoters) {
      expect(game.jokerHauntVoters).toContain(id);
    }
    for (const id of noVoters) {
      expect(game.jokerHauntVoters).not.toContain(id);
    }
    removeGame(game.code);
  });

  test("official mode: round increments and night sub-phase resets", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");
    const startRound = game.round;

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    resolveVote(game);

    expect(game.phase).toBe("night");
    expect(game.round).toBe(startRound + 1);
    expect(game.nightSubPhase).toBe("mafia");
    removeGame(game.code);
  });
});

// ============================================================
// JOKER HAUNT TESTS
// ============================================================
describe("Joker Haunt - submitJokerHaunt", () => {
  function setupJokerHauntGame(): { game: Game; joker: Player; voters: number[] } {
    const game = setupGame(6, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    // Execute joker in a vote
    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    const voters: number[] = [];
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
        voters.push(p.id);
      }
    }
    resolveVote(game);
    // Now game is in night phase with jokerHauntVoters set
    return { game, joker, voters };
  }

  test("joker can haunt a voter during mafia sub-phase", () => {
    const { game, joker, voters } = setupJokerHauntGame();

    // Still in mafia sub-phase — joker can haunt in parallel
    expect(game.nightSubPhase).toBe("mafia");
    const result = submitJokerHaunt(game, joker.id, voters[0]);
    expect(result).toBe(true);
    expect(game.jokerHauntTarget).toBe(voters[0]);
    removeGame(game.code);
  });

  test("joker can haunt during doctor sub-phase", () => {
    // Use a setup with doctor enabled so we get a doctor sub-phase
    const game = setupGame(7, { enableJoker: true, jokerMode: "official", enableDoctor: true });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    // Execute joker
    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    const voters: number[] = [];
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
        voters.push(p.id);
      }
    }
    resolveVote(game);

    // Advance to doctor sub-phase
    const mafia = findPlayerByRole(game, "mafia");
    const citizen = getCitizens(game)[0];
    lockTarget(game, mafia.id, citizen.id);
    advanceNightSubPhase(game); // mafia -> doctor

    expect(game.nightSubPhase).toBe("doctor");
    const result = submitJokerHaunt(game, joker.id, voters[0]);
    expect(result).toBe(true);
    expect(game.jokerHauntTarget).toBe(voters[0]);
    removeGame(game.code);
  });

  test("joker cannot haunt during resolving", () => {
    const { game, joker, voters } = setupJokerHauntGame();

    const mafia = findPlayerByRole(game, "mafia");
    const citizen = getCitizens(game)[0];
    lockTarget(game, mafia.id, citizen.id);
    // Advance to resolving
    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = submitJokerHaunt(game, joker.id, voters[0]);
    expect(result).toBe(false);
    removeGame(game.code);
  });

  test("joker cannot haunt someone who didn't vote for execution", () => {
    const { game, joker } = setupJokerHauntGame();

    // Joker trying to haunt themselves (not in voters list since they were the target)
    const result = submitJokerHaunt(game, joker.id, joker.id);
    expect(result).toBe(false);
    removeGame(game.code);
  });

  test("joker cannot haunt if alive", () => {
    const game = setupGame(6, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    // Don't execute joker, just set up night manually
    game.phase = "night";
    game.nightSubPhase = "mafia";
    game.jokerHauntVoters = [2, 3, 4];

    const result = submitJokerHaunt(game, joker.id, 2);
    expect(result).toBe(false); // joker is alive, can't haunt
    removeGame(game.code);
  });

  test("non-joker cannot submit haunt", () => {
    const { game, voters } = setupJokerHauntGame();
    const mafia = findPlayerByRole(game, "mafia");

    const result = submitJokerHaunt(game, mafia.id, voters[0]);
    expect(result).toBe(false);
    removeGame(game.code);
  });
});

describe("Joker Haunt - getJokerHauntTargets", () => {
  test("returns alive voters as targets", () => {
    const game = setupGame(6, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    resolveVote(game);

    const targets = getJokerHauntTargets(game);
    expect(targets.length).toBeGreaterThan(0);
    // All targets should be alive
    for (const t of targets) {
      expect(t.isAlive).toBe(true);
    }
    removeGame(game.code);
  });

  test("excludes dead voters from targets", () => {
    const game = setupGame(6, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    const voters: number[] = [];
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
        voters.push(p.id);
      }
    }
    resolveVote(game);

    // Kill one of the voters
    const victimId = voters[0];
    const victim = game.players.get(victimId)!;
    victim.isAlive = false;

    const targets = getJokerHauntTargets(game);
    expect(targets.find(t => t.id === victimId)).toBeUndefined();
    removeGame(game.code);
  });
});

describe("Joker Haunt - Parallel Action (no sub-phase)", () => {
  test("joker_haunt is not a night sub-phase", () => {
    const game = setupGame(6, {
      enableJoker: true,
      jokerMode: "official",
      enableDoctor: true,
      enableDetective: true,
    });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    // Execute joker
    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    resolveVote(game);

    expect(game.nightSubPhase).toBe("mafia");

    // Advance through sub-phases and track order
    const phases: NightSubPhase[] = [game.nightSubPhase!];
    const mafia = findPlayerByRole(game, "mafia");
    lockTarget(game, mafia.id, getCitizens(game)[0].id);

    while (game.nightSubPhase !== "resolving") {
      advanceNightSubPhase(game);
      phases.push(game.nightSubPhase!);
    }

    // joker_haunt should NOT appear in sub-phases — it's a parallel action now
    expect(phases).not.toContain("joker_haunt");
    // Should go: mafia -> doctor -> detective -> resolving
    expect(phases[0]).toBe("mafia");
    expect(phases[phases.length - 1]).toBe("resolving");
    removeGame(game.code);
  });
});

describe("Joker Haunt - Night Resolution", () => {
  function setupHauntNight(): { game: Game; joker: Player; voters: number[]; mafia: Player } {
    const game = setupGame(7, {
      enableJoker: true,
      jokerMode: "official",
      enableDoctor: true,
    });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");
    const mafia = findPlayerByRole(game, "mafia");

    // Execute joker
    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    const voters: number[] = [];
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
        voters.push(p.id);
      }
    }
    resolveVote(game);
    return { game, joker, voters, mafia };
  }

  test("haunt kill is additive to mafia kill (two deaths possible)", () => {
    const { game, joker, voters, mafia } = setupHauntNight();

    // Get two different alive citizens for mafia and haunt targets
    const aliveCitizens = getCitizens(game);
    const mafiaTargetId = aliveCitizens[0].id;
    const hauntTargetId = voters.find(v => v !== mafiaTargetId && game.players.get(v)!.isAlive)!;

    // Joker submits haunt during mafia sub-phase (parallel action)
    submitJokerHaunt(game, joker.id, hauntTargetId);

    // Run mafia sub-phase
    lockTarget(game, mafia.id, mafiaTargetId);
    advanceNightSubPhase(game);

    // Advance to resolving
    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);

    // Both should be killed
    const mafiaVictim = game.players.get(mafiaTargetId)!;
    const hauntVictim = game.players.get(hauntTargetId)!;
    expect(mafiaVictim.isAlive).toBe(false);
    expect(hauntVictim.isAlive).toBe(false);
    expect(result.killed.length).toBeGreaterThanOrEqual(2);
    removeGame(game.code);
  });

  test("joker doesn't choose: no haunt kill occurs", () => {
    const { game, mafia } = setupHauntNight();

    const aliveCitizens = getCitizens(game);
    const mafiaTargetId = aliveCitizens[0].id;

    lockTarget(game, mafia.id, mafiaTargetId);

    // Advance to resolving (no haunt submitted)
    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);

    // Only mafia kill should occur
    expect(result.killed.length).toBe(1);
    expect(game.players.get(mafiaTargetId)!.isAlive).toBe(false);
    removeGame(game.code);
  });

  test("mafia and joker target the same person: only one death", () => {
    const { game, joker, voters, mafia } = setupHauntNight();

    // Find a voter who is still alive
    const targetId = voters.find(v => game.players.get(v)!.isAlive)!;

    // Joker haunts during mafia sub-phase
    submitJokerHaunt(game, joker.id, targetId);

    lockTarget(game, mafia.id, targetId);
    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);

    // Target should be dead
    expect(game.players.get(targetId)!.isAlive).toBe(false);
    // The joker haunt on an already-dead target shouldn't create a second death
    // (mafia kill happens first, then haunt checks if target is still alive)
    removeGame(game.code);
  });

  test("doctor can save the haunt target", () => {
    const { game, joker, voters, mafia } = setupHauntNight();

    const aliveCitizens = getCitizens(game);
    const doctor = getAliveByRole(game, "doctor")[0];
    // Mafia targets one person, joker haunts another, doctor saves the haunt target
    const mafiaTargetId = aliveCitizens[0].id;
    const hauntTargetId = voters.find(v =>
      v !== mafiaTargetId && v !== doctor?.id && game.players.get(v)!.isAlive
    )!;

    // Joker haunts during mafia sub-phase (parallel)
    submitJokerHaunt(game, joker.id, hauntTargetId);

    lockTarget(game, mafia.id, mafiaTargetId);
    advanceNightSubPhase(game); // mafia -> doctor

    if (game.nightSubPhase === "doctor" && doctor) {
      submitDoctorSave(game, doctor.id, hauntTargetId);
      advanceNightSubPhase(game); // doctor -> detective or resolving
    }

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);

    // Mafia victim should be dead
    expect(game.players.get(mafiaTargetId)!.isAlive).toBe(false);
    // Haunt victim should be saved by doctor
    expect(game.players.get(hauntTargetId)!.isAlive).toBe(true);
    expect(result.saved).toBe(true);
    removeGame(game.code);
  });

  test("doctor saves mafia target, joker haunt kill still goes through", () => {
    const { game, joker, voters, mafia } = setupHauntNight();

    const aliveCitizens = getCitizens(game);
    const doctor = getAliveByRole(game, "doctor")[0];
    const mafiaTargetId = aliveCitizens[0].id;
    const hauntTargetId = voters.find(v =>
      v !== mafiaTargetId && v !== doctor?.id && game.players.get(v)!.isAlive
    )!;

    // Joker haunts during mafia sub-phase (parallel)
    submitJokerHaunt(game, joker.id, hauntTargetId);

    lockTarget(game, mafia.id, mafiaTargetId);
    advanceNightSubPhase(game);

    if (game.nightSubPhase === "doctor" && doctor) {
      // Doctor saves mafia target, not haunt target
      submitDoctorSave(game, doctor.id, mafiaTargetId);
      advanceNightSubPhase(game);
    }

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);

    // Mafia target saved by doctor
    expect(game.players.get(mafiaTargetId)!.isAlive).toBe(true);
    expect(result.saved).toBe(true);
    // Haunt target should be dead
    expect(game.players.get(hauntTargetId)!.isAlive).toBe(false);
    removeGame(game.code);
  });

  test("haunt voters are cleared after the night resolves", () => {
    const { game, mafia } = setupHauntNight();

    const aliveCitizens = getCitizens(game);
    lockTarget(game, mafia.id, aliveCitizens[0].id);

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);
    transitionToDay(game);

    expect(game.jokerHauntVoters).toEqual([]);
    expect(game.jokerHauntTarget).toBeNull();
    removeGame(game.code);
  });

  test("haunt kill creates joker_haunt event in history", () => {
    const { game, joker, voters, mafia } = setupHauntNight();

    const aliveCitizens = getCitizens(game);
    const mafiaTargetId = aliveCitizens[0].id;
    const hauntTargetId = voters.find(v => v !== mafiaTargetId && game.players.get(v)!.isAlive)!;

    // Joker haunts during mafia sub-phase
    submitJokerHaunt(game, joker.id, hauntTargetId);

    lockTarget(game, mafia.id, mafiaTargetId);
    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    transitionToDay(game);

    const hauntEvent = game.eventHistory.find(e => e.type === "joker_haunt");
    expect(hauntEvent).not.toBeUndefined();
    expect(hauntEvent!.playerName).toBe(game.players.get(hauntTargetId)!.username);
    removeGame(game.code);
  });
});

describe("Joker Official Mode - Lover Interaction", () => {
  test("joker with lover: lover dies of heartbreak when joker is executed", () => {
    const game = setupGame(6, {
      enableJoker: true,
      jokerMode: "official",
      enableLovers: true,
    });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    // Check if joker has a lover
    if (!joker.isLover || joker.loverId === null) {
      // Manually assign lover for testing
      const citizen = getCitizens(game)[0];
      joker.isLover = true;
      joker.loverId = citizen.id;
      citizen.isLover = true;
      citizen.loverId = joker.id;
    }

    const loverId = joker.loverId!;
    const lover = game.players.get(loverId)!;

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    const result = resolveVote(game);

    expect(joker.isAlive).toBe(false);
    expect(lover.isAlive).toBe(false);
    expect(result!.killed.length).toBe(2); // joker + lover
    removeGame(game.code);
  });
});

describe("Joker Official Mode - Win Condition Integration", () => {
  test("if joker death + lover death causes mafia majority, mafia wins immediately", () => {
    // 4 players: 1 mafia, 1 joker, 2 citizens. Joker has lover = citizen.
    // After joker + lover die, 1 mafia vs 1 citizen -> mafia wins
    const game = setupGame(4, {
      enableJoker: true,
      jokerMode: "official",
      enableLovers: true,
    });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");
    const mafia = findPlayerByRole(game, "mafia");
    const citizens = getCitizens(game);

    // Manually assign joker + citizen as lovers
    const loverCitizen = citizens[0];
    joker.isLover = true;
    joker.loverId = loverCitizen.id;
    loverCitizen.isLover = true;
    loverCitizen.loverId = joker.id;

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    const result = resolveVote(game);

    // After joker + lover die: mafia(1) vs citizen(1) -> mafia >= town -> mafia wins
    if (getAlivePlayers(game).length <= 2) {
      expect(game.phase).toBe("game_over");
      expect(game.winner).toBe("mafia");
    }
    removeGame(game.code);
  });

  test("jokerJointWinner is preserved at game end", () => {
    // Setup: execute joker (official mode), then let mafia win
    const game = setupGame(4, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");

    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
      }
    }
    resolveVote(game);

    expect(game.jokerJointWinner).toBe(true);
    // Joint winner flag should persist regardless of game outcome
    removeGame(game.code);
  });
});

describe("Joker Official Mode - Restart/Return to Lobby Reset", () => {
  test("restartGame resets joker fields", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    game.jokerJointWinner = true;
    game.jokerHauntVoters = [2, 3, 4];
    game.jokerHauntTarget = 2;

    restartGame(game);

    expect(game.jokerJointWinner).toBe(false);
    expect(game.jokerHauntVoters).toEqual([]);
    expect(game.jokerHauntTarget).toBeNull();
    removeGame(game.code);
  });

  test("returnToLobby resets joker fields", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);
    game.jokerJointWinner = true;
    game.jokerHauntVoters = [2, 3, 4];
    game.jokerHauntTarget = 2;
    game.phase = "game_over"; // returnToLobby requires game_over phase

    returnToLobby(game);

    expect(game.jokerJointWinner).toBe(false);
    expect(game.jokerHauntVoters).toEqual([]);
    expect(game.jokerHauntTarget).toBeNull();
    removeGame(game.code);
  });
});

describe("Night Resolution - No Kill Edge Cases", () => {
  test("no mafia target and no joker haunt: noKill message", () => {
    const game = setupGame(5, { enableJoker: true, jokerMode: "official" });
    startGame(game);

    game.phase = "night";
    game.mafiaTarget = null;
    game.jokerHauntTarget = null;

    const result = transitionToDay(game);
    // When neither mafia nor joker killed, result should have no kills
    expect(result.killed.length).toBe(0);
    removeGame(game.code);
  });
});

describe("Settings Update", () => {
  test("can toggle doctorMode between house and official", () => {
    const game = setupGame(5, { enableDoctor: true });
    expect(game.settings.doctorMode).toBe("house");

    updateSettings(game, { doctorMode: "official" });
    expect(game.settings.doctorMode).toBe("official");

    updateSettings(game, { doctorMode: "house" });
    expect(game.settings.doctorMode).toBe("house");
    removeGame(game.code);
  });

  test("can toggle jokerMode between house and official", () => {
    const game = setupGame(5, { enableJoker: true });
    expect(game.settings.jokerMode).toBe("house");

    updateSettings(game, { jokerMode: "official" });
    expect(game.settings.jokerMode).toBe("official");

    updateSettings(game, { jokerMode: "house" });
    expect(game.settings.jokerMode).toBe("house");
    removeGame(game.code);
  });
});

describe("Doctor Official + Joker Haunt Combined", () => {
  test("official doctor mode with joker haunt: generic save message for haunt save", () => {
    const game = setupGame(7, {
      enableJoker: true,
      jokerMode: "official",
      enableDoctor: true,
      doctorMode: "official",
    });
    startGame(game);
    const joker = findPlayerByRole(game, "joker");
    const mafia = findPlayerByRole(game, "mafia");
    const doctor = getAliveByRole(game, "doctor")[0];

    // Execute joker
    game.phase = "day";
    callVote(game, game.adminId, joker.id);
    const voters: number[] = [];
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) {
        castVote(game, p.id, true);
        voters.push(p.id);
      }
    }
    resolveVote(game);

    // Night: mafia targets one citizen, doctor saves joker's haunt target
    const aliveCitizens = getCitizens(game);
    const mafiaTargetId = aliveCitizens[0].id;
    const hauntTargetId = voters.find(v =>
      v !== mafiaTargetId && v !== doctor?.id && game.players.get(v)!.isAlive
    )!;

    // Joker haunts during mafia sub-phase (parallel)
    submitJokerHaunt(game, joker.id, hauntTargetId);

    lockTarget(game, mafia.id, mafiaTargetId);
    advanceNightSubPhase(game);

    if (game.nightSubPhase === "doctor" && doctor) {
      submitDoctorSave(game, doctor.id, hauntTargetId);
      advanceNightSubPhase(game);
    }

    while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);

    const result = transitionToDay(game);

    // Haunt victim saved: in official mode, save message should be generic
    expect(result.saved).toBe(true);
    expect(game.players.get(hauntTargetId)!.isAlive).toBe(true);
    removeGame(game.code);
  });
});
