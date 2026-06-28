// Engine unit tests for the Vigilante role.
//
//  - submitVigilanteShoot: rejects a self-shot (D3), rejects a second shot
//    once the bullet is spent, and a PASS (targetId null) keeps the bullet.
//  - vigilanteBulletUsed is cleared by resetGameState (reset-seam regression,
//    the same class fixed for the Godfather flag — dirty then reset).
//  - advanceNightSubPhase's phantom (isFake) computation: a living vigilante
//    with an unused bullet is REAL; a spent or dead vigilante is FAKE.
//
// Run ONLY this file:  bun test tests/vigilante.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  createGame, addPlayer, startGame, setFixedDeal, removeGame,
  submitVigilanteShoot, advanceNightSubPhase, resetGameState,
} from "../src/game-engine";
import type { Game, Player } from "../src/types";

afterEach(() => {
  setFixedDeal(null);
});

function vigGame(roles: import("../src/types").Role[], settings?: Partial<import("../src/types").GameSettings>): Game {
  setFixedDeal({ roles });
  const game = createGame(1, "Admin");
  for (let i = 2; i <= roles.length; i++) addPlayer(game, i, `Player${i}`);
  // enableVigilante etc. must be on for the sub-phase; tests set what they need.
  if (settings) Object.assign(game.settings, settings);
  startGame(game);
  game.awaitingNarratorReady = false; // skip the narrator gate for direct engine calls
  return game;
}

const findRole = (game: Game, role: import("../src/types").Role): Player =>
  Array.from(game.players.values()).find((p) => p.role === role)!;

describe("vigilante — submitVigilanteShoot guards", () => {
  test("rejects a self-shot (D3) and leaves state untouched", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    game.nightSubPhase = "vigilante";
    const vig = findRole(game, "vigilante");

    expect(submitVigilanteShoot(game, vig.id, vig.id)).toBe(false);
    expect(game.vigilanteTarget).toBeNull();
    expect(vig.vigilanteBulletUsed).toBe(false);
    removeGame(game.code);
  });

  test("a real shot consumes the bullet; a second shot is rejected", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    game.nightSubPhase = "vigilante";
    const vig = findRole(game, "vigilante");
    const citizen = findRole(game, "citizen");

    expect(submitVigilanteShoot(game, vig.id, citizen.id)).toBe(true);
    expect(game.vigilanteTarget).toBe(citizen.id);
    expect(vig.vigilanteBulletUsed).toBe(true);

    // Second shot the same game is refused (one bullet total).
    const mafia = findRole(game, "mafia");
    expect(submitVigilanteShoot(game, vig.id, mafia.id)).toBe(false);
    expect(game.vigilanteTarget).toBe(citizen.id); // unchanged
    removeGame(game.code);
  });

  test("a PASS (targetId null) keeps the bullet and sets no target", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    game.nightSubPhase = "vigilante";
    const vig = findRole(game, "vigilante");

    expect(submitVigilanteShoot(game, vig.id, null)).toBe(true);
    expect(game.vigilanteTarget).toBeNull();
    expect(vig.vigilanteBulletUsed).toBe(false);
    removeGame(game.code);
  });

  test("rejects a shot from the wrong sub-phase", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    game.nightSubPhase = "mafia";
    const vig = findRole(game, "vigilante");
    const citizen = findRole(game, "citizen");
    expect(submitVigilanteShoot(game, vig.id, citizen.id)).toBe(false);
    removeGame(game.code);
  });

  test("rejects a shot at a dead target and leaves state untouched", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    game.nightSubPhase = "vigilante";
    const vig = findRole(game, "vigilante");
    const citizen = findRole(game, "citizen");
    citizen.isAlive = false; // already eliminated this game
    expect(submitVigilanteShoot(game, vig.id, citizen.id)).toBe(false);
    expect(game.vigilanteTarget).toBeNull();
    expect(vig.vigilanteBulletUsed).toBe(false);
    removeGame(game.code);
  });
});

describe("vigilante — reset seam (no spent-bullet leak across Play Again)", () => {
  test("resetGameState clears vigilanteBulletUsed for every player", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    const players = Array.from(game.players.values());
    // Dirty the flag the way a finished game would leave it.
    players[0].vigilanteBulletUsed = true;
    players[1].vigilanteBulletUsed = true;

    resetGameState(game, "test");
    expect(players.every((p) => !p.vigilanteBulletUsed)).toBe(true);
    removeGame(game.code);
  });
});

describe("vigilante — phantom (isFake) computation", () => {
  test("a living vigilante with an unused bullet → REAL sub-phase", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    game.nightSubPhase = "detective"; // next candidate is vigilante
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("vigilante");
    expect(result.isFake).toBe(false);
    removeGame(game.code);
  });

  test("a spent bullet → FAKE (phantom) sub-phase", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    findRole(game, "vigilante").vigilanteBulletUsed = true;
    game.nightSubPhase = "detective";
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("vigilante");
    expect(result.isFake).toBe(true);
    removeGame(game.code);
  });

  test("a dead vigilante → FAKE (phantom) sub-phase", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: true });
    findRole(game, "vigilante").isAlive = false;
    game.nightSubPhase = "detective";
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("vigilante");
    expect(result.isFake).toBe(true);
    removeGame(game.code);
  });

  test("the vigilante disabled → sub-phase skipped entirely (advances to resolving)", () => {
    const game = vigGame(["mafia", "vigilante", "citizen"], { enableVigilante: false });
    game.nightSubPhase = "detective";
    const result = advanceNightSubPhase(game);
    expect(result.nextPhase).toBe("resolving");
    removeGame(game.code);
  });
});
