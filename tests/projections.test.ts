/**
 * B5 (audit P6-lite): unit tests for the two pure payload projections.
 *
 *   - toTargetInfo(player, game)  — the alive-target list entry that was
 *     rebuilt inline 8x in server.ts + 1x in game-engine.ts
 *     (getJokerHauntTargets). isAlive is HARDCODED true (every literal
 *     pinned it that way; all call sites filter to alive players first).
 *
 *   - projectGameOver(game, message) — the shared core of the four
 *     game_over emitters (buildGameSync's gameOver branch, the vote-path
 *     and night-path live broadcasts, and end_game). `message` is an
 *     explicit param because the sites DIVERGE on it by design ("Citizens
 *     win!" in the sync reconstruction vs the narrator's last line in the
 *     live broadcasts) — the projection must never arbitrate that.
 *
 * The wire equivalence proof is the golden suite + the rejoin matrix; these
 * tests pin the projections' field-by-field shape so drift shows up at the
 * unit level first.
 */
import { describe, test, expect, afterEach } from "bun:test";
import {
  createGame, addPlayer, removeGame,
  toTargetInfo, projectGameOver,
} from "../src/game-engine";
import type { Game } from "../src/types";

let game: Game;

function makeGame(playerCount: number): Game {
  game = createGame(1, "Admin");
  for (let i = 2; i <= playerCount; i++) {
    addPlayer(game, i, `Player${i}`);
  }
  return game;
}

afterEach(() => {
  if (game) removeGame(game.code);
});

describe("toTargetInfo", () => {
  test("projects exactly {id, username, isAlive, isAdmin} — no role/lover leak", () => {
    const g = makeGame(3);
    const p = g.players.get(2)!;
    p.role = "mafia"; // must NOT leak into a target list
    p.isLover = true;
    p.loverId = 3;

    const info = toTargetInfo(p, g);
    expect(Object.keys(info).sort()).toEqual(["id", "isAdmin", "isAlive", "username"]);
    expect(info.id).toBe(2);
    expect(info.username).toBe("Player2");
  });

  test("flags the admin, and only the admin", () => {
    const g = makeGame(3);
    expect(toTargetInfo(g.players.get(1)!, g).isAdmin).toBe(true);
    expect(toTargetInfo(g.players.get(2)!, g).isAdmin).toBe(false);
    expect(toTargetInfo(g.players.get(3)!, g).isAdmin).toBe(false);
  });

  test("isAlive is hardcoded true — even for a dead player (alive-list contract)", () => {
    // Every call site filters to alive players before mapping; the inline
    // literals all pinned `isAlive: true`. The projection preserves that
    // hardcode rather than reading player.isAlive.
    const g = makeGame(3);
    const p = g.players.get(2)!;
    p.isAlive = false;
    expect(toTargetInfo(p, g).isAlive).toBe(true);
  });
});

describe("projectGameOver", () => {
  test("shared core: winner from game.winner, message passthrough, full role reveal", () => {
    const g = makeGame(4);
    g.winner = "mafia";
    g.players.get(2)!.role = "mafia";
    g.players.get(3)!.role = "citizen";
    g.players.get(3)!.isAlive = false;
    g.players.get(1)!.role = "doctor";
    g.players.get(4)!.role = "citizen";

    const proj = projectGameOver(g, "Mafia wins!");
    expect(proj.winner).toBe("mafia");
    expect(proj.message).toBe("Mafia wins!");
    expect(proj.players.length).toBe(4);

    // Reveal carries roles (getPlayerInfo(game, true) semantics) and REAL
    // isAlive — unlike toTargetInfo's hardcoded true.
    const dead = proj.players.find((p) => p.id === 3)!;
    expect(dead.role).toBe("citizen");
    expect(dead.isAlive).toBe(false);
    const mafia = proj.players.find((p) => p.id === 2)!;
    expect(mafia.role).toBe("mafia");
    expect(mafia.isAlive).toBe(true);
  });

  test("reveal carries lover links", () => {
    const g = makeGame(4);
    g.winner = "town";
    const a = g.players.get(2)!;
    const b = g.players.get(3)!;
    a.isLover = true; a.loverId = 3; a.role = "citizen";
    b.isLover = true; b.loverId = 2; b.role = "citizen";

    const proj = projectGameOver(g, "Citizens win!");
    const ra = proj.players.find((p) => p.id === 2)!;
    expect(ra.isLover).toBe(true);
    expect(ra.loverId).toBe(3);
  });

  test("jokerJointWinner key is ABSENT when false (not present-as-false)", () => {
    const g = makeGame(4);
    g.winner = "town";
    const proj = projectGameOver(g, "Citizens win!");
    expect("jokerJointWinner" in proj).toBe(false);
    expect(Object.keys(proj).sort()).toEqual(["message", "players", "winner"]);
  });

  test("jokerJointWinner: true rides along when set", () => {
    const g = makeGame(4);
    g.winner = "town";
    g.jokerJointWinner = true;
    const proj = projectGameOver(g, "Citizens win!");
    expect(proj.jokerJointWinner).toBe(true);
  });

  test("winner 'joker' projects with jokerJointWinner riding along", () => {
    // The joker win path (eliminated-joker / official-joker modes) is the
    // third winner value; jokerJointWinner can accompany it.
    const g = makeGame(4);
    g.winner = "joker";
    g.jokerJointWinner = true;
    const proj = projectGameOver(g, "The Joker wins!");
    expect(proj.winner).toBe("joker");
    expect(proj.jokerJointWinner).toBe(true);
    expect(proj.message).toBe("The Joker wins!");
    expect(proj.players.length).toBe(4);
  });

  test("throws on a winner-null game — unconcluded games must hand-assemble", () => {
    // No caller can hit this today (all four sites run at/after conclusion);
    // the guard hardens against future misuse of the projection at the
    // forced-"town" sites (lobby-leave, 2-hour sweep).
    const g = makeGame(4);
    expect(g.winner).toBeNull();
    expect(() => projectGameOver(g, "boom")).toThrow(/no winner set/);
  });

  test("message divergence is honored verbatim — the projection never invents prose", () => {
    // The pinned divergence: buildGameSync sends the canonical win line
    // ("Citizens win!") while the live emitters send the narrator's last
    // message. Both flow through the same projection, differing ONLY in
    // the explicit message param.
    const g = makeGame(4);
    g.winner = "town";
    const sync = projectGameOver(g, "Citizens win!");
    const live = projectGameOver(g, "The town stands victorious under a blood-red dawn.");
    expect(sync.message).toBe("Citizens win!");
    expect(live.message).toBe("The town stands victorious under a blood-red dawn.");
    expect(sync.winner).toBe(live.winner);
    expect(sync.players).toEqual(live.players);
  });
});
