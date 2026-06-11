// B6 (P7-micro) client hardening tests:
//  1. The three hold-and-replay gate lists are derived from one shared
//     constant — these tests pin their exact membership to the pre-B6
//     hand-maintained literals (the L5 trap guard).
//  2. jokerHauntActive generalized to deadActionActive — the six spectator
//     guards and showNightAction's dead-guard key off the one flag any
//     dead-player action sets (today: only the joker haunt).
//
// Loads the harness with a compressed timeScale so the multi-second overlay
// chains complete in tens of milliseconds (separate file from
// client-app.test.ts, which loads the harness at real speed).

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

// game_started resets all per-game client state (incl. deadActionActive and
// previousPhase), so each test starts from a clean slate.
function startGame(role: string, mafiaTeam: string[] = []) {
  serverSays({ type: "logged_in", userId: 1, username: "Tester" });
  serverSays({ type: "game_started", role, isLover: false, variant: 0, mafiaTeam });
}

describe("B6: derived hold-and-replay gate lists", () => {
  // These literals are the exact membership of the three hand-maintained
  // lists as of the commit before B6, plus hunter_revenge_targets (C5a) and
  // hunter_revenge_pending (C5b) — deliberate membership changes in all
  // three gates; hunter-client.test.ts pins the held/replayed behavior.
  // Both ride the death-triggered revenge flow: neither the hunter's prompt
  // nor the room-wide reveal may render before the death beats complete or
  // mid overlay chain (the chain-ending applyPhaseChange would stomp them).
  // If a derivation change alters any gate's membership, these pins fail.
  const PROMPTS = [
    "mafia_targets",
    "doctor_targets",
    "detective_targets",
    "joker_haunt_targets",
    "hunter_revenge_pending",
    "hunter_revenge_targets",
    "spectator_joker_deliberating",
    "spectator_joker_resolved",
  ];

  test("suspense gate holds exactly the death beats + the death-triggered revenge reveal and prompt", () => {
    expect([...window.__holdGateLists.suspense].sort()).toEqual(
      ["player_died", "you_died", "joker_win_overlay", "hunter_revenge_pending", "hunter_revenge_targets"].sort()
    );
  });

  test("night/execution transition gate holds exactly sound_cue + the prompts", () => {
    expect([...window.__holdGateLists.transition].sort()).toEqual(
      ["sound_cue", ...PROMPTS].sort()
    );
  });

  test("night narration gate holds exactly the prompts", () => {
    expect([...window.__holdGateLists.narration].sort()).toEqual([...PROMPTS].sort());
  });
});

describe("B6: gate behavior (hold during overlay, replay after)", () => {
  test("a night prompt arriving mid night-transition is held, then replayed", async () => {
    startGame("mafia", ["Tester"]);
    serverSays({ type: "phase_change", phase: "day", round: 1 });
    serverSays({ type: "phase_change", phase: "night", round: 1 }); // day→night starts the overlay chain
    expect(isHidden("suspense-overlay")).toBe(false);

    serverSays({ type: "mafia_targets", players: [{ id: 3, username: "Bob" }] });
    // Held: the prompt must not render while the chain is animating.
    expect(isHidden("night-actions")).toBe(true);

    await Bun.sleep(250); // chain = (3400 + 600) * 0.02 = 80ms
    expect(isHidden("suspense-overlay")).toBe(true);
    expect(isHidden("night-actions")).toBe(false); // replayed after applyPhaseChange
    expect($("action-targets").textContent).toContain("Bob");
  });

  test("a non-gated message dispatches immediately during the night transition", async () => {
    startGame("doctor");
    serverSays({ type: "phase_change", phase: "day", round: 1 });
    serverSays({ type: "phase_change", phase: "night", round: 1 });
    expect(isHidden("suspense-overlay")).toBe(false);

    serverSays({ type: "night_action_done", message: "Done for tonight." });
    expect($("action-status").textContent).toBe("Done for tonight.");

    await Bun.sleep(250); // let the chain finish so it can't leak into other tests
  });

  test("a death beat arriving mid dawn-suspense is held, then replayed", async () => {
    startGame("villager");
    serverSays({ type: "phase_change", phase: "night", round: 1 }); // direct apply (no prior phase)
    serverSays({ type: "phase_change", phase: "day", round: 1, events: [] }); // night→day starts suspense
    expect(isHidden("suspense-overlay")).toBe(false);

    serverSays({ type: "you_died", message: "You were killed in the night." });
    // Held: the dead overlay must not appear mid-suspense.
    expect(isHidden("dead-overlay")).toBe(true);

    await Bun.sleep(300); // chain = 6300 * 0.02 = 126ms
    expect(isHidden("suspense-overlay")).toBe(true);
    expect(isHidden("dead-overlay")).toBe(false);
    expect($("death-message").textContent).toBe("You were killed in the night.");
  });
});

describe("B6: deadActionActive (generalized from jokerHauntActive)", () => {
  test("dead joker haunt: prompt renders despite death, spectator views are suppressed", () => {
    startGame("joker");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "Executed by the town." });

    serverSays({ type: "joker_haunt_targets", players: [{ id: 3, username: "Bob" }] });
    // The dead-guard exempts the active dead action.
    expect(isHidden("night-actions")).toBe(false);
    expect($("action-title").textContent).toBe("Choose someone to haunt");

    // Spectator beats are suppressed while the dead action is active.
    serverSays({ type: "spectator_joker_deliberating" });
    expect(isHidden("joker-spectator-status")).toBe(true);
    serverSays({ type: "spectator_night_phase", subPhase: "doctor", isRoleAlive: true });
    expect($("action-title").textContent).toBe("Choose someone to haunt"); // not overwritten
  });

  test("dead player without an active dead action: spectator views render", () => {
    startGame("villager");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "Killed in the night." });

    serverSays({ type: "spectator_joker_deliberating" });
    expect(isHidden("joker-spectator-status")).toBe(false);
    expect($("joker-spectator-status").textContent).toContain("Joker is choosing");
  });

  test("dead-guard: a dead player with no active dead action never renders a night prompt", () => {
    startGame("villager");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "Killed in the night." });

    serverSays({ type: "doctor_targets", players: [{ id: 3, username: "Bob" }] });
    expect(isHidden("night-actions")).toBe(true);
  });

  test("the flag clears when the next night begins: spectator views resume", () => {
    startGame("joker");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "Executed by the town." });
    serverSays({ type: "joker_haunt_targets", players: [{ id: 3, username: "Bob" }] });
    serverSays({ type: "spectator_joker_deliberating" });
    expect(isHidden("joker-spectator-status")).toBe(true); // suppressed while haunting

    serverSays({ type: "phase_change", phase: "night", round: 3 }); // new night resets the flag
    serverSays({ type: "spectator_joker_deliberating" });
    expect(isHidden("joker-spectator-status")).toBe(false);
  });

  test("game_sync restore: jokerHauntPending re-arms the flag (haunt view, spectators suppressed)", () => {
    // A real rejoin is a fresh page load; restore this element's page-load
    // default (handleGameSync doesn't touch it, and the harness reuses the DOM).
    $("joker-spectator-status").classList.add("hidden");
    serverSays({ type: "logged_in", userId: 1, username: "Tester" });
    serverSays({ type: "game_joined", code: "ABCD", isAdmin: false });
    serverSays({
      type: "game_sync",
      code: "ABCD",
      players: [
        { id: 1, username: "Tester", isAlive: false },
        { id: 2, username: "Bob", isAlive: true },
      ],
      role: "joker",
      isLover: false,
      variant: 0,
      mafiaTeam: [],
      isDead: true,
      phase: "night",
      nightSubPhase: "resolving",
      round: 2,
      dayVoteCount: 0,
      narratorHistory: [],
      detectiveHistory: [],
      eventHistory: [],
      nightAction: {
        locked: true,
        targetName: "Bob",
        targets: [],
        voterTargets: {},
        jokerHauntPending: true,
      },
    });

    expect($("action-targets").textContent).toContain("Bob ✔");
    serverSays({ type: "spectator_joker_deliberating" });
    expect(isHidden("joker-spectator-status")).toBe(true);
  });
});
