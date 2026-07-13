// Client render test: owner ruling — a DEAD spectator IS omniscient and SHOULD
// see who the Doctor saved, in both modes (restores the dead-spectator night
// log). The server now sends the real name (spectator_night_complete
// phase=doctor targetName=<name>; spectator_kill_confirmed doctorMessage
// "Doctor saved <name>"). The save stays secret only to LIVING players (dawn
// narration) and the saved victim (never notified) — enforced server-side and
// covered by the playtest, not this render harness.
//
// This drives the real DOM handlers via the happy-dom harness and asserts the
// NAMED lines render, and that a save-only night still shows "No one died" (a
// save is a save, never a death). The null-target fallback ("Doctor made a
// choice") is kept as a robustness case.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

declare const document: any;
declare const localStorage: any;

const { ws, serverSays, $ } = loadClientApp();

// The saved player's name — a dead spectator IS allowed to see it.
const SAVED = "Persephone";

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
  // Reset the accumulated spectator night log between tests (module state
  // persists across cases): a fresh night phase_change clears it.
  serverSays({ type: "phase_change", phase: "night", round: 1, messages: [] });
  // Enter the dead-spectator state: you_died flips the client to isDead, which
  // ungates the spectator_* handlers (deadActionActive stays false).
  serverSays({ type: "you_died", message: "You were lynched." });
});

describe("Doctor save — dead spectator sees who was saved (omniscient night log)", () => {
  test("spectator_night_complete phase=doctor with a named target renders the protect line", () => {
    serverSays({ type: "spectator_night_complete", phase: "doctor", targetName: SAVED, alive: true });

    const log = $("spectator-night-log");
    expect(log.classList.contains("hidden")).toBe(false);
    expect(log.textContent).toContain("chose to protect");
    expect(log.textContent).toContain(SAVED);
  });

  test("save-only spectator_kill_confirmed shows the save as a save, never a death", () => {
    // First the doctor completion (named), then the dawn on a save-only night.
    serverSays({ type: "spectator_night_complete", phase: "doctor", targetName: SAVED, alive: true });
    serverSays({
      type: "spectator_kill_confirmed",
      targetName: SAVED,                              // payload may carry the name again
      doctorMessage: `Doctor saved ${SAVED}`,
      kills: [],                                      // save-only night: no deaths
    });

    // Dawn panel: no one died (rendered from the empty kills array, NOT targetName),
    // so the saved player is never shown as having died.
    const targets = $("action-targets");
    expect(targets.textContent).toContain("No one died");
    expect(targets.textContent).not.toContain("died in the night\n" + SAVED);

    // The named save line shows in the status.
    const status = $("action-status");
    expect(status.textContent).toBe(`Doctor saved ${SAVED}`);
    expect(status.textContent).toContain(SAVED);

    // The re-rendered spectator log names the protected player.
    expect($("spectator-night-log").textContent).toContain(SAVED);
  });

  test("robustness: a null-target doctor completion still renders an anonymous fallback", () => {
    // Defends the null path (e.g. a doctor who fell / a future anonymised source):
    // the client must not crash or leak — it renders the neutral "made a choice".
    serverSays({ type: "spectator_night_complete", phase: "doctor", targetName: null, alive: true });
    const log = $("spectator-night-log");
    expect(log.textContent).toContain("Doctor made a choice");
    expect(log.textContent).not.toContain("chose to protect");
  });
});
