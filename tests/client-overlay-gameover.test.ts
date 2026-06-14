// L5: game_over must queue behind active death/heartbreak overlay chains.
//
// When an execution + lover cascade ends the game, the server sends
// phase_change(game_over, loverDeathName) immediately followed by game_over.
// The phase_change starts a sequenced overlay chain (execution beat →
// heartbreak beat → applyPhaseChange); game_over must not start its own
// suspense reveal concurrently — that stomps the in-flight beats and lets a
// stale applyPhaseChange fire after the game-over screen is up.
//
// The harness compresses app.js's multi-second setTimeouts via timeScale so
// the whole chain plays out in under a second of wall clock. Assertions are
// a synchronous stomp check at the exact decision point plus a poller that
// records every distinct suspense-text beat (beats are >100ms apart even
// scaled, far above the 5ms poll step).
//
// D5 NOTE: the heartbreak beat text is "Bob died of heartbreak." with NO
// leading space. Pre-D5 the writers injected the pixel art INTO #suspense-text
// (innerHTML = svg + " " + text), so the SVG-stripped textContent kept a
// leading space. D5 moved the art into a sibling #suspense-art slot, so the
// text node now carries only the clean sentence. (Same textContent-vs-SVG
// lesson D3 applied once before.)

import { describe, test, expect, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

// Compress app.js timers 20x: the ~5.2s execution+heartbreak chain plus the
// ~4.8s game-over reveal complete in ~½ second.
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
  test("execution + lover-cascade game over: reveal waits for the death/heartbreak chain", async () => {
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "day", round: 2, messages: [] });
    serverSays({ type: "vote_result", targetName: "Alice", executed: true });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice has been executed." });
    serverSays({ type: "player_died", playerId: 2, playerName: "Bob", message: "Bob died of heartbreak." });

    // phase_change starts the execution overlay beat...
    serverSays({
      type: "phase_change",
      phase: "game_over",
      round: 2,
      messages: ["The Mafia wins!"],
      events: [],
      loverDeathName: "Bob",
    });
    expect($("suspense-text").textContent).toBe("Alice was executed.");

    // ...and game_over arrives on its heels. It must NOT stomp the beat.
    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    expect($("suspense-text").textContent).toBe("Alice was executed.");

    // Chain (real ~5.2s) + reveal (real ~4.8s) + staggered roles (~2.1s).
    const beats = await recordBeats(ms(14000));

    expect(beats.map((b) => b.text)).toEqual([
      "Alice was executed.",
      "Bob died of heartbreak.",
      "The game is over...",
      "Mafia Wins!",
    ]);

    // The game-over screen only appears after the overlay chain is done.
    for (const b of beats) expect(b.gameoverScreenActive).toBe(false);

    // The pending phase_change applied BEFORE the game-over reveal started —
    // no stale applyPhaseChange after the game-over screen is up.
    expect(beats[2].phaseIndicator).toBe("GAME OVER");

    // Final state: game-over screen up, overlay gone, reveal intact.
    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("suspense-overlay").classList.contains("hidden")).toBe(true);
    expect($("gameover-title").textContent).toBe("Mafia Wins!");
    expect($("gameover-buttons-player").classList.contains("hidden")).toBe(false);
    const revealed = $("role-reveal").querySelectorAll(".role-reveal-item.reveal-show");
    expect(revealed.length).toBe(REVEAL_PLAYERS.length);
  });

  test("night lover-cascade game over: reveal waits for the heartbreak beat", async () => {
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "night", round: 3, messages: [] });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice was killed in the night." });
    serverSays({ type: "player_died", playerId: 2, playerName: "Bob", message: "Bob died of heartbreak." });

    // No vote result pending, so this starts the heartbreak beat directly.
    serverSays({
      type: "phase_change",
      phase: "game_over",
      round: 3,
      messages: ["The Mafia wins!"],
      events: [],
      loverDeathName: "Bob",
    });
    expect($("suspense-text").textContent).toBe("Bob died of heartbreak.");

    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    expect($("suspense-text").textContent).toBe("Bob died of heartbreak.");

    const beats = await recordBeats(ms(11000));

    expect(beats.map((b) => b.text)).toEqual([
      "Bob died of heartbreak.",
      "The game is over...",
      "Mafia Wins!",
    ]);
    for (const b of beats) expect(b.gameoverScreenActive).toBe(false);
    expect(beats[1].phaseIndicator).toBe("GAME OVER");

    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("suspense-overlay").classList.contains("hidden")).toBe(true);
    expect($("gameover-title").textContent).toBe("Mafia Wins!");
  });

  test("game_over with no transition in flight still applies immediately", async () => {
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "day", round: 2, messages: [] });
    // No lover death: the phase_change applies synchronously, no overlay chain.
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
  // Starts a heartbreak beat and parks a game_over behind it, so the chain
  // terminal's flushPendingGameOver fires ~2.6s (scaled) later.
  function holdGameOverBehindHeartbreak(round: number) {
    startGameAsCitizen();
    serverSays({ type: "phase_change", phase: "night", round, messages: [] });
    serverSays({ type: "player_died", playerId: 3, playerName: "Alice", message: "Alice was killed in the night." });
    serverSays({ type: "player_died", playerId: 2, playerName: "Bob", message: "Bob died of heartbreak." });
    serverSays({
      type: "phase_change",
      phase: "game_over",
      round,
      messages: ["The Mafia wins!"],
      events: [],
      loverDeathName: "Bob",
    });
    expect($("suspense-text").textContent).toBe("Bob died of heartbreak.");
    serverSays({
      type: "game_over",
      winner: "mafia",
      message: "The Mafia wins!",
      players: REVEAL_PLAYERS,
    });
    // Held — the beat is still on screen.
    expect($("suspense-text").textContent).toBe("Bob died of heartbreak.");
  }

  test("room_closed mid-chain: stale game_over must not stomp the menu", async () => {
    holdGameOverBehindHeartbreak(4);

    // Admin closes the room while the heartbreak beat is animating.
    serverSays({ type: "room_closed" });
    expect($("screen-menu").classList.contains("active")).toBe(true);

    // Drain the chain terminal plus the would-be game-over reveal.
    await Bun.sleep(ms(11000));

    expect($("screen-menu").classList.contains("active")).toBe(true);
    expect($("screen-gameover").classList.contains("active")).toBe(false);
  });

  test("game_started (restart) mid-chain: stale game_over must not stomp the new game", async () => {
    holdGameOverBehindHeartbreak(5);

    // The room restarts while the heartbreak beat is animating.
    startGameAsCitizen();
    expect($("screen-game").classList.contains("active")).toBe(true);

    await Bun.sleep(ms(11000));

    expect($("screen-game").classList.contains("active")).toBe(true);
    expect($("screen-gameover").classList.contains("active")).toBe(false);
  });
});
