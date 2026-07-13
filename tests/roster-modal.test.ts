// "Roles in Play" modal — a dismissible popup, openable any time during the
// game from a header button, showing every player which roles (and how many)
// are in play. Driven through the real DOM handlers via the happy-dom harness.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

declare const document: any;
declare const localStorage: any;

const { ws, serverSays } = loadClientApp();

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
});

const $ = (id: string) => document.getElementById(id);
const isHidden = (id: string) => $(id).classList.contains("hidden");

const ROSTER = {
  roles: [
    { role: "mafia", count: 2 },
    { role: "doctor", count: 1 },
    { role: "detective", count: 1 },
    { role: "citizen", count: 3 },
  ],
  godfather: false,
  lovers: false,
};

function startGameWithRoster(roster: unknown, role = "citizen") {
  serverSays({ type: "logged_in", userId: 1, username: "P" });
  serverSays({ type: "game_started", role, isLover: false, variant: 0, mafiaTeam: [], roster });
}

describe("Roles in Play modal", () => {
  test("opens from the header button and lists every role with its count", () => {
    startGameWithRoster(ROSTER);
    expect(isHidden("modal-roster")).toBe(true); // closed by default

    $("btn-roster").click();
    expect(isHidden("modal-roster")).toBe(false);

    const text = $("roster-list").textContent;
    expect(text).toContain("Mafia");
    expect(text).toContain("×2");
    expect(text).toContain("Doctor");
    expect(text).toContain("Detective");
    expect(text).toContain("Citizen");
    expect(text).toContain("×3");
  });

  test("each row is colored by its role token", () => {
    startGameWithRoster(ROSTER);
    $("btn-roster").click();
    const mafiaRow = $("roster-list").querySelector('[data-role="mafia"]');
    expect(mafiaRow).not.toBeNull();
    expect(mafiaRow.getAttribute("style") || "").toContain("--role-mafia");
  });

  test("dismisses via the close button and via a backdrop tap", () => {
    startGameWithRoster(ROSTER);

    $("btn-roster").click();
    expect(isHidden("modal-roster")).toBe(false);
    $("btn-close-roster").click();
    expect(isHidden("modal-roster")).toBe(true);

    $("btn-roster").click();
    expect(isHidden("modal-roster")).toBe(false);
    $("modal-roster").click(); // tap the backdrop (the modal element itself)
    expect(isHidden("modal-roster")).toBe(true);
  });

  test("shows the Godfather and Lovers modifiers when active", () => {
    startGameWithRoster({ roles: [{ role: "mafia", count: 2 }, { role: "citizen", count: 4 }], godfather: true, lovers: true }, "mafia");
    $("btn-roster").click();
    const text = $("roster-list").textContent;
    expect(text).toContain("Godfather");
    expect(text).toContain("Lovers");
  });

  test("a rejoining player gets the roster from game_sync", () => {
    serverSays({ type: "logged_in", userId: 1, username: "P" });
    serverSays({ type: "game_joined", code: "ABCD", isAdmin: false });
    serverSays({
      type: "game_sync",
      code: "ABCD",
      isAdmin: false,
      players: [
        { id: 1, username: "P", isAlive: true },
        { id: 2, username: "Q", isAlive: true },
        { id: 3, username: "R", isAlive: true },
      ],
      role: "citizen",
      isLover: false,
      variant: 0,
      roster: ROSTER,
      isDead: false,
      phase: "day",
      nightSubPhase: null,
      round: 1,
      dayVoteCount: 0,
      narratorHistory: [],
      detectiveHistory: [],
      eventHistory: [],
      nightAction: null,
    });

    $("btn-roster").click();
    expect(isHidden("modal-roster")).toBe(false);
    expect($("roster-list").textContent).toContain("Mafia");
    expect($("roster-list").textContent).toContain("×2");
  });
});
