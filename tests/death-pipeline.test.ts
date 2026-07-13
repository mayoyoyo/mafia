import { describe, test, expect, afterEach } from "bun:test";
import {
  createGame, addPlayer, updateSettings, startGame,
  submitMafiaVote, submitDoctorSave, submitJokerHaunt,
  advanceNightSubPhase, transitionToDay, resolveNight,
  callVote, castVote, resolveVote,
  getAliveByRole, getAlivePlayers, removeGame,
  applyDeath, deriveDeathEventType, setDeathTriggerSpy,
} from "../src/game-engine";
import type { Game, GamePhase, Player, NightSubPhase, GameSettings, Death } from "../src/types";

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
 *
 * Part 2 (new structure, post-rewrite): the applyDeath funnel itself —
 * cascade-cannot-bypass, the (source, cause) → eventType derivation table,
 * notifyDeathTriggers firing once per Death with the right record (via the
 * setDeathTriggerSpy seam), Death-typed result arrays, and the additive
 * cause/source wire fields on GameEvent.
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

    // Combined cause-neutral line for the DIRECT victims (a, b), then a
    // SEPARATE public "died of heartbreak" line for the cascade partner (l).
    expect(result.messages.length).toBe(2);
    expect(result.messages[0]).toContain(a.username);
    expect(result.messages[0]).toContain(b.username);
    expect(result.messages[0]).not.toMatch(/joker|playing card|heartbreak/i);
    expect(result.messages[1]).toContain(l.username);
    expect(result.messages[1]).toMatch(/heartbreak/i);

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
    // Combined dawn line for the DIRECT victims (a, b), then a separate public
    // heartbreak line for the mafia victim's cascade partner (l).
    expect(result.messages.length).toBe(2);
    expect(result.messages[0]).toContain(a.username);
    expect(result.messages[0]).toContain(b.username);
    expect(result.messages[1]).toContain(l.username);
    expect(result.messages[1]).toMatch(/heartbreak/i);
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

    // messages: the (house) save line (names the saved x) + ONE combined death
    // line (names the mafia victim y). No per-death cause stream.
    expect(result.messages.length).toBe(2);
    expect(result.messages.some(m => m.includes(y.username))).toBe(true);
    expect(result.messages.some(m => m.includes(x.username))).toBe(true);

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

    // messages: the save line (mafia source blocked) + ONE combined death line
    // naming the haunt victim x — cause-neutral (no "Joker"/"playing card").
    expect(result.messages.length).toBe(2);
    expect(result.messages[1]).toContain(x.username);
    expect(result.messages[1]).not.toMatch(/joker|playing card/i);

    // events: save first, then the haunt kill
    expect(eventsOfRound(game, 2)).toEqual([
      ["save", x.username],
      ["joker_haunt", x.username],
    ]);
    removeGame(game.code);
  });

  // ── RULING PIN (wire-neutralization workstream) ───────────────────────────
  // When the mafia AND the vigilante BOTH target X and the doctor saves X, the
  // save blocks only the FIRST source in resolution order (mafia) and X STILL
  // DIES to the vigilante shot. resolveNight's fold consumes the single save on
  // the first intent that matches the doctor's pick (intents resolve
  // mafia → vigilante → joker_haunt); a later same-target intent is unaffected.
  // result.saved stays TRUE even though X ends up dead — a save DID fire, it
  // just wasn't enough. Under house mode the save event precedes the kill it
  // could not stop in eventHistory. This double-covers the finding cited in the
  // dawn cause-neutralization spec (game-engine.ts resolveNight fold).
  test("mafia + vigilante both target X, doctor saves X → save blocks mafia, X dies to vigilante", () => {
    const game = setupGame(6, { enableDoctor: true, doctorMode: "house", enableVigilante: true });
    startGame(game);
    const x = getCitizens(game)[0];
    game.mafiaTarget = x.id;      // first intent — consumes the save
    game.vigilanteTarget = x.id;  // second intent — lands, X dies
    game.doctorTarget = x.id;

    const result = resolveNight(game);

    expect(result.saved).toBe(true);
    expect(result.savedName).toBe(x.username);
    expect(x.isAlive).toBe(false); // the vigilante shot got through the spent save
    expect(result.killed.map(k => [k.player.id, k.source])).toEqual([[x.id, "vigilante"]]);
    // house mode: the save event precedes the kill it couldn't stop.
    expect(eventsOfRound(game, game.round)).toEqual([
      ["save", x.username],
      ["vigilante_shot", x.username],
    ]);
    removeGame(game.code);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Part 2 — the new structure (B3 rewrite)
// ═════════════════════════════════════════════════════════════════════════

describe("B3 — deriveDeathEventType derivation table", () => {
  test("every (source, cause) combination maps to exactly the pre-B3 label", () => {
    // direct deaths keep their source label
    expect(deriveDeathEventType("mafia", "direct")).toBe("kill");
    expect(deriveDeathEventType("joker_haunt", "direct")).toBe("joker_haunt");
    expect(deriveDeathEventType("execution", "direct")).toBe("execution");
    // every cascade is a lover_death regardless of source
    expect(deriveDeathEventType("mafia", "lover_cascade")).toBe("lover_death");
    expect(deriveDeathEventType("joker_haunt", "lover_cascade")).toBe("lover_death");
    expect(deriveDeathEventType("execution", "lover_cascade")).toBe("lover_death");
  });
});

describe("B3 — applyDeath funnel", () => {
  afterEach(() => setDeathTriggerSpy(null));

  test("non-lover: one Death, one event with additive cause/source, dead flag set", () => {
    const game = setupGame(5);
    startGame(game);
    const victim = getAlivePlayers(game)[1];

    const deaths = applyDeath(game, victim.id, "mafia", "the narration line");

    expect(deaths.length).toBe(1);
    expect(deaths[0].player).toBe(victim);
    expect(deaths[0].source).toBe("mafia");
    expect(deaths[0].cause).toBe("direct");
    expect(deaths[0].eventType).toBe("kill");
    expect(deaths[0].message).toBe("the narration line");
    expect(victim.isAlive).toBe(false);

    const ev = game.eventHistory[game.eventHistory.length - 1];
    expect(ev.type).toBe("kill");
    expect(ev.playerName).toBe(victim.username);
    expect(ev.cause).toBe("direct");
    expect(ev.source).toBe("mafia");
    removeGame(game.code);
  });

  test("already dead or unknown target: no Deaths, no events, no triggers", () => {
    const game = setupGame(5);
    startGame(game);
    const victim = getAlivePlayers(game)[1];
    applyDeath(game, victim.id, "mafia", "first");

    const calls: Death[] = [];
    setDeathTriggerSpy((_g, d) => calls.push(d));
    const before = game.eventHistory.length;

    expect(applyDeath(game, victim.id, "execution", "second")).toEqual([]);
    expect(applyDeath(game, 9999, "mafia", "ghost")).toEqual([]);
    expect(game.eventHistory.length).toBe(before);
    expect(calls).toEqual([]);
    removeGame(game.code);
  });

  test("cascade cannot bypass the funnel: lover kill yields two fully-booked Deaths", () => {
    const game = setupGame(6);
    startGame(game);
    const [a, b] = getAlivePlayers(game).filter(p => p.id !== game.adminId);
    makeLovers(a, b);

    const calls: Death[] = [];
    setDeathTriggerSpy((_g, d) => calls.push(d));
    const eventsBefore = game.eventHistory.length;

    const deaths = applyDeath(game, a.id, "joker_haunt", "haunt line");

    // direct death first, cascade second — same source, distinct causes
    expect(deaths.map(d => [d.player.id, d.source, d.cause, d.eventType])).toEqual([
      [a.id, "joker_haunt", "direct", "joker_haunt"],
      [b.id, "joker_haunt", "lover_cascade", "lover_death"],
    ]);
    expect(a.isAlive).toBe(false);
    expect(b.isAlive).toBe(false);
    expect(deaths[1].message.length).toBeGreaterThan(0); // heartbreak narration generated in the funnel

    // the bypass class is dead: the cascade gets the SAME bookkeeping —
    // its own event entry and its own trigger call
    expect(game.eventHistory.length).toBe(eventsBefore + 2);
    expect(game.eventHistory.slice(-2).map(e => [e.type, e.playerName, e.cause, e.source])).toEqual([
      ["joker_haunt", a.username, "direct", "joker_haunt"],
      ["lover_death", b.username, "lover_cascade", "joker_haunt"],
    ]);
    expect(calls).toEqual(deaths);
    removeGame(game.code);
  });
});

describe("B3 — notifyDeathTriggers: once per Death, with the right Death", () => {
  afterEach(() => setDeathTriggerSpy(null));

  test("night path: mafia-lover cascade + haunt kill = three trigger calls in kill order", () => {
    const game = setupGame(8, { enableJoker: true, jokerMode: "official", enableLovers: true });
    startGame(game);
    clearLovers(game);
    const mafia = findPlayerByRole(game, "mafia");
    const { joker } = executeJoker(game);
    const [a, l, b] = getCitizens(game);
    makeLovers(a, l);

    expect(submitJokerHaunt(game, joker.id, b.id)).toBe(true);
    lockTarget(game, mafia.id, a.id);
    advanceToResolving(game);

    const calls: Death[] = [];
    setDeathTriggerSpy((g, d) => { expect(g).toBe(game); calls.push(d); });
    const result = transitionToDay(game);

    // exactly one call per death, with the exact Death records the result carries
    expect(calls.length).toBe(3);
    expect(calls).toEqual(result.killed);
    expect(calls.map(d => [d.player.id, d.source, d.cause])).toEqual([
      [a.id, "mafia", "direct"],
      [l.id, "mafia", "lover_cascade"],
      [b.id, "joker_haunt", "direct"],
    ]);
    removeGame(game.code);
  });

  test("vote path: official-joker execution of a lover = two trigger calls", () => {
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

    const calls: Death[] = [];
    setDeathTriggerSpy((_g, d) => calls.push(d));
    const result = resolveVote(game)!;

    expect(calls.length).toBe(2);
    expect(calls).toEqual(result.killed);
    expect(calls.map(d => [d.player.id, d.source, d.cause])).toEqual([
      [joker.id, "execution", "direct"],
      [partner.id, "execution", "lover_cascade"],
    ]);
    removeGame(game.code);
  });

  test("saved night: no deaths, no trigger calls", () => {
    const game = setupGame(5, { enableDoctor: true });
    startGame(game);
    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const target = getCitizens(game)[0];

    setPhase(game, "night");
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, target.id);
    advanceNightSubPhase(game); // -> doctor
    expect(submitDoctorSave(game, doctor.id, target.id)).toBe(true);
    advanceToResolving(game);

    const calls: Death[] = [];
    setDeathTriggerSpy((_g, d) => calls.push(d));
    const result = transitionToDay(game);

    expect(result.saved).toBe(true);
    expect(result.killed).toEqual([]);
    expect(calls).toEqual([]);
    removeGame(game.code);
  });
});

describe("B3 — Death-typed results and additive wire fields", () => {
  test("VoteResult.killed carries cause/eventType; non-death events carry no cause/source", () => {
    const game = setupGame(6, { enableLovers: true });
    startGame(game);
    clearLovers(game);
    const [a, b] = getCitizens(game);
    makeLovers(a, b);

    setPhase(game, "day");
    callVote(game, game.adminId, a.id);
    for (const [, p] of game.players) {
      if (p.isAlive && p.id !== a.id) castVote(game, p.id, true);
    }
    const result = resolveVote(game)!;

    expect(result.killed.map(k => [k.cause, k.eventType])).toEqual([
      ["direct", "execution"],
      ["lover_cascade", "lover_death"],
    ]);

    // death events carry the additive fields...
    const execEvent = game.eventHistory.find(e => e.type === "execution")!;
    expect([execEvent.cause, execEvent.source]).toEqual(["direct", "execution"]);
    const loverEvent = game.eventHistory.find(e => e.type === "lover_death")!;
    expect([loverEvent.cause, loverEvent.source]).toEqual(["lover_cascade", "execution"]);
    removeGame(game.code);
  });

  test("house-mode save event carries no cause/source (not a death)", () => {
    const game = setupGame(5, { enableDoctor: true, doctorMode: "house" });
    startGame(game);
    const mafia = findPlayerByRole(game, "mafia");
    const doctor = findPlayerByRole(game, "doctor");
    const target = getCitizens(game)[0];

    setPhase(game, "night");
    game.nightSubPhase = "mafia";
    lockTarget(game, mafia.id, target.id);
    advanceNightSubPhase(game); // -> doctor
    expect(submitDoctorSave(game, doctor.id, target.id)).toBe(true);
    advanceToResolving(game);
    transitionToDay(game);

    const saveEvent = game.eventHistory.find(e => e.type === "save")!;
    expect(saveEvent.playerName).toBe(target.username);
    expect(saveEvent.cause).toBeUndefined();
    expect(saveEvent.source).toBeUndefined();
    removeGame(game.code);
  });
});
