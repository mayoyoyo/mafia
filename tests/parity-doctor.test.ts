import { describe, test, expect } from "bun:test";
import { createGame, addPlayer, checkWinCondition, removeGame } from "../src/game-engine";
import type { Game, Role } from "../src/types";

// Doctor-suppresses-parity rule (project-owner approved):
//   While ANY Doctor is alive, the Mafia parity-win is suppressed so the
//   night can resolve (the Doctor may block the kill) and the day can play
//   out. The Mafia win fires only once no Doctor remains. A lone Doctor vs
//   lone Mafia stalemate is acceptable — the admin has end-game power.
//
// These assertions drive checkWinCondition directly on hand-built alive
// sets. The doctor save is unlimited (no per-game cap; submitDoctorSave only
// forbids saving the same target on consecutive nights), so the suppression
// condition is simply "any alive doctor".

/** Build a started-shaped game whose alive roster is exactly `roles`. */
function gameWithRoles(roles: Role[]): Game {
  const game = createGame(1, "Admin");
  for (let i = 2; i <= roles.length; i++) addPlayer(game, i, `Player${i}`);
  let seat = 1;
  for (const [, p] of game.players) {
    p.role = roles[seat - 1];
    p.isAlive = true;
    seat++;
  }
  return game;
}

describe("Doctor suppresses Mafia parity-win", () => {
  test("{doctor, joker, mafia} -> null (game continues; doctor may save tonight)", () => {
    const game = gameWithRoles(["doctor", "joker", "mafia"]);
    // 1 mafia, joker excluded from both sides, so parity vs 1 non-mafia.
    // Old rule returned "mafia"; new rule suppresses while the doctor lives.
    expect(checkWinCondition(game)).toBeNull();
    removeGame(game.code);
  });

  test("{doctor, mafia} 1v1 -> null (continues; stalemate handled by admin)", () => {
    const game = gameWithRoles(["doctor", "mafia"]);
    expect(checkWinCondition(game)).toBeNull();
    removeGame(game.code);
  });

  test("{joker, mafia} (no doctor) -> mafia (unchanged)", () => {
    const game = gameWithRoles(["joker", "mafia"]);
    expect(checkWinCondition(game)).toBe("mafia");
    removeGame(game.code);
  });

  test("{citizen, mafia} (no doctor) -> mafia (unchanged)", () => {
    const game = gameWithRoles(["citizen", "mafia"]);
    expect(checkWinCondition(game)).toBe("mafia");
    removeGame(game.code);
  });

  test("{doctor, citizen} (no mafia) -> town (unchanged)", () => {
    const game = gameWithRoles(["doctor", "citizen"]);
    expect(checkWinCondition(game)).toBe("town");
    removeGame(game.code);
  });
});
