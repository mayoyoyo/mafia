// Bug 2 — the first night's "night falls" transition must play for EVERY role
// (mafia included) before any role-specific prompt renders. Otherwise the mafia
// jumps straight to the kill screen while everyone else is mid-transition, and
// an over-the-shoulder observer can read the role off the screen.
//
// Root cause: showNightTransition (the shared NIGHTFALL overlay) is only run by
// handlePhaseChange on a day/voting -> night phase_change. On the FIRST night the
// night phase_change lands at start_game (previousPhase reset to null), so the
// overlay is skipped and mafia_targets renders the kill screen immediately.
//
// Driven through the real public/app.js DOM via the happy-dom client harness, at
// a compressed timeScale (the 4s overlay chain becomes ~80ms). Looped over the
// roles in a 7-player game so the transition is proven role-agnostic.

import { describe, test, expect, afterAll, beforeEach } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

declare const document: any;
declare const localStorage: any;

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

// A 7-player game: the local player plus six others to target.
const OTHERS = [
  { id: 2, username: "Bea" }, { id: 3, username: "Cy" }, { id: 4, username: "Di" },
  { id: 5, username: "Ed" }, { id: 6, username: "Fi" }, { id: 7, username: "Gus" },
];

function startGame(role: string, mafiaTeam: string[] = []) {
  serverSays({ type: "logged_in", userId: 1, username: "Tester" });
  serverSays({ type: "game_started", role, isLover: false, variant: 0, mafiaTeam });
}

// The first night's wire sequence: the night phase_change (at start_game) then,
// once the admin begins the night, the narration cues. `withKill` appends the
// mafia kill screen the way the server sends it to a mafia player.
function firstNightFalls(withKill: boolean) {
  serverSays({ type: "phase_change", phase: "night", round: 1, messages: [], events: [] });
  serverSays({ type: "sound_cue", sound: "night" });
  serverSays({ type: "sound_cue", sound: "everyone_close" });
  if (withKill) {
    serverSays({ type: "sound_cue", sound: "mafia_open" });
    serverSays({ type: "mafia_targets", players: OTHERS });
  }
}

describe("Bug 2: first-night NIGHTFALL transition is role-agnostic", () => {
  // The transition must show for everyone — the user's "same transition text as
  // the rest of the roles when night falls".
  for (const role of ["mafia", "detective", "doctor", "citizen"]) {
    test(`${role} sees the NIGHTFALL overlay when the first night begins`, async () => {
      startGame(role, role === "mafia" ? ["Tester"] : []);
      firstNightFalls(false);

      // The shared cinematic transition is on screen for this role.
      expect(isHidden("suspense-overlay")).toBe(false);
      expect($("suspense-pre").textContent).toBe("NIGHTFALL");

      // Let the overlay chain finish so the next test starts clean.
      await Bun.sleep(400);
      expect(isHidden("suspense-overlay")).toBe(true);
    });
  }
});

describe("Bug 2: mafia kill screen is gated behind the transition", () => {
  test("mafia does NOT see the kill screen until the night transition completes", async () => {
    startGame("mafia", ["Tester"]);
    firstNightFalls(true);

    // At the instant the kill screen arrives, the transition is still animating:
    // the NIGHTFALL overlay is up and the kill screen is held, not shown.
    expect(isHidden("suspense-overlay")).toBe(false);
    expect($("suspense-pre").textContent).toBe("NIGHTFALL");
    expect(isHidden("night-actions")).toBe(true);

    // After the transition (and the queued narration) completes, the kill screen
    // appears.
    await Bun.sleep(500);
    expect(isHidden("night-actions")).toBe(false);
    expect($("action-title").textContent).toBe("Choose a victim");
  });
});

describe("Bug 2: later nights still transition (regression)", () => {
  test("a day -> night phase_change still plays the NIGHTFALL overlay", async () => {
    startGame("citizen");
    // Land on day first, then transition into night the normal way.
    serverSays({ type: "phase_change", phase: "day", round: 1, messages: [], events: [] });
    serverSays({ type: "phase_change", phase: "night", round: 2, messages: [], events: [] });

    expect(isHidden("suspense-overlay")).toBe(false);
    expect($("suspense-pre").textContent).toBe("NIGHTFALL");
    await Bun.sleep(400);
    expect(isHidden("suspense-overlay")).toBe(true);
  });
});
