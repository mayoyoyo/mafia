// L5: game_over must queue behind an active overlay transition, then reveal.
//
// A natural game_over is ALWAYS delivered as a standalone `game_over` message
// (showGameOverSuspense), never baked into a phase_change. If an overlay chain
// is still animating when that message lands — the classic race is the
// day-execution NIGHTFALL chain (execution beat → nightfall) still on screen
// when the following night's terminal batch arrives, or the night→day DAWN
// suspense still animating when a fast day vote ends the game — the reveal
// must not start concurrently. It would stomp the in-flight beats and let a
// stale applyPhaseChange fire after the game-over screen is up. So the client
// holds game_over in `pendingGameOver` and replays it from the chain's
// terminal via flushPendingGameOver.
//
// These are the golden #6 / #7 end-game shapes (see golden-sequences.test.ts):
// a vote_result + player_died cascade + phase_change(game_over) + game_over,
// with an overlay chain deliberately kept in flight so the hold path fires.
// Owner ruling restored the PUBLIC heartbreak beat: a night lover cascade
// ships loverDeathName on the dawn phase_change, so the dawn chain now includes
// a "X died of heartbreak." beat, and heartbreakTransitionActive is one of the
// gates a held game_over queues behind. The dedicated heartbreak-beat coverage
// lives in the "dawn heartbreak beat" test below.
//
// The harness compresses app.js's multi-second setTimeouts via timeScale so
// the whole chain plays out in a fraction of a second of wall clock.
// Assertions are a synchronous stomp check at the exact decision point plus a
// poller that records every distinct suspense-text beat (beats are >100ms
// apart even scaled, far above the 5ms poll step). recordBeats dedupes on the
// first sighting of each text, so a beat's snapshot reflects the moment it
// first appeared.

import { describe, test, expect, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

// Compress app.js timers 20x: the ~6.6s execution+nightfall chain (or ~6.3s
// dawn suspense) plus the ~5s game-over reveal complete in ~¾ second.
const SCALE = 0.05;
const ms = (realMs: number) => Math.ceil(realMs * SCALE);

const { serverSays, $ } = loadClientApp({ timeScale: SCALE });

afterAll(async () => {
  await unloadClientApp();
});

const REVEAL_PLAYERS = [
  { id: 1, username: "Me", role: "citizen", isAlive: true, isLover: false },
  { id: 2, username: "Bob", role: "doctor", isAlive: false, isLover: true, loverId: 3 },
  { id: 3, username: "Alice", role: "detective", isAlive: false, isLover: true, loverId: 2 },
  { id: 4, username: "Vito", role: "mafia", isAlive: true, isLover: false },
];

function startGameAsCitizen() {
  serverSays({ type: "game_started", role: "citizen", isLover: false, variant: 0, mafiaTeam: [] });
}

interface Beat {
  text: string;
  overlayHidden: boolean;
  gameoverScreenActive: boolean;
  phaseIndicator: string;
}

// Samples the suspense overlay every few ms and records each distinct text
// beat together with what else was on screen at that moment.
async function recordBeats(durationMs: number): Promise<Beat[]> {
  const beats: Beat[] = [];
  const sample = () => {
    const text = $("suspense-text").textContent;
    const last = beats[beats.length - 1];
    if (last && last.text === text) return;
    beats.push({
      text,
      overlayHidden: $("suspense-overlay").classList.contains("hidden"),
      gameoverScreenActive: $("screen-gameover").classList.contains("active"),
      phaseIndicator: $("phase-indicator").textContent,
    });
  };
  const deadline = Date.now() + durationMs;
  sample();
  while (Date.now() < deadline) {
    await Bun.sleep(5);
    sample();
  }
  return beats;
}

describe("L5: game_over queues behind active overlay transitions", () => {
  test("execution + lover-cascade game over: reveal waits for the execution/nightfall chain", async () => {
    // Golden #7 shape: a day-1 execution (+ cascade) starts the execution beat
    // → nightfall chain; the following night reaches parity and its terminal
    // batch (phase_change game_over + game_over) lands WHILE that chain is
    // still on screen. The game_over must be held until the nightfall terminal.
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "day", round: 1, messages: [] });
    serverSays({ type: "vote_result", targetName: "Alice", executed: true });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice has been executed." });
    // Day-execution lover cascade is PUBLIC but cause-neutral on the wire — a
    // plain player_died, no heartbreak beat.
    serverSays({ type: "player_died", playerId: 2, playerName: "Bob", message: "Bob has died." });

    // day → night with a pending execution starts the execution beat, then
    // chains into NIGHTFALL.
    serverSays({ type: "phase_change", phase: "night", round: 2, messages: [] });
    expect($("suspense-text").textContent).toBe("Alice was executed.");

    // The night resolves to a mafia win; its terminal batch arrives on the
    // heels of the still-animating chain. game_over must NOT stomp the beat.
    serverSays({
      type: "phase_change",
      phase: "game_over",
      round: 2,
      messages: ["The Mafia wins!"],
      events: [],
    });
    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    // Held behind the execution/nightfall chain — the beat is untouched.
    expect($("suspense-text").textContent).toBe("Alice was executed.");

    // Chain (execution ~2.6s + nightfall ~4s) + reveal (~4.8s) + stagger (~2.1s).
    const beats = await recordBeats(ms(15000));
    const texts = beats.map((b) => b.text);

    // The chain plays first (execution beat, then the nightfall couplet)...
    expect(texts[0]).toBe("Alice was executed.");
    // ...and the game-over reveal only comes at the very end.
    expect(texts[texts.length - 2]).toBe("The game is over...");
    expect(texts[texts.length - 1]).toBe("Mafia Wins!");
    // The reveal never bled into an earlier beat (no stomp).
    expect(texts.indexOf("The game is over...")).toBe(texts.length - 2);

    // The game-over screen only appears after the overlay chain is done: every
    // recorded beat first showed with the game screen still up (dedupe keeps
    // the first sighting, before showGameOverScreen swaps at the 4s reveal mark).
    for (const b of beats) expect(b.gameoverScreenActive).toBe(false);

    // Final state: game-over screen up, overlay gone, reveal intact.
    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("suspense-overlay").classList.contains("hidden")).toBe(true);
    expect($("gameover-title").textContent).toBe("Mafia Wins!");
    expect($("gameover-buttons-player").classList.contains("hidden")).toBe(false);
    const revealed = $("role-reveal").querySelectorAll(".role-reveal-item.reveal-show");
    expect(revealed.length).toBe(REVEAL_PLAYERS.length);
  });

  test("night game over: reveal waits for the dawn suspense/verdict beat", async () => {
    // A fast day vote ends the game while the night→day DAWN suspense is still
    // animating. (The retired night "heartbreak beat" coverage re-expressed as
    // game_over queuing behind the live dawn suspense/verdict transition —
    // night lover cascades are cause-neutral on the wire.)
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "night", round: 3, messages: [] });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice was killed in the night." });

    // night → day starts the DAWN suspense (sun → verdict).
    serverSays({
      type: "phase_change",
      phase: "day",
      round: 3,
      saved: false,
      events: [{ type: "death", round: 3, playerName: "Alice" }],
      messages: [],
    });
    expect($("suspense-text").textContent).toBe("The sun rises...");

    // game_over lands mid-dawn. It must be held, not stomp the sunrise beat.
    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    expect($("suspense-text").textContent).toBe("The sun rises...");

    // Dawn (~6.3s) + reveal (~4.8s) + stagger.
    const beats = await recordBeats(ms(13000));

    expect(beats.map((b) => b.text)).toEqual([
      "The sun rises...",
      "What happened last night?",
      "Alice didn’t survive the night.",
      "The game is over...",
      "Mafia Wins!",
    ]);
    // The dawn verdict fully played before the game-over screen appeared.
    for (const b of beats) expect(b.gameoverScreenActive).toBe(false);

    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("suspense-overlay").classList.contains("hidden")).toBe(true);
    expect($("gameover-title").textContent).toBe("Mafia Wins!");
  });

  test("dawn heartbreak beat: game_over waits behind the restored 'X died of heartbreak' beat", async () => {
    // Owner ruling: a night lover cascade ships loverDeathName on the dawn
    // phase_change, so the dawn suspense adds a public heartbreak beat after the
    // verdict. A game_over landing mid-dawn must queue behind that beat too
    // (heartbreakTransitionActive is in the hold gate).
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "night", round: 6, messages: [] });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice was killed in the night." });
    // Bob is Alice's lover — cascades, and his you_died carries isLoverDeath.
    serverSays({ type: "player_died", playerId: 2, playerName: "Bob", message: "Bob died of heartbreak." });

    // night → day DAWN suspense, now carrying the public heartbreak name.
    serverSays({
      type: "phase_change",
      phase: "day",
      round: 6,
      saved: false,
      loverDeathName: "Bob",
      events: [
        { type: "death", round: 6, playerName: "Alice" },        // direct victim, neutral
        { type: "lover_death", round: 6, playerName: "Bob" },    // public heartbreak
      ],
      messages: [],
    });
    expect($("suspense-text").textContent).toBe("The sun rises...");

    // game_over lands mid-dawn — held behind the (longer, heartbreak-extended) chain.
    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    expect($("suspense-text").textContent).toBe("The sun rises...");

    // Dawn (~6.3s) + heartbreak extraDelay (~2.8s) + reveal (~4.8s) + stagger.
    const beats = await recordBeats(ms(16000));

    expect(beats.map((b) => b.text)).toEqual([
      "The sun rises...",
      "What happened last night?",
      "Alice didn’t survive the night.",   // direct victim named, cause-neutral
      "Bob died of heartbreak.",           // separate PUBLIC heartbreak beat
      "The game is over...",
      "Mafia Wins!",
    ]);
    // The whole dawn+heartbreak chain played before the game-over screen appeared.
    for (const b of beats) expect(b.gameoverScreenActive).toBe(false);

    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("suspense-overlay").classList.contains("hidden")).toBe(true);
    expect($("gameover-title").textContent).toBe("Mafia Wins!");
  });

  test("game_over with no transition in flight still applies immediately", async () => {
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "day", round: 2, messages: [] });
    // No overlay chain in flight: the vote-path game_over reveals right away.
    serverSays({ type: "phase_change", phase: "game_over", round: 2, messages: ["The town wins!"], events: [] });
    serverSays({
      type: "game_over",
      winner: "town",
      message: "The town wins!",
      players: REVEAL_PLAYERS,
    });

    // The reveal starts right away — the gate must not over-defer.
    expect($("suspense-text").textContent).toBe("The game is over...");

    const beats = await recordBeats(ms(8500));
    expect(beats.map((b) => b.text)).toEqual(["The game is over...", "Citizens Win!"]);

    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("suspense-overlay").classList.contains("hidden")).toBe(true);
    expect($("gameover-title").textContent).toBe("Citizens Win!");
  });
});

describe("L5 follow-up: held game_over is discarded when the game context ends", () => {
  // Starts a DAWN suspense and parks a game_over behind it, so the chain
  // terminal's flushPendingGameOver fires ~6.3s (scaled) later.
  function holdGameOverBehindDawn(round: number) {
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "night", round, messages: [] });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice was killed in the night." });
    serverSays({
      type: "phase_change",
      phase: "day",
      round,
      saved: false,
      events: [{ type: "death", round, playerName: "Alice" }],
      messages: [],
    });
    expect($("suspense-text").textContent).toBe("The sun rises...");
    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    // Held — the suspense beat is still on screen.
    expect($("suspense-text").textContent).toBe("The sun rises...");
  }

  test("room_closed mid-chain: stale game_over must not stomp the menu", async () => {
    holdGameOverBehindDawn(4);

    // Admin closes the room while the dawn suspense is animating.
    serverSays({ type: "room_closed" });
    expect($("screen-menu").classList.contains("active")).toBe(true);

    // Drain the chain terminal plus the would-be game-over reveal.
    await Bun.sleep(ms(13000));

    expect($("screen-menu").classList.contains("active")).toBe(true);
    expect($("screen-gameover").classList.contains("active")).toBe(false);
  });

  test("game_started (restart) mid-chain: stale game_over must not stomp the new game", async () => {
    holdGameOverBehindDawn(5);

    // The room restarts while the dawn suspense is animating.
    startGameAsCitizen();
    expect($("screen-game").classList.contains("active")).toBe(true);

    await Bun.sleep(ms(13000));

    expect($("screen-game").classList.contains("active")).toBe(true);
    expect($("screen-gameover").classList.contains("active")).toBe(false);
  });
});
