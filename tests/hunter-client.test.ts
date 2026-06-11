// C5a: the Hunter's own revenge prompt path (client side).
//
// When the Hunter dies, the server (C1-C4) announces the death(s), then
// broadcasts hunter_revenge_pending, then sends hunter_revenge_targets to
// the hunter alone. These tests pin the client half of that contract:
//  1. Gate-list membership (the L5 trap): hunter_revenge_targets must be in
//     the derived hold-and-replay gate constant AND in SUSPENSE_GATE_TYPES,
//     or the overlay chains swallow the prompt (applyPhaseChange hides all
//     action panels when a chain ends — a prompt that dispatched mid-chain
//     is rendered and then immediately stomped).
//  2. The dispatch case reuses the joker-haunt machinery: deadActionActive
//     set before showNightAction's dead-guard runs, spectator views
//     suppressed, dead overlay dismissed so it can't sit on the prompt.
//  3. Decline affordance: plain button (slide-confirm is reserved for the
//     kill) sending { type: "hunter_revenge", targetId: null }.
//  4. Slide-to-confirm skin: role-hunter_revenge class, BOW_ART icon,
//     "slide to avenge" label.
//
// Loads the harness at a compressed timeScale so the multi-second overlay
// chains complete in tens of milliseconds (same pattern as
// client-gates.test.ts; separate file so each test file owns one harness
// lifecycle — no server, no port band).

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

// The server tsconfig has no "dom" lib; these exist at runtime once the
// harness has registered happy-dom globals.
declare const document: any;
declare const localStorage: any;
declare const window: any;

// 0.02 turns the 4s night-transition chain into ~80ms and the 6.3s dawn
// suspense chain into ~126ms.
const { ws, serverSays } = loadClientApp({ timeScale: 0.02 });

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
});

const $ = (id: string) => document.getElementById(id);
const isHidden = (id: string) => $(id).classList.contains("hidden");

// game_started resets all per-game client state, so each test starts clean.
function startGame(role: string, mafiaTeam: string[] = []) {
  serverSays({ type: "logged_in", userId: 1, username: "Tester" });
  serverSays({ type: "game_started", role, isLover: false, variant: 0, mafiaTeam });
}

const TARGETS = [
  { id: 3, username: "Bob" },
  { id: 4, username: "Carol" },
];

// The dawn wire order with the gate open: death beats first, then the
// hunter-only prompt. Phase stays "night" (phase_change is deferred until
// the revenge resolves), so no overlay chain is animating here.
function dieAndGetPrompt() {
  serverSays({ type: "you_died", message: "You were killed in the night." });
  serverSays({ type: "hunter_revenge_targets", players: TARGETS });
}

describe("C5a: gate-list membership (the L5 trap)", () => {
  test("hunter_revenge_targets is in the transition gate", () => {
    expect([...window.__holdGateLists.transition]).toContain("hunter_revenge_targets");
  });

  test("hunter_revenge_targets is in the narration gate", () => {
    expect([...window.__holdGateLists.narration]).toContain("hunter_revenge_targets");
  });

  test("hunter_revenge_targets is in the suspense gate (must not render before the death reveal completes)", () => {
    expect([...window.__holdGateLists.suspense]).toContain("hunter_revenge_targets");
  });
});

describe("C5a: revenge prompt dispatch", () => {
  test("renders the prompt for the dead hunter (deadActionActive set before the dead-guard)", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();

    expect(isHidden("night-actions")).toBe(false);
    expect($("action-title").textContent).toBe("Take your revenge");
    expect($("action-targets").textContent).toContain("Bob");
    expect($("action-targets").textContent).toContain("Carol");
  });

  test("spectator beats are suppressed while the revenge prompt is up", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();

    serverSays({ type: "spectator_joker_deliberating" });
    expect(isHidden("joker-spectator-status")).toBe(true);
    serverSays({ type: "spectator_night_phase", subPhase: "doctor", isRoleAlive: true });
    expect($("action-title").textContent).toBe("Take your revenge"); // not overwritten
  });

  test("the dead overlay is dismissed when the prompt arrives", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "You were killed in the night." });
    expect(isHidden("dead-overlay")).toBe(false); // death reveal first...

    serverSays({ type: "hunter_revenge_targets", players: TARGETS });
    expect(isHidden("dead-overlay")).toBe(true); // ...then the prompt, unobstructed
    expect(isHidden("dead-dismiss-hint")).toBe(true);
    expect(isHidden("night-actions")).toBe(false);
  });
});

describe("C5a: decline affordance", () => {
  test("decline button is visible for the revenge prompt", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();

    expect(isHidden("btn-decline-revenge")).toBe(false);
  });

  test("decline button is hidden for every other night prompt", () => {
    startGame("doctor");
    serverSays({ type: "phase_change", phase: "night", round: 1 });
    serverSays({ type: "doctor_targets", players: TARGETS });

    expect(isHidden("night-actions")).toBe(false);
    expect(isHidden("btn-decline-revenge")).toBe(true);
  });

  test("clicking decline sends { hunter_revenge, targetId: null } once and hides the button", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();
    ws.sent.length = 0;

    $("btn-decline-revenge").click();
    expect(ws.sent).toEqual([{ type: "hunter_revenge", targetId: null }]);
    expect(isHidden("btn-decline-revenge")).toBe(true);

    $("btn-decline-revenge").click(); // locked — no double-send
    expect(ws.sent.length).toBe(1);
  });

  test("confirming the kill via slide removes the decline button", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();
    ws.sent.length = 0;

    $("action-targets").querySelector("li").click(); // select Bob
    // Fire the armed slide callback through the wire path the drag handler
    // uses: simulate completion by invoking the confirm the same way the
    // threshold crossing does — via the registered callback.
    window.__testFireSlideConfirm();
    expect(ws.sent).toEqual([{ type: "hunter_revenge", targetId: 3 }]);
    expect(isHidden("btn-decline-revenge")).toBe(true);
  });
});

describe("C5a: slide-to-confirm skin", () => {
  test("selecting a target arms the hunter_revenge slide (class, label, icon)", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();

    $("action-targets").querySelector("li").click();
    const container = $("slide-confirm");
    expect(container.classList.contains("role-hunter_revenge")).toBe(true);
    expect(container.classList.contains("hidden")).toBe(false);
    expect($("slide-label").textContent).toBe("slide to avenge");
    expect($("slide-icon").innerHTML).toContain("<svg");
  });

  test("BOW_ART is a 10x10 grid exported on window", () => {
    expect(Array.isArray(window.BOW_ART)).toBe(true);
    expect(window.BOW_ART.length).toBe(10);
    for (const row of window.BOW_ART) expect(row.length).toBe(10);
  });
});

describe("C5a: held during overlay chains, replayed after", () => {
  test("prompt arriving mid night-transition is held, then replayed", async () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "day", round: 1 });
    serverSays({ type: "phase_change", phase: "night", round: 1 }); // day→night starts the chain
    expect(isHidden("suspense-overlay")).toBe(false);

    serverSays({ type: "you_died", message: "You were killed." }); // not transition-gated
    serverSays({ type: "hunter_revenge_targets", players: TARGETS });
    // Held: the prompt must not render while the chain is animating.
    expect(isHidden("night-actions")).toBe(true);

    await Bun.sleep(250); // chain = (3400 + 600) * 0.02 = 80ms
    expect(isHidden("suspense-overlay")).toBe(true);
    expect(isHidden("night-actions")).toBe(false); // replayed after applyPhaseChange
    expect($("action-title").textContent).toBe("Take your revenge");
    expect(isHidden("dead-overlay")).toBe(true);
  });

  test("prompt arriving mid dawn-suspense is held with the death beats, replayed in order", async () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 1 }); // direct apply (no prior phase)
    serverSays({ type: "phase_change", phase: "day", round: 1, events: [] }); // night→day starts suspense
    expect(isHidden("suspense-overlay")).toBe(false);

    serverSays({ type: "you_died", message: "You were killed in the night." });
    serverSays({ type: "hunter_revenge_targets", players: TARGETS });
    // Held: neither the death reveal nor the prompt may render mid-suspense.
    expect(isHidden("dead-overlay")).toBe(true);
    expect(isHidden("night-actions")).toBe(true);

    await Bun.sleep(300); // chain = 6300 * 0.02 = 126ms
    expect(isHidden("suspense-overlay")).toBe(true);
    // Replay order = arrival order: you_died (death reveal), then the prompt
    // (which dismisses the dead overlay so it can't sit on top).
    expect(isHidden("night-actions")).toBe(false);
    expect($("action-title").textContent).toBe("Take your revenge");
    expect(isHidden("dead-overlay")).toBe(true);
  });
});
