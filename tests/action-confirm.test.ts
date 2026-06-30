// Confirm/Cancel action buttons (replacing the former slide-to-confirm).
// Drives the real DOM handlers via the happy-dom client harness and asserts on
// the exact wire frames. Covers every action path that used the slider:
//   - solo target actions (doctor shown as the representative): Confirm sends
//     the action; Cancel sends nothing and lets you re-pick.
//   - mafia kill (post-consensus): Confirm sends confirm_mafia_kill; Cancel
//     withdraws the lock (reopening the team vote).

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
const framesOf = (from: number, type: string) => ws.sent.slice(from).filter((m: any) => m.type === type);

const TARGETS = [
  { id: 3, username: "Bob" },
  { id: 4, username: "Carol" },
];

function startNightAsDoctor() {
  serverSays({ type: "logged_in", userId: 1, username: "Doc" });
  serverSays({ type: "game_started", role: "doctor", isLover: false, variant: 0, mafiaTeam: [] });
  serverSays({ type: "doctor_targets", players: TARGETS });
}

function startNightAsMafiaMulti() {
  serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
  serverSays({ type: "game_started", role: "mafia", isLover: false, variant: 0, mafiaTeam: ["Mafioso", "Vito"] });
  serverSays({ type: "mafia_targets", players: TARGETS });
}

describe("solo action: Confirm / Cancel buttons", () => {
  test("selecting a target reveals the confirm buttons with a role-specific Confirm label", () => {
    startNightAsDoctor();
    expect(isHidden("action-confirm")).toBe(true); // hidden until a target is picked

    (document.querySelectorAll("#action-targets li")[0] as any).click();

    expect(isHidden("action-confirm")).toBe(false);
    expect($("btn-action-confirm").textContent.toLowerCase()).toContain("save");
    expect($("btn-action-cancel")).not.toBeNull();
  });

  test("Confirm sends the action frame for the selected target", () => {
    startNightAsDoctor();
    const from = ws.sent.length;

    (document.querySelectorAll("#action-targets li")[0] as any).click(); // Bob (3)
    $("btn-action-confirm").click();

    expect(framesOf(from, "doctor_save")).toEqual([{ type: "doctor_save", targetId: 3 }]);
    expect(isHidden("action-confirm")).toBe(true); // buttons dismissed after confirm
  });

  test("Cancel sends nothing, clears the selection, and lets you pick again", () => {
    startNightAsDoctor();
    const from = ws.sent.length;

    (document.querySelectorAll("#action-targets li")[0] as any).click(); // pick Bob
    $("btn-action-cancel").click();

    expect(framesOf(from, "doctor_save")).toEqual([]); // nothing sent
    expect(isHidden("action-confirm")).toBe(true);
    expect(document.querySelector("#action-targets li.selected")).toBeNull(); // deselected

    // Re-pick a different target and confirm — the flow still works.
    (document.querySelectorAll("#action-targets li")[1] as any).click(); // Carol (4)
    $("btn-action-confirm").click();
    expect(framesOf(from, "doctor_save")).toEqual([{ type: "doctor_save", targetId: 4 }]);
  });
});

describe("mafia kill: Confirm / Cancel buttons", () => {
  test("at consensus, Confirm sends confirm_mafia_kill with a KILL label", () => {
    startNightAsMafiaMulti();
    serverSays({ type: "mafia_confirm_ready", targetName: "Bob", targetId: 3 });

    expect(isHidden("action-confirm")).toBe(false);
    expect($("btn-action-confirm").textContent.toLowerCase()).toContain("kill");

    const from = ws.sent.length;
    $("btn-action-confirm").click();
    expect(framesOf(from, "confirm_mafia_kill")).toEqual([{ type: "confirm_mafia_kill" }]);
  });

  test("Cancel withdraws the lock (reopening the vote) instead of confirming the kill", () => {
    startNightAsMafiaMulti();
    serverSays({ type: "mafia_confirm_ready", targetName: "Bob", targetId: 3 });
    const from = ws.sent.length;

    $("btn-action-cancel").click();

    // No kill confirmed; instead an unlock vote on the locked target reopens voting.
    expect(framesOf(from, "confirm_mafia_kill")).toEqual([]);
    expect(framesOf(from, "mafia_vote")).toEqual([{ type: "mafia_vote", targetId: 3, voteType: "lock" }]);
    expect(isHidden("action-confirm")).toBe(true);
    // The vote cards are restored so the team can choose again.
    expect(document.querySelector('#action-targets li[data-id="3"]')).not.toBeNull();
  });
});
