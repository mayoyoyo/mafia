// C5a + C5b: the Hunter's revenge — client side.
//
// When the Hunter dies, the server (C1-C4) announces the death(s), then
// broadcasts hunter_revenge_pending, then sends hunter_revenge_targets to
// the hunter alone. C5a pins the hunter's own prompt path; C5b pins the
// room-wide wait view (the public reveal + "waiting for the Hunter"
// status, with the admin's force-skip safety net) and its game_sync
// restore/teardown. These tests pin the client half of that contract:
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

// isAdmin is NOT reset by game_started (admin rights persist across games in
// a room), so C5b tests that assert on the skip control set it explicitly
// via game_joined — both ways, since the flag leaks across tests in this file.
function joinAs(admin: boolean) {
  serverSays({ type: "logged_in", userId: 1, username: "Tester" });
  serverSays({ type: "game_joined", code: "ABCD", isAdmin: admin });
}

// A realistic mid-gate game_sync (C4 projection shape): gated phase holds at
// "night" with nightSubPhase already nulled and nightAction null —
// pendingRevenge is the ONLY gate signal.
function gatedSync(over: Record<string, unknown>) {
  serverSays({
    type: "game_sync",
    code: "ABCD",
    players: [
      { id: 1, username: "Tester", isAlive: true },
      { id: 2, username: "Hank", isAlive: false },
      { id: 3, username: "Bob", isAlive: true },
    ],
    role: "citizen",
    isLover: false,
    variant: 0,
    mafiaTeam: [],
    isDead: false,
    phase: "night",
    nightSubPhase: null,
    round: 2,
    dayVoteCount: 0,
    narratorHistory: ["Hank was the Hunter!"],
    detectiveHistory: [],
    eventHistory: [],
    nightAction: null,
    voteState: null,
    ...over,
  });
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

  test("confirming the kill removes the decline button", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();
    ws.sent.length = 0;

    $("action-targets").querySelector("li").click(); // select Bob
    // Confirm via the actual button the player taps.
    $("btn-action-confirm").click();
    expect(ws.sent).toEqual([{ type: "hunter_revenge", targetId: 3 }]);
    expect(isHidden("btn-decline-revenge")).toBe(true);
  });
});

describe("C5a: confirm-button skin", () => {
  test("selecting a target arms the hunter_revenge confirm group (role class + Avenge label)", () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();

    $("action-targets").querySelector("li").click();
    const container = $("action-confirm");
    expect(container.classList.contains("role-hunter_revenge")).toBe(true);
    expect(container.classList.contains("hidden")).toBe(false);
    expect($("btn-action-confirm").textContent).toBe("Avenge");
  });

  test("BOW_ART is a 10x10 grid exported on window", () => {
    expect(Array.isArray(window.BOW_ART)).toBe(true);
    expect(window.BOW_ART.length).toBe(10);
    for (const row of window.BOW_ART) expect(row.length).toBe(10);
  });
});

describe("C5a: server-side resolution leaves no stale decline button", () => {
  // The 60s timeout and admin force_skip_revenge both resolve the revenge
  // WITHOUT any client action: the hunter's client receives only the
  // deferred phase_change. applyPhaseChange's hide-all block must hide the
  // decline button itself (not just the parent panel), because spectator
  // views later un-hide #night-actions without going through showNightAction.
  test("decline button stays hidden on the next night's spectator panel", async () => {
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    dieAndGetPrompt();
    expect(isHidden("btn-decline-revenge")).toBe(false); // prompt up, button live

    // Revenge resolves server-side (timeout / force-skip): only the deferred
    // phase_change arrives. night→day starts the dawn suspense chain.
    serverSays({ type: "phase_change", phase: "day", round: 2, events: [] });
    await Bun.sleep(300); // chain = 6300 * 0.02 = 126ms
    expect(isHidden("night-actions")).toBe(true); // panel hidden by applyPhaseChange

    // Next night begins (applyPhaseChange resets deadActionActive)...
    serverSays({ type: "phase_change", phase: "night", round: 3 });
    await Bun.sleep(250); // chain = (3400 + 600) * 0.02 = 80ms
    // ...then a spectator beat re-shows the panel without showNightAction.
    serverSays({ type: "spectator_night_phase", subPhase: "doctor", isRoleAlive: true });

    expect(isHidden("night-actions")).toBe(false); // spectator panel is up
    expect(isHidden("btn-decline-revenge")).toBe(true); // no stale decline button
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

// ── C9: hunter_revenge death-history labels ─────────────────────────────────
//
// The server emits death-history events of type "hunter_revenge" (the
// Hunter's dying shot). The client has two label maps that translate event
// types to readable text:
//   1. EVENT_LABELS (in-game event history, rendered by renderEventHistory)
//   2. LABELS       (game-over history summary, rendered by renderGameHistory)
// Both must carry a hunter_revenge entry or the raw "hunter_revenge" string
// leaks into the UI via the `... || ev.type` fallback. Sibling death causes
// (kill, execution, lover_death, joker_haunt) all have entries in both maps.

describe("C9: hunter_revenge label — in-game event history (EVENT_LABELS)", () => {
  test("a hunter_revenge event renders a readable label, not the raw type", () => {
    // Drive the real render path: game_sync renders eventHistory through
    // renderEventHistory → EVENT_LABELS[ev.type] || ev.type.
    gatedSync({
      eventHistory: [
        { round: 2, type: "hunter_revenge", playerName: "Bob" },
      ],
    });

    const list = $("event-history-list");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).not.toContain("hunter_revenge"); // no raw-type leak
    expect(list.textContent).toContain("Shot by the Hunter");
  });
});

describe("C9: hunter_revenge label — game-over history summary (LABELS)", () => {
  // The map entry alone is necessary but not sufficient: renderGameHistory's
  // bucketing loop must also route hunter_revenge into a night/day bucket or
  // the event is dropped before the label is ever read. Pin both — the map
  // (window seam) and the real render path (drive a game_over flow).
  test("the game-over history map carries a hunter_revenge entry", () => {
    expect(window.__gameOverHistoryLabels.hunter_revenge).toBe("Shot by the Hunter");
  });

  // Real path: events accumulate in-game via phase_change → renderEventHistory
  // (which sets lastGameEvents), then a natural game_over runs the suspense
  // reveal → showGameOverScreen → renderGameHistory. A dawn-gate revenge fires
  // off a night kill, so both the kill and the revenge land in the SAME round
  // and must both render under "Night 2". hunter_revenge has no phase field
  // (DeathEventType, same shape as joker_haunt), so it rides lastPhase like
  // lover_death does.
  test("a dawn-gate hunter_revenge renders in the game-over history under its night", async () => {
    startGame("citizen");
    // Round-2 night: the Mafia kill Bob, the dying Hunter (Hank) shoots Carol.
    serverSays({
      type: "phase_change",
      phase: "day",
      round: 2,
      messages: [],
      events: [
        { round: 2, type: "kill", playerName: "Bob" },
        { round: 2, type: "hunter_revenge", playerName: "Carol", cause: "hunter_revenge", source: "Hank" },
      ],
    });

    // Natural end (no transition in flight): the suspense reveal runs, and at
    // its 4000ms beat (≈80ms at timeScale 0.02) showGameOverScreen fires.
    serverSays({ type: "phase_change", phase: "game_over", round: 2, messages: ["The town wins!"], events: [] });
    serverSays({
      type: "game_over",
      winner: "town",
      message: "The town wins!",
      players: [
        { id: 1, username: "Tester", role: "citizen", isAlive: true, isLover: false },
        { id: 2, username: "Hank", role: "hunter", isAlive: false, isLover: false },
        { id: 3, username: "Carol", role: "mafia", isAlive: false, isLover: false },
      ],
    });

    // Wait past the reveal's showGameOverScreen beat (4000ms → ~80ms).
    await Bun.sleep(400);

    const history = $("game-history");
    expect(history.textContent).toContain("Shot by the Hunter");
    expect(history.textContent).toContain("Carol"); // the revenge victim rides the label
    expect(history.textContent).not.toContain("hunter_revenge"); // no raw-type leak
    // It buckets into the night that triggered it, not a stray day bucket.
    const nightHeader = [...history.querySelectorAll(".game-history-round")].find(
      (h: any) => h.textContent === "Night 2",
    );
    expect(nightHeader).toBeTruthy();
    const revengeItem = [...history.querySelectorAll(".game-history-item.hunter_revenge")][0];
    expect(revengeItem).toBeTruthy();
    expect(revengeItem.textContent).toContain("Carol");
  });
});

// ── C5b: the room-wide wait view ─────────────────────────────────────────────

describe("C5b: gate-list membership (hunter_revenge_pending)", () => {
  // Same L5 reasoning as hunter_revenge_targets (C5a): the reveal must not
  // render mid overlay chain (applyPhaseChange's hide-all would stomp it /
  // it would precede the queued death beats). Deliberate membership change;
  // client-gates.test.ts pins the exact lists.
  test("hunter_revenge_pending is in the transition gate", () => {
    expect([...window.__holdGateLists.transition]).toContain("hunter_revenge_pending");
  });

  test("hunter_revenge_pending is in the narration gate", () => {
    expect([...window.__holdGateLists.narration]).toContain("hunter_revenge_pending");
  });

  test("hunter_revenge_pending is in the suspense gate (reveal must not precede the death beats)", () => {
    expect([...window.__holdGateLists.suspense]).toContain("hunter_revenge_pending");
  });
});

describe("C5b: room-wide wait view on hunter_revenge_pending", () => {
  test("non-hunter sees the reveal + waiting status; non-admin sees no skip control", () => {
    joinAs(false);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "player_died", playerId: 2, playerName: "Hank", message: "Hank was killed in the night." });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });

    expect(isHidden("revenge-wait")).toBe(false);
    expect($("revenge-wait").textContent).toContain("Hank");
    expect($("revenge-wait").textContent.toLowerCase()).toContain("waiting for the hunter");
    expect(isHidden("btn-skip-revenge")).toBe(true); // never for non-admins
    expect(isHidden("night-actions")).toBe(true); // the prompt is hunter-only
  });

  test("dead spectator sees the wait view too (the reveal is public)", () => {
    joinAs(false);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "You were killed in the night." });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });

    expect(isHidden("revenge-wait")).toBe(false);
    expect($("revenge-wait").textContent).toContain("Hank");
  });

  test("admin sees the skip control; clicking sends exactly force_skip_revenge", () => {
    joinAs(true);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });

    expect(isHidden("revenge-wait")).toBe(false);
    expect(isHidden("btn-skip-revenge")).toBe(false);
    ws.sent.length = 0;
    $("btn-skip-revenge").click();
    expect(ws.sent).toEqual([{ type: "force_skip_revenge" }]);
  });

  test("hunter ordering: pending then targets — the prompt replaces the wait view", () => {
    joinAs(false);
    startGame("hunter");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "You were killed in the night." });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Tester" });
    expect(isHidden("revenge-wait")).toBe(false); // reveal first (wire order)...

    serverSays({ type: "hunter_revenge_targets", players: TARGETS });
    expect(isHidden("revenge-wait")).toBe(true); // ...then the prompt wins
    expect(isHidden("night-actions")).toBe(false);
    expect($("action-title").textContent).toBe("Take your revenge");
  });

  test("pending arriving mid dawn-suspense is held, replayed after the death beats", async () => {
    joinAs(false);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 1 }); // direct apply (no prior phase)
    serverSays({ type: "phase_change", phase: "day", round: 1, events: [] }); // night→day starts suspense
    expect(isHidden("suspense-overlay")).toBe(false);

    serverSays({ type: "player_died", playerId: 2, playerName: "Hank", message: "Hank was killed in the night." });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });
    // Held: the reveal must not render while the chain is animating.
    expect(isHidden("revenge-wait")).toBe(true);

    await Bun.sleep(300); // chain = 6300 * 0.02 = 126ms
    expect(isHidden("suspense-overlay")).toBe(true);
    // Replayed AFTER the chain-ending applyPhaseChange (which hides the wait
    // view) — so it sticks, in arrival order after the death beat.
    expect(isHidden("revenge-wait")).toBe(false);
    expect($("revenge-wait").textContent).toContain("Hank");
  });
});

describe("C5b: game_sync restore (pendingRevenge)", () => {
  test("non-hunter rejoin mid-gate renders the wait view (no skip for non-admin)", () => {
    joinAs(false);
    gatedSync({ pendingRevenge: { hunterName: "Hank", isYou: false } });

    expect(isHidden("revenge-wait")).toBe(false);
    expect($("revenge-wait").textContent).toContain("Hank");
    expect(isHidden("btn-skip-revenge")).toBe(true);
  });

  test("admin rejoin mid-gate renders the wait view WITH the skip control", () => {
    joinAs(true);
    gatedSync({ pendingRevenge: { hunterName: "Hank", isYou: false } });

    expect(isHidden("revenge-wait")).toBe(false);
    expect(isHidden("btn-skip-revenge")).toBe(false);
    ws.sent.length = 0;
    $("btn-skip-revenge").click();
    expect(ws.sent).toEqual([{ type: "force_skip_revenge" }]);
  });

  test("hunter rejoin mid-gate: no stale wait view; the re-sent targets render the prompt", () => {
    joinAs(false);
    gatedSync({
      role: "hunter",
      isDead: true,
      players: [
        { id: 1, username: "Tester", isAlive: false },
        { id: 3, username: "Bob", isAlive: true },
        { id: 4, username: "Carol", isAlive: true },
      ],
      pendingRevenge: { hunterName: "Tester", isYou: true },
    });
    // Mirrors jokerHauntPending: game_sync renders nothing for the hunter —
    // the server re-sends hunter_revenge_targets right after game_sync.
    expect(isHidden("revenge-wait")).toBe(true);

    serverSays({ type: "hunter_revenge_targets", players: TARGETS });
    expect(isHidden("night-actions")).toBe(false);
    expect($("action-title").textContent).toBe("Take your revenge");
    expect(isHidden("revenge-wait")).toBe(true);
    expect(isHidden("btn-decline-revenge")).toBe(false);
  });

  test("rejoin after resolution (no pendingRevenge key) leaves nothing stale (E10d shape)", () => {
    // Get a live wait view up first, then rejoin a gate-closed game.
    joinAs(true);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });
    expect(isHidden("revenge-wait")).toBe(false);
    expect(isHidden("btn-skip-revenge")).toBe(false);

    gatedSync({ phase: "day", dayStartedAt: Date.now() }); // gate closed: key ABSENT
    expect(isHidden("revenge-wait")).toBe(true); // no stale wait view / skip control
  });
});

describe("C5b: wait-view teardown on resolution", () => {
  test("the deferred phase_change clears the wait view (and it stays gone next phase)", async () => {
    joinAs(true);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });
    expect(isHidden("revenge-wait")).toBe(false);

    // Revenge resolves server-side: the deferred night→day phase_change
    // arrives (plus death beats if a target was shot — not needed here).
    serverSays({ type: "phase_change", phase: "day", round: 2, events: [] });
    await Bun.sleep(300); // dawn chain = 6300 * 0.02 = 126ms
    expect(isHidden("revenge-wait")).toBe(true); // torn down by applyPhaseChange

    // Next phase: nothing re-shows it.
    serverSays({ type: "phase_change", phase: "night", round: 3 });
    await Bun.sleep(250); // chain = (3400 + 600) * 0.02 = 80ms
    expect(isHidden("revenge-wait")).toBe(true);
  });

  test("a fresh game_started clears a stale wait view (restart while gated)", () => {
    joinAs(false);
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "hunter_revenge_pending", hunterName: "Hank" });
    expect(isHidden("revenge-wait")).toBe(false);

    startGame("citizen"); // play again
    expect(isHidden("revenge-wait")).toBe(true);
  });
});
