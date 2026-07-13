// Engine unit test for rosterSummary — the public, information-safe lineup
// summary (role counts + Godfather/Lovers modifier flags) shown to every player
// in the in-game "Roles in Play" modal. Derived from the ACTUAL dealt roles.

import { describe, test, expect } from "bun:test";
import { createGame, addPlayer, updateSettings, startGame, removeGame, rosterSummary } from "../src/game-engine";
import type { Game, GameSettings } from "../src/types";

function dealtGame(n: number, settings?: Partial<GameSettings>): Game {
  const game = createGame(1, "Admin");
  for (let i = 2; i <= n; i++) addPlayer(game, i, `P${i}`);
  if (settings) updateSettings(game, settings);
  startGame(game); // assigns roles
  return game;
}

const countOf = (summary: { roles: Array<{ role: string; count: number }> }, role: string) =>
  summary.roles.find((r) => r.role === role)?.count ?? 0;

describe("rosterSummary", () => {
  test("counts each dealt role; 7 players, 2 mafia, doctor + detective", () => {
    const game = dealtGame(7, { mafiaCount: 2, enableDoctor: true, enableDetective: true });
    const r = rosterSummary(game);
    try {
      expect(countOf(r, "mafia")).toBe(2);
      expect(countOf(r, "doctor")).toBe(1);
      expect(countOf(r, "detective")).toBe(1);
      expect(countOf(r, "citizen")).toBe(3); // 7 - 2 - 1 - 1
      expect(r.godfather).toBe(false);
      expect(r.lovers).toBe(false);
    } finally {
      removeGame(game.code);
    }
  });

  test("omits roles not in play and lists mafia first, citizen last", () => {
    const game = dealtGame(5, { mafiaCount: 1 }); // no specials enabled
    const r = rosterSummary(game);
    try {
      expect(r.roles.map((e) => e.role)).toEqual(["mafia", "citizen"]);
      expect(countOf(r, "doctor")).toBe(0);
      expect(r.roles[0].role).toBe("mafia");
      expect(r.roles[r.roles.length - 1].role).toBe("citizen");
    } finally {
      removeGame(game.code);
    }
  });

  test("flags the Godfather modifier when one is promoted", () => {
    const game = dealtGame(8, { mafiaCount: 2, enableGodfather: true });
    const r = rosterSummary(game);
    try {
      expect(r.godfather).toBe(true);
      // The godfather is still counted among the mafia (role stays "mafia").
      expect(countOf(r, "mafia")).toBe(2);
    } finally {
      removeGame(game.code);
    }
  });

  test("flags the Lovers modifier when enabled", () => {
    const game = dealtGame(6, { mafiaCount: 1, enableLovers: true });
    const r = rosterSummary(game);
    try {
      expect(r.lovers).toBe(true);
    } finally {
      removeGame(game.code);
    }
  });
});
