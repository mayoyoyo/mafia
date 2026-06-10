import { describe, test, expect } from "bun:test";
import {
  createGame, addPlayer, updateSettings, startGame,
  submitMafiaVote, submitDoctorSave, submitJokerHaunt,
  advanceNightSubPhase, transitionToDay,
  callVote, castVote, resolveVote,
  getAliveByRole, removeGame,
} from "../src/game-engine";
import type { Game, GamePhase, Player, NightSubPhase, GameSettings } from "../src/types";

/**
 * B3 — P2 death pipeline tests.
 *
 * Part 1 (pins, written against PRE-rewrite code): the cascade sub-branches
 * the eight golden games do NOT cover, plus the exact "one save blocks one
 * source" interactions resolveNight's KillIntent fold must preserve. These
 * pass before AND after the B3 rewrite — any failure during the rewrite is a
 * behavior regression, not a test to update.
 *
 * Pinned surfaces (engine-level; the goldens pin the wire):
 *   1. haunt-source kill of a LOVER → cascade ordering + sources + event
 *      labels (goldens have haunt kills and lover cascades, never combined);
 *   2. official-joker execution of a LOVER → cascade ordering + labels +
 *      auto haunt-night entry (golden #2 executes a loverless joker);
 *   3. mafia kill of a lover INTERLEAVED with a haunt kill → the cascade
 *      entry rides directly behind its direct death, before the other
 *      source's kill;
 *   4. doctor blocks the HAUNT while the mafia kill lands → save-first
 *      eventHistory order (save event precedes the kill event even though
 *      the kill resolves first chronologically);
 *   5. doctor save consumed by the MAFIA source → a haunt on the same
 *      target still kills (one save blocks ONE source), with saved=true and
 *      the victim dead in the same result.
 */

// ── helpers (per-file copies; R30 consolidation is out of B3 scope) ──────

function setupGame(playerCount: number, settings?: Partial<GameSettings>): Game {
  const game = createGame(1, "Admin");
  for (let i = 2; i <= playerCount; i++) {
    addPlayer(game, i, `Player${i}`);
  }
  if (settings) updateSettings(game, settings);
  return game;
}

function setPhase(game: Game, phase: GamePhase): void {
  game.phase = phase;
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

function getCitizens(game: Game): Player[] {
  return getAliveByRole(game, "citizen");
}

function clearLovers(game: Game): void {
  for (const [, p] of game.players) { p.isLover = false; p.loverId = null; }
}

function makeLovers(a: Player, b: Player): void {
  a.isLover = true; a.loverId = b.id;
  b.isLover = true; b.loverId = a.id;
}

function advanceToResolving(game: Game): void {
  while (game.nightSubPhase !== "resolving") advanceNightSubPhase(game);
}

/** Execute the joker by unanimous day vote (official mode → haunt night). */
function executeJoker(game: Game): { joker: Player; voters: number[] } {
  const joker = findPlayerByRole(game, "joker");
  setPhase(game, "day");
  callVote(game, game.adminId, joker.id);
  const voters: number[] = [];
  for (const [, p] of game.players) {
    if (p.isAlive && p.id !== joker.id) {
      castVote(game, p.id, true);
      voters.push(p.id);
    }
  }
  resolveVote(game);
  return { joker, voters };
}

/** round-tagged (type, playerName) view of eventHistory for strict order asserts */
function eventsOfRound(game: Game, round: number): Array<[string, string]> {
  return game.eventHistory.filter(e => e.round === round).map(e => [e.type, e.playerName]);
}

describe("B3 pins — cascade sub-branches the goldens don't cover", () => {
  test("haunt kill of a lover: cascade rides the haunt source (order, sources, labels)", () => {
    const game = setupGame(8, { enableJoker: true, jokerMode: "official", enableLovers: true });
    startGame(game);
    clearLovers(game);
    const mafia = findPlayerByRole(game, "mafia");
    const { joker } = executeJoker(game);
    expect(game.phase).toBe("night"); // official mode: haunt night begins

    // a = mafia victim (not a lover); b = haunt victim (lover); l = partner
    const [a, b, l] = getCitizens(game);
    makeLovers(b, l);

    expect(submitJokerHaunt(game, joker.id, b.id)).toBe(true);
    lockTarget(game, mafia.id, a.id);
    advanceToResolving(game);
    const result = transitionToDay(game);

    // killed order + sources: mafia kill, haunt kill, haunt's lover cascade
    expect(result.killed.map(k => [k.player.id, k.source])).toEqual([
      [a.id, "mafia"],
      [b.id, "joker_haunt"],
      [l.id, "joker_haunt"],
    ]);
    expect(a.isAlive).toBe(false);
    expect(b.isAlive).toBe(false);
    expect(l.isAlive).toBe(false);
    expect(result.saved).toBe(false);

    // message order mirrors the killed order, one line per death
    expect(result.messages.length).toBe(3);
    expect(result.messages[0]).toBe(result.killed[0].message);
    expect(result.messages[1]).toBe(result.killed[1].message);
    expect(result.messages[2]).toBe(result.killed[2].message);

    // event labels: haunt victim is joker_haunt (NOT lover_death — M5),
    // partner is lover_death, in kill order
    expect(eventsOfRound(game, 2)).toEqual([
      ["kill", a.username],
      ["joker_haunt", b.username],
      ["lover_death", l.username],
    ]);
    removeGame(game.code);
  });

  test("official-joker execution of a lover: cascade order, labels, haunt night still begins", () => {
    const game = setupGame(8, { enableJoker: true, jokerMode: "official", enableLovers: true });
    startGame(game);
    clearLovers(game);
    const joker = findPlayerByRole(game, "joker");
    const partner = getCitizens(game)[0];
    makeLovers(joker, partner);

    setPhase(game, "day");
    callVote(game, game.adminId, joker.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== joker.id) castVote(game, p.id, true);
    }
    const result = resolveVote(game)!;

    expect(result.jokerWin).toBe(true);
    expect(game.jokerJointWinner).toBe(true);
    expect(joker.isAlive).toBe(false);
    expect(partner.isAlive).toBe(false);

    // killed order: joker first, heartbroken partner second
    expect(result.killed.map(k => k.player.id)).toEqual([joker.id, partner.id]);
    expect(result.killed[1].player.isLover).toBe(true);

    // messages: jokerWin + loverDeath + nightFalls (auto haunt night)
    expect(result.messages.length).toBe(3);
    expect(result.messages[1]).toBe(result.killed[1].message);

    // event labels in kill order
    expect(eventsOfRound(game, 1)).toEqual([
      ["execution", joker.username],
      ["lover_death", partner.username],
    ]);

    // the cascade does not derail the haunt night
    expect(game.phase).toBe("night");
    expect(game.jokerHauntVoters.length).toBe(7);
    removeGame(game.code);
  });

  test("mafia kill of a lover interleaved with a haunt kill: cascade stays behind its source", () => {
    const game = setupGame(8, { enableJoker: true, jokerMode: "official", enableLovers: true });
    startGame(game);
    clearLovers(game);
    const mafia = findPlayerByRole(game, "mafia");
    const { joker } = executeJoker(game);
    expect(game.phase).toBe("night");

    // a = mafia victim (lover); l = partner; b = haunt victim (not a lover)
    const [a, l, b] = getCitizens(game);
    makeLovers(a, l);

    expect(submitJokerHaunt(game, joker.id, b.id)).toBe(true);
    lockTarget(game, mafia.id, a.id);
    advanceToResolving(game);
    const result = transitionToDay(game);

    // mafia kill + ITS cascade resolve before the haunt kill
    expect(result.killed.map(k => [k.player.id, k.source])).toEqual([
      [a.id, "mafia"],
      [l.id, "mafia"],
      [b.id, "joker_haunt"],
    ]);
    expect(result.messages.length).toBe(3);
    expect(result.messages[0]).toBe(result.killed[0].message);
    expect(result.messages[1]).toBe(result.killed[1].message);
    expect(result.messages[2]).toBe(result.killed[2].message);
    expect(eventsOfRound(game, 2)).toEqual([
      ["kill", a.username],
      ["lover_death", l.username],
      ["joker_haunt", b.username],
    ]);
    removeGame(game.code);
  });
});

describe("B3 pins — one save blocks one source (resolveNight fold semantics)", () => {
  function setupHauntNightWithDoctor(): { game: Game; joker: Player; mafia: Player; doctor: Player } {
    const game = setupGame(7, {
      enableJoker: true, jokerMode: "official",
      enableDoctor: true, doctorMode: "house",
    });
    startGame(game);
    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const { joker } = executeJoker(game);
    expect(game.phase).toBe("night");
    return { game, joker, mafia, doctor };
  }

  test("doctor blocks the haunt; mafia kill of another lands; save event precedes kill event", () => {
    const { game, joker, mafia, doctor } = setupHauntNightWithDoctor();
    const [x, y] = getCitizens(game); // x = haunt target (saved), y = mafia victim

    expect(submitJokerHaunt(game, joker.id, x.id)).toBe(true);
    lockTarget(game, mafia.id, y.id);
    advanceNightSubPhase(game); // -> doctor
    expect(submitDoctorSave(game, doctor.id, x.id)).toBe(true);
    advanceToResolving(game);
    const result = transitionToDay(game);

    expect(result.saved).toBe(true);
    expect(result.savedName).toBe(x.username);
    expect(result.savedTargetId).toBe(x.id);
    expect(x.isAlive).toBe(true);
    expect(y.isAlive).toBe(false);
    expect(result.killed.map(k => [k.player.id, k.source])).toEqual([[y.id, "mafia"]]);

    // messages chronological: the mafia kill line, then the (house) save line
    expect(result.messages.length).toBe(2);
    expect(result.messages[0]).toBe(result.killed[0].message);

    // eventHistory presentation: save FIRST, then the kill — even though the
    // kill resolved first (today: transitionToDay pushes the save event ahead
    // of the kill events; the B3 rewrite must keep this order)
    expect(eventsOfRound(game, 2)).toEqual([
      ["save", x.username],
      ["kill", y.username],
    ]);
    removeGame(game.code);
  });

  test("save consumed by the mafia source: haunt on the same target still kills", () => {
    const { game, joker, mafia, doctor } = setupHauntNightWithDoctor();
    const x = getCitizens(game)[0]; // doctor, mafia and joker all pick x

    expect(submitJokerHaunt(game, joker.id, x.id)).toBe(true);
    lockTarget(game, mafia.id, x.id);
    advanceNightSubPhase(game); // -> doctor
    expect(submitDoctorSave(game, doctor.id, x.id)).toBe(true);
    advanceToResolving(game);
    const result = transitionToDay(game);

    // The save blocked the mafia kill (saved=true) but NOT the haunt:
    // x dies to the haunt in the same night.
    expect(result.saved).toBe(true);
    expect(result.savedName).toBe(x.username);
    expect(x.isAlive).toBe(false);
    expect(result.killed.map(k => [k.player.id, k.source])).toEqual([[x.id, "joker_haunt"]]);

    // messages chronological: save line first (mafia source resolves first),
    // then the haunt kill line
    expect(result.messages.length).toBe(2);
    expect(result.messages[1]).toBe(result.killed[0].message);

    // events: save first, then the haunt kill
    expect(eventsOfRound(game, 2)).toEqual([
      ["save", x.username],
      ["joker_haunt", x.username],
    ]);
    removeGame(game.code);
  });
});
