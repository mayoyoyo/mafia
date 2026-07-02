// Client-side behavioral tests for public/app.js (M11, L6).
// Drives the real DOM handlers via the happy-dom harness and asserts on the
// exact wire frames sent through the stub WebSocket.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

// The server tsconfig has no "dom" lib; these exist at runtime once the
// harness has registered happy-dom globals.
declare const document: any;
declare const localStorage: any;
declare const window: any;

const { ws, serverSays } = loadClientApp();

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
});

function mafiaVoteFrames(from: number) {
  return ws.sent.slice(from).filter((m) => m.type === "mafia_vote");
}

function startNightAsMafia(mafiaTeam: string[]) {
  serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
  serverSays({
    type: "game_started",
    role: "mafia",
    isLover: false,
    variant: 0,
    mafiaTeam,
  });
  serverSays({
    type: "mafia_targets",
    players: [
      { id: 3, username: "Bob" },
      { id: 4, username: "Carol" },
    ],
  });
}

// Renders the multi-mafia card list where both targets are partial-locked by
// other mafia, so each card shows the auto maybe+lock "Lock In" button for me.
function startMultiMafiaPartialLockNight() {
  startNightAsMafia(["Mafioso", "Vito", "Tony"]);
  serverSays({
    type: "mafia_vote_update",
    voterTargets: {
      Vito: [{ target: "Bob", targetId: 3, voteType: "lock" }],
      Tony: [{ target: "Carol", targetId: 4, voteType: "lock" }],
    },
    objectedTargets: {},
    aliveMafiaCount: 3,
    lockedTarget: null,
  });
}

function lockInButton(targetId: number): any {
  const btn = document.querySelector(
    `#action-targets li[data-id="${targetId}"] .mtc-btn-lock`
  );
  if (!btn) throw new Error(`no Lock In button for target ${targetId}`);
  return btn as any;
}

describe("M11: single-mafia target selection", () => {
  test("double-tapping the same target sends exactly one maybe+lock pair (no toggle-off)", async () => {
    startNightAsMafia(["Mafioso"]);
    const from = ws.sent.length;

    const lis = document.querySelectorAll("#action-targets li");
    (lis[0] as any).click();
    (lis[0] as any).click();
    await Bun.sleep(80); // let any delayed sends flush

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("rapidly switching targets never locks a target different from the UI selection", async () => {
    startNightAsMafia(["Mafioso"]);
    const from = ws.sent.length;

    const lis = document.querySelectorAll("#action-targets li");
    (lis[0] as any).click(); // tap Bob (3)
    (lis[1] as any).click(); // immediately tap Carol (4)
    await Bun.sleep(80);

    const frames = mafiaVoteFrames(from);
    const locks = frames.filter((f) => f.voteType === "lock");
    expect(locks.length).toBe(1);

    // The UI highlight must match the target the wire locked.
    const selected = document.querySelector(
      "#action-targets li.selected"
    ) as any;
    expect(selected).not.toBeNull();
    expect(String(locks[0].targetId)).toBe(selected.dataset.id);

    // First tap wins outright: exactly one maybe+lock pair, no strays.
    expect(frames).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("a fresh night re-render allows picking again", async () => {
    startNightAsMafia(["Mafioso"]);
    (document.querySelectorAll("#action-targets li")[0] as any).click();
    await Bun.sleep(80);

    // Next night: server re-sends targets, list re-renders.
    serverSays({
      type: "mafia_targets",
      players: [
        { id: 3, username: "Bob" },
        { id: 4, username: "Carol" },
      ],
    });
    const from = ws.sent.length;
    (document.querySelectorAll("#action-targets li")[1] as any).click();
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 4, voteType: "maybe" },
      { type: "mafia_vote", targetId: 4, voteType: "lock" },
    ]);
  });
});

describe("M11: multi-mafia auto Lock In (partial-lock card)", () => {
  test("double-clicking Lock In sends exactly one maybe+lock pair (no toggle-off)", async () => {
    startMultiMafiaPartialLockNight();
    const from = ws.sent.length;

    const btn = lockInButton(3);
    btn.click();
    btn.click();
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("clicking Lock In on a second card while the first is in flight is ignored", async () => {
    startMultiMafiaPartialLockNight();
    const from = ws.sent.length;

    lockInButton(3).click();
    lockInButton(4).click(); // in flight — must not produce any frames
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("after a server vote update echoes back, Lock In works again", async () => {
    startMultiMafiaPartialLockNight();
    lockInButton(3).click();
    await Bun.sleep(80);

    // Server echo arrives (here: my votes didn't stick — list re-renders).
    serverSays({
      type: "mafia_vote_update",
      voterTargets: {
        Vito: [{ target: "Bob", targetId: 3, voteType: "lock" }],
        Tony: [{ target: "Carol", targetId: 4, voteType: "lock" }],
      },
      objectedTargets: {},
      aliveMafiaCount: 3,
      lockedTarget: null,
    });

    const from = ws.sent.length;
    lockInButton(4).click();
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 4, voteType: "maybe" },
      { type: "mafia_vote", targetId: 4, voteType: "lock" },
    ]);
  });
});

describe("rejoined mafia: teammate confirms the kill", () => {
  test("slide-confirm hides even though the rejoiner has no local vote state", () => {
    // Rejoin mid-night during the mafia sub-phase with consensus reached:
    // game_sync leaves myMafiaVotes empty and (H4) the action unlocked.
    serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
    serverSays({ type: "game_joined", code: "ABCD", isAdmin: false });
    serverSays({
      type: "game_sync",
      code: "ABCD",
      players: [
        { id: 1, username: "Mafioso", isAlive: true },
        { id: 2, username: "Vito", isAlive: true },
        { id: 3, username: "Bob", isAlive: true },
      ],
      role: "mafia",
      isLover: false,
      variant: 0,
      mafiaTeam: ["Mafioso", "Vito"],
      isDead: false,
      phase: "night",
      nightSubPhase: "mafia",
      round: 1,
      dayVoteCount: 0,
      narratorHistory: [],
      detectiveHistory: [],
      eventHistory: [],
      nightAction: { locked: true, targetName: "Bob", targets: [], voterTargets: {} },
    });
    // Server re-sends the consensus state right after game_sync (H4).
    serverSays({ type: "mafia_confirm_ready", targetName: "Bob" });
    expect(document.getElementById("action-confirm").classList.contains("hidden")).toBe(false);

    // Teammate confirms — all mafia get night_action_done.
    serverSays({ type: "night_action_done", message: "The Mafia has chosen their victim." });

    expect(document.getElementById("action-confirm").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("action-targets").textContent).toContain("Bob ✔");
  });
});

describe("L6: corrupt mafia_user localStorage", () => {
  test("corrupt JSON does not throw on connect, removes the bad key, sends no login", () => {
    localStorage.setItem("mafia_user", "{definitely not json");
    const from = ws.sent.length;

    expect(() => ws.onopen!()).not.toThrow();

    expect(localStorage.getItem("mafia_user")).toBeNull();
    expect(ws.sent.slice(from).filter((m) => m.type === "login")).toEqual([]);
  });

  test("non-object stored value is treated as logged-out", () => {
    localStorage.setItem("mafia_user", "null");
    const from = ws.sent.length;

    expect(() => ws.onopen!()).not.toThrow();

    expect(localStorage.getItem("mafia_user")).toBeNull();
    expect(ws.sent.slice(from).filter((m) => m.type === "login")).toEqual([]);
  });

  test("valid stored credentials still auto-login on connect", () => {
    localStorage.setItem(
      "mafia_user",
      JSON.stringify({ username: "Mafioso", passcode: "1234" })
    );
    const from = ws.sent.length;

    ws.onopen!();

    expect(ws.sent.slice(from)).toEqual([
      { type: "login", username: "Mafioso", passcode: "1234" },
    ]);
  });
});

// B0d (audit D9): client-side debug logs — console.warn only, zero behavior
// change. app.js resolves `console` through with(window), so spying on
// window.console.warn captures both log sites.
describe("B0d/D9: client console logging", () => {
  function spyWarn(): { warns: any[][]; restore: () => void } {
    const warns: any[][] = [];
    const orig = window.console.warn;
    window.console.warn = (...args: any[]) => { warns.push(args); };
    return { warns, restore: () => { window.console.warn = orig; } };
  }

  test("unknown server message type hits the default branch and warns", () => {
    const { warns, restore } = spyWarn();
    try {
      serverSays({ type: "definitely_not_a_real_type", payload: 1 });
    } finally {
      restore();
    }
    expect(warns.length).toBe(1);
    expect(warns[0].join(" ")).toContain("unknown server message type");
    expect(warns[0]).toContain("definitely_not_a_real_type");
  });

  test("known message types do not hit the default branch", () => {
    const { warns, restore } = spyWarn();
    try {
      serverSays({ type: "sound_cue", sound: "night" });
    } finally {
      restore();
    }
    expect(warns).toEqual([]);
  });

  test("wsSend on a non-OPEN socket drops the frame and warns", () => {
    const { warns, restore } = spyWarn();
    const from = ws.sent.length;
    // logged_in with a stored game code auto-sends join_game through wsSend
    localStorage.setItem("mafia_game_code", "QQQQ");
    ws.readyState = 3; // CLOSED
    try {
      serverSays({ type: "logged_in", userId: 77, username: "Dropper", hide_mafia_tag: false, player_color: "#fff" });
    } finally {
      restore();
      ws.readyState = 1; // restore OPEN for any later tests
      localStorage.removeItem("mafia_game_code");
    }
    expect(ws.sent.length).toBe(from); // join_game frame never reached the socket
    expect(warns.length).toBe(1);
    expect(warns[0].join(" ")).toContain("dropped frame");
    expect(warns[0]).toContain("join_game");
  });
});

// Wire cause-neutrality (findings 1 & 2): living players get the neutral "death"
// event type in-game; the in-game renderer maps ANY night-death type to the
// neutral CSS class; and the game-over reveal renders the FULL cause detail the
// final (game_over-phase) phase_change carries.
describe("cause-neutral event history + full-detail game-over reveal", () => {
  const q = (sel: string) => document.querySelectorAll(sel);

  beforeEach(() => {
    // game_started resets previousPhase=null (and clears the event log), so a
    // day-phase phase_change below lands in the plain applyPhaseChange branch —
    // NOT the night→day suspense overlay (which would leak an async timer into
    // the next test and hold its game_over). Keeps this describe self-contained.
    serverSays({ type: "game_started", role: "citizen", isLover: false, variant: 0 });
  });

  test("in-game 'death' events render neutrally (label + CSS class)", () => {
    serverSays({
      type: "phase_change", phase: "day", round: 1, messages: [],
      events: [
        { round: 1, type: "death", playerName: "Alice" },
        { round: 1, type: "death", playerName: "Bob" },
      ],
    });
    const items = q("#event-history-list .event-item");
    expect(items.length).toBe(2);
    for (const it of items) {
      expect((it as any).className).toBe("event-item death");
      expect((it as any).textContent).toContain("Died in the night");
      // A neutral surface must never carry a cause word.
      expect((it as any).textContent).not.toMatch(/mafia|vigilante|joker|heartbreak/i);
    }
  });

  test("a cause-bearing type reaching the in-game log is still class-neutralized (finding 2)", () => {
    serverSays({
      type: "phase_change", phase: "day", round: 2, messages: [],
      events: [{ round: 2, type: "vigilante_shot", playerName: "Carol" }],
    });
    const item = q("#event-history-list .event-item")[0] as any;
    expect(item.className).toBe("event-item death"); // NOT "event-item vigilante_shot"
  });

  test("game-over reveal shows FULL cause detail from the game_over-phase history", () => {
    // At game_over the server ships the UNPROJECTED history (game_sync.eventHistory
    // and phase_change.events both full-detail once phase === "game_over"); the
    // reveal reads it back through GAME_HISTORY_LABELS as real causes. Driven via
    // the game_sync rejoin-at-game-over path (calls handleGameOver directly), so
    // it also pins that full-detail-on-the-wire contract for a rejoiner.
    serverSays({
      type: "game_sync",
      code: "ZZZZ", isAdmin: false, narrationAccent: "none", narratorGender: "male",
      hide_mafia_tag: false,
      players: [
        { id: 1, username: "Dan", isAlive: false, isAdmin: false },
        { id: 2, username: "Eve", isAlive: false, isAdmin: false },
      ],
      role: "citizen", isLover: false, variant: 0,
      phase: "game_over", round: 3, nightSubPhase: null, awaitingNarratorReady: false,
      isDead: true, dayStartedAt: null, dayVoteCount: 0, narratorHistory: [],
      // FULL detail (the game_over-phase contract) — the reveal must render it.
      eventHistory: [
        { round: 3, type: "kill", playerName: "Dan", cause: "direct", source: "mafia" },
        { round: 3, type: "vigilante_shot", playerName: "Eve", cause: "direct", source: "vigilante" },
      ],
      nightAction: null, voteState: null,
      gameOver: {
        winner: "town", message: "Citizens win!", forceEnded: true,
        revealPlayers: [
          { id: 1, username: "Dan", isAlive: false, isAdmin: false, role: "citizen" },
          { id: 2, username: "Eve", isAlive: false, isAdmin: false, role: "vigilante" },
        ],
      },
    });
    const texts = Array.from(q("#game-history .game-history-item")).map((i: any) => i.textContent as string);
    expect(texts.some((t) => t.includes("Dan") && t.includes("Killed by the Mafia"))).toBe(true);
    expect(texts.some((t) => t.includes("Eve") && t.includes("Shot by the Vigilante"))).toBe(true);
  });
});
