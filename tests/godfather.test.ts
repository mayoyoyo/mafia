// Engine unit tests for the Godfather role.
//
//  - assignRoles promotes NO godfather at 1 effective mafia, exactly one at 2+.
//  - submitDetectiveInvestigation reads a flagged mafioso as innocent
//    (isMafia:false) while an unflagged mafioso reads true.
//
// Run ONLY this file:  bun test tests/godfather.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  createGame, addPlayer, updateSettings, startGame,
  submitDetectiveInvestigation, removeGame, setFixedDeal,
  resetGameState, restartGame,
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

afterEach(() => {
  // Tests that pin a fixed deal must not leak it into the random-path tests.
  setFixedDeal(null);
});

describe("godfather — dealing/promotion", () => {
  test("enableGodfather with only 1 effective mafia promotes NO godfather", () => {
    // 3 players → floor(3/3) = 1 mafia, so mafiaCount < 2 and the toggle no-ops.
    const game = setupGame(3, { enableGodfather: true, mafiaCount: 1 });
    startGame(game);
    const godfathers = Array.from(game.players.values()).filter((p) => p.isGodfather);
    expect(godfathers.length).toBe(0);
    removeGame(game.code);
  });

  test("enableGodfather with 2+ mafia promotes exactly one mafioso", () => {
    // 6 players → floor(6/3) = 2 mafia, mafiaCount === 2 → promote one.
    const game = setupGame(6, { enableGodfather: true, mafiaCount: 2 });
    startGame(game);
    const godfathers = Array.from(game.players.values()).filter((p) => p.isGodfather);
    expect(godfathers.length).toBe(1);
    // The promoted player keeps role "mafia" (never a new union member).
    expect(godfathers[0].role).toBe("mafia");
    removeGame(game.code);
  });

  test("enableGodfather OFF never promotes even at 2+ mafia", () => {
    const game = setupGame(6, { mafiaCount: 2 });
    startGame(game);
    const godfathers = Array.from(game.players.values()).filter((p) => p.isGodfather);
    expect(godfathers.length).toBe(0);
    removeGame(game.code);
  });
});

describe("godfather — detective investigation", () => {
  test("flagged mafioso reads innocent; unflagged mafioso reads mafia", () => {
    setFixedDeal({ roles: ["mafia", "mafia", "detective"], godfather: 0 });
    const game = createGame(1, "Admin");
    addPlayer(game, 2, "Player2");
    addPlayer(game, 3, "Player3");
    startGame(game);

    const detective = Array.from(game.players.values()).find((p) => p.role === "detective")!;
    const godfather = Array.from(game.players.values()).find((p) => p.isGodfather)!;
    const plainMafia = Array.from(game.players.values()).find((p) => p.role === "mafia" && !p.isGodfather)!;

    // The Godfather keeps role "mafia" but reads INNOCENT.
    expect(godfather.role).toBe("mafia");
    const gfResult = submitDetectiveInvestigation(game, detective.id, godfather.id);
    expect(gfResult).not.toBeNull();
    expect(gfResult!.isMafia).toBe(false);

    // A plain mafioso still reads as mafia.
    const mafiaResult = submitDetectiveInvestigation(game, detective.id, plainMafia.id);
    expect(mafiaResult).not.toBeNull();
    expect(mafiaResult!.isMafia).toBe(true);

    // The false "innocent" reading PERSISTS in detectiveHistory (no retro-correction):
    // history[0] = the Godfather (false), history[1] = the plain mafioso (true).
    expect(game.detectiveHistory[0]).toMatchObject({ targetName: godfather.username, isMafia: false });
    expect(game.detectiveHistory[1]).toMatchObject({ targetName: plainMafia.username, isMafia: true });

    removeGame(game.code);
  });
});

describe("godfather — reset seam (no leak across Play Again)", () => {
  test("resetGameState clears isGodfather for every player", () => {
    const game = setupGame(6);
    // Dirty the flag the way a finished game would leave it.
    const players = Array.from(game.players.values());
    players[0].isGodfather = true;
    players[3].isGodfather = true;
    resetGameState(game, "test");
    expect(players.every((p) => !p.isGodfather)).toBe(true);
    removeGame(game.code);
  });

  test("a Godfather from game 1 does NOT carry the flag into game 2 (feature off)", () => {
    // Game 1: pin a Godfather.
    setFixedDeal({ roles: ["mafia", "mafia", "detective"], godfather: 0 });
    const game = createGame(1, "Admin");
    addPlayer(game, 2, "Player2");
    addPlayer(game, 3, "Player3");
    startGame(game);
    expect(Array.from(game.players.values()).filter((p) => p.isGodfather).length).toBe(1);

    // Play Again with the Godfather feature now OFF and a random deal.
    setFixedDeal(null);
    updateSettings(game, { enableGodfather: false });
    restartGame(game);

    // Without the GAME_RESETS reset, the seat-0 player would still be flagged
    // and read INNOCENT to a detective in game 2.
    expect(Array.from(game.players.values()).filter((p) => p.isGodfather).length).toBe(0);
    removeGame(game.code);
  });
});
