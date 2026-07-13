// Client render test: a DEAD spectator must never see WHO the Doctor saved
// under official mode. The server withholds the name (spectator_night_complete
// phase=doctor targetName=null; anonymous spectator_kill_confirmed doctorMessage
// with a null targetName on a save-only night). This drives the real DOM
// handlers via the happy-dom harness and asserts the anonymous lines render and
// the saved name NEVER appears.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

declare const document: any;
declare const localStorage: any;

const { ws, serverSays, $ } = loadClientApp();

// A distinctive name that must NEVER leak into any dead-spectator surface.
const SAVED = "Persephone";

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
  // Enter the dead-spectator state: you_died flips the client to isDead, which
  // ungates the spectator_* handlers (deadActionActive stays false).
  serverSays({ type: "you_died", message: "You were lynched." });
});

describe("official Doctor save — dead spectator sees no saved name", () => {
  test("spectator_night_complete phase=doctor with null target renders anonymously", () => {
    serverSays({ type: "spectator_night_complete", phase: "doctor", targetName: null, alive: true });

    const log = $("spectator-night-log");
    expect(log.classList.contains("hidden")).toBe(false);
    expect(log.textContent).toContain("Doctor made a choice");
    expect(log.textContent).not.toContain(SAVED);
    // No named "protect" line leaked in.
    expect(log.textContent).not.toContain("chose to protect");
  });

  test("save-only spectator_kill_confirmed renders anonymously (no saved name)", () => {
    // First the doctor completion (null target), then the anonymous dawn.
    serverSays({ type: "spectator_night_complete", phase: "doctor", targetName: null, alive: true });
    serverSays({
      type: "spectator_kill_confirmed",
      targetName: null,                          // save-only night: withheld
      doctorMessage: "The Doctor saved someone tonight",
      kills: [],
    });

    // Dawn panel: no one died, no name.
    const targets = $("action-targets");
    expect(targets.textContent).toContain("No one died");
    expect(targets.textContent).not.toContain(SAVED);

    // The anonymous save line shows, and never names the saved player.
    const status = $("action-status");
    expect(status.textContent).toBe("The Doctor saved someone tonight");
    expect(status.textContent).not.toContain(SAVED);

    // The re-rendered spectator log is likewise anonymous.
    expect($("spectator-night-log").textContent).not.toContain(SAVED);
  });

  test("guard: a NAMED (house-mode) doctor completion still renders the name", () => {
    // Proves the anonymity is driven by the null target, not by hiding the name
    // unconditionally — house mode (targetName present) must still show it.
    serverSays({ type: "spectator_night_complete", phase: "doctor", targetName: SAVED, alive: true });
    const log = $("spectator-night-log");
    expect(log.textContent).toContain("chose to protect");
    expect(log.textContent).toContain(SAVED);
  });
});
