// Player-initiated accusations — client render/behaviour tests (happy-dom).
//
// Drives the real public/app.js DOM handlers: the ACCUSE launcher + target
// picker, the pending-accusations panel and its SECOND / WITHDRAW eligibility,
// and the panel's visibility across day / voting / dead states.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

declare const document: any;
declare const localStorage: any;

const { ws, serverSays, $ } = loadClientApp();

afterAll(async () => { await unloadClientApp(); });

const PLAYERS = [
  { id: 1, username: "Me", isAlive: true, isAdmin: false },
  { id: 2, username: "Bob", isAlive: true, isAdmin: false },
  { id: 3, username: "Carol", isAlive: true, isAdmin: false },
  { id: 4, username: "Dave", isAlive: true, isAdmin: false },
];

// Seat "Me" (userId 1) as a living citizen, in the day phase, with a known
// player roster.
function seatLivingDay() {
  serverSays({ type: "logged_in", userId: 1, username: "Me" });
  serverSays({ type: "game_started", role: "citizen", isLover: false, variant: 0 });
  serverSays({ type: "player_list", players: PLAYERS.map((p) => ({ ...p })) });
  serverSays({ type: "phase_change", phase: "day", round: 1, messages: [] });
}

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
});

describe("accuse launcher + picker", () => {
  test("ACCUSE button shows for a living player during the day", () => {
    seatLivingDay();
    expect($("day-accuse-controls").classList.contains("hidden")).toBe(false);
    expect($("btn-accuse").disabled).toBe(false);
  });

  // P5 (mockup state 7): a dead player keeps the standing-accusations list but
  // loses every affordance — the launcher and picker come down and a spectator
  // note takes their place. Accusations are public by construction (the server
  // broadcasts accusations_update room-wide and narrates each one), so this
  // discloses nothing the dead client wasn't already being sent.
  test("a dead player loses the accuse launcher but keeps a read-only view", () => {
    seatLivingDay();
    serverSays({ type: "you_died", message: "gone" });
    serverSays({ type: "phase_change", phase: "day", round: 1, messages: [] });
    expect($("day-accuse-controls").classList.contains("hidden")).toBe(false);
    expect($("accuse-launch").classList.contains("hidden")).toBe(true);
    expect($("accuse-picker").classList.contains("hidden")).toBe(true);
    expect($("accuse-spectator-note").classList.contains("hidden")).toBe(false);
  });

  test("a dead player's accusation rows carry no Second/Withdraw controls", () => {
    seatLivingDay();
    serverSays({ type: "you_died", message: "gone" });
    serverSays({ type: "phase_change", phase: "day", round: 1, messages: [] });
    serverSays({
      type: "accusations_update",
      accusations: [
        { id: 21, accuserId: 2, accuserName: "Bob", targetId: 3, targetName: "Carol" },
        { id: 22, accuserId: 1, accuserName: "Me", targetId: 4, targetName: "Dave" },
      ],
      accusationsMade: [1, 2],
      secondsMade: [],
    });
    const panel = $("accusations-panel");
    expect(panel.querySelectorAll(".accusation-row").length).toBe(2);
    expect(panel.querySelectorAll(".acc-second").length).toBe(0);
    // Even the row this client accused offers no Withdraw once they are dead.
    expect(panel.querySelectorAll(".acc-withdraw").length).toBe(0);
    expect(panel.querySelectorAll(".accusation-row-readonly").length).toBe(2);
    expect($("accusations-heading").classList.contains("hidden")).toBe(false);
  });

  test("target picker lists living players minus self, plus a sleep row", () => {
    seatLivingDay();
    $("btn-accuse").click();
    expect($("accuse-picker").classList.contains("hidden")).toBe(false);
    const items = Array.from($("accuse-target-list").querySelectorAll("li"));
    const ids = items.map((li: any) => li.dataset.id);
    expect(ids).toContain("2");
    expect(ids).toContain("3");
    expect(ids).toContain("4");
    expect(ids).not.toContain("1");     // never self
    expect(ids).toContain("sleep");     // propose-sleep row present
  });

  test("selecting a target + Confirm sends accuse; sleep row sends null target", () => {
    seatLivingDay();
    $("btn-accuse").click();
    // Confirm is disabled until a target is picked.
    expect($("btn-accuse-confirm").disabled).toBe(true);
    $("accuse-target-list").querySelector('li[data-id="3"]').click();
    expect($("btn-accuse-confirm").disabled).toBe(false);
    $("btn-accuse-confirm").click();
    expect(ws.sent.at(-1)).toEqual({ type: "accuse", targetId: 3 });

    // Sleep proposal → targetId null.
    ws.sent.length = 0;
    $("btn-accuse").click();
    $("accuse-target-list").querySelector('li[data-id="sleep"]').click();
    $("btn-accuse-confirm").click();
    expect(ws.sent.at(-1)).toEqual({ type: "accuse", targetId: null });
  });

  test("launcher disables once this player has used their accusation", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 0, accuserId: 1, accuserName: "Me", targetId: 2, targetName: "Bob" }],
      accusationsMade: [1],
      secondsMade: [],
    });
    expect($("btn-accuse").disabled).toBe(true);
  });
});

describe("pending accusations panel — SECOND / WITHDRAW eligibility", () => {
  function accusationBy2Against3() {
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 5, accuserId: 2, accuserName: "Bob", targetId: 3, targetName: "Carol" }],
      accusationsMade: [2],
      secondsMade: [],
    });
  }

  test("an eligible bystander sees a Second button (and no Withdraw)", () => {
    seatLivingDay();
    accusationBy2Against3(); // Me (1) is neither accuser nor accused
    const row = $("accusations-panel").querySelector('.accusation-row[data-id="5"]');
    expect(row).not.toBeNull();
    expect(row.querySelector(".acc-second")).not.toBeNull();
    expect(row.querySelector(".acc-withdraw")).toBeNull();
    row.querySelector(".acc-second").click();
    expect(ws.sent.at(-1)).toEqual({ type: "second_accusation", accusationId: 5 });
  });

  test("the accuser sees Withdraw and no Second on their own accusation", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 7, accuserId: 1, accuserName: "Me", targetId: 3, targetName: "Carol" }],
      accusationsMade: [1],
      secondsMade: [],
    });
    const row = $("accusations-panel").querySelector('.accusation-row[data-id="7"]');
    expect(row.querySelector(".acc-second")).toBeNull();     // can't second your own
    expect(row.querySelector(".acc-withdraw")).not.toBeNull();
    row.querySelector(".acc-withdraw").click();
    expect(ws.sent.at(-1)).toEqual({ type: "withdraw_accusation", accusationId: 7 });
  });

  test("the accused cannot second their own trial", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 9, accuserId: 2, accuserName: "Bob", targetId: 1, targetName: "Me" }],
      accusationsMade: [2],
      secondsMade: [],
    });
    const row = $("accusations-panel").querySelector('.accusation-row[data-id="9"]');
    expect(row.querySelector(".acc-second")).toBeNull();
  });

  test("no Second button once this player has already seconded today", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 11, accuserId: 2, accuserName: "Bob", targetId: 3, targetName: "Carol" }],
      accusationsMade: [2],
      secondsMade: [1], // Me already seconded something earlier
    });
    const row = $("accusations-panel").querySelector('.accusation-row[data-id="11"]');
    expect(row.querySelector(".acc-second")).toBeNull();
  });
});

describe("panel visibility across phases", () => {
  test("accuse UI hides and panel is not shown once a vote starts", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 3, accuserId: 2, accuserName: "Bob", targetId: 3, targetName: "Carol" }],
      accusationsMade: [2],
      secondsMade: [],
    });
    expect($("day-accuse-controls").classList.contains("hidden")).toBe(false);
    // A vote opens (accusation seconded elsewhere).
    serverSays({ type: "vote_called", targetName: "Carol", targetId: 3 });
    expect($("day-accuse-controls").classList.contains("hidden")).toBe(true);
    expect($("voting-panel").classList.contains("hidden")).toBe(false);
  });

  test("a sleep ballot shows the sleep prompt, not an execution prompt", () => {
    seatLivingDay();
    serverSays({ type: "vote_called", targetName: "", targetId: 0, sleep: true });
    expect($("voting-title").textContent).toContain("sleep");
    expect($("voting-title").textContent).not.toContain("Execute");
  });
});

// ── P5 restyle: the designed states from day-accusation-mockups.html ────────
describe("P5 — designed accusation states", () => {
  test("each viewer treatment gets its own status line", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [
        { id: 31, accuserId: 1, accuserName: "Me", targetId: 4, targetName: "Dave" },  // mine
        { id: 32, accuserId: 2, accuserName: "Bob", targetId: 1, targetName: "Me" },   // I'm accused
        { id: 33, accuserId: 3, accuserName: "Carol", targetId: 4, targetName: "Dave" }, // second-able
      ],
      accusationsMade: [1, 2, 3],
      secondsMade: [],
    });
    const panel = $("accusations-panel");
    const statusOf = (id: number) =>
      panel.querySelector(`.accusation-row[data-id="${id}"] .accusation-status`).textContent;
    expect(statusOf(31)).toContain("Yours");
    expect(statusOf(32)).toContain("can't second");
    expect(statusOf(33)).toBe("Needs a second");
    // Exactly one action per row, and none on the row where I am the accused.
    expect(panel.querySelector('.accusation-row[data-id="31"] .acc-withdraw')).not.toBeNull();
    expect(panel.querySelector('.accusation-row[data-id="32"] .acc-pill')).toBeNull();
    expect(panel.querySelector('.accusation-row[data-id="33"] .acc-second')).not.toBeNull();
    expect(panel.querySelector('.accusation-row[data-id="32"]').classList.contains("accusation-row-accused")).toBe(true);
  });

  test("a spent second leaves every row action-free with the spent status", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 41, accuserId: 2, accuserName: "Bob", targetId: 3, targetName: "Carol" }],
      accusationsMade: [2],
      secondsMade: [1],
    });
    const row = $("accusations-panel").querySelector('.accusation-row[data-id="41"]');
    expect(row.querySelector(".acc-second")).toBeNull();
    expect(row.querySelector(".accusation-status").textContent).toBe("Second spent for today");
  });

  test("a sleep proposal renders as a moon row with the same Second control", () => {
    seatLivingDay();
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 51, accuserId: 2, accuserName: "Bob", targetId: null, targetName: "" }],
      accusationsMade: [2],
      secondsMade: [],
    });
    const row = $("accusations-panel").querySelector('.accusation-row[data-id="51"]');
    expect(row.querySelector(".accusation-text").textContent).toContain("moves that the town sleeps");
    expect(row.querySelector(".acc-moon")).not.toBeNull();
    expect(row.querySelector(".acc-second")).not.toBeNull();
  });

  test("the heading only exists while something is standing", () => {
    seatLivingDay();
    expect($("accusations-heading").classList.contains("hidden")).toBe(true);
    serverSays({
      type: "accusations_update",
      accusations: [{ id: 61, accuserId: 2, accuserName: "Bob", targetId: 3, targetName: "Carol" }],
      accusationsMade: [2],
      secondsMade: [],
    });
    expect($("accusations-heading").classList.contains("hidden")).toBe(false);
    expect($("accusations-heading").textContent).toBe("Standing accusations");
    serverSays({ type: "accusations_update", accusations: [], accusationsMade: [2], secondsMade: [] });
    expect($("accusations-heading").classList.contains("hidden")).toBe(true);
  });

  test("execution ballot: Figma copy, target art, and the post-vote dim", () => {
    seatLivingDay();
    serverSays({ type: "vote_called", targetName: "Carol", targetId: 3 });
    // 270:1649 drops the old "Vote:" prefix.
    expect($("voting-title").textContent).toBe("Execute Carol?");
    expect($("vote-target-art").classList.contains("hidden")).toBe(false);
    expect($("voting-panel").classList.contains("voted")).toBe(false);
    serverSays({ type: "vote_update", totalVotes: 2, total: 4 });
    expect($("vote-progress").textContent).toBe("2/4 votes cast");
    $("btn-vote-yes").click();
    expect($("voting-panel").classList.contains("voted")).toBe(true);
    expect($("vote-buttons-wrapper").classList.contains("hidden")).toBe(false); // hidden by the server's next frame
  });

  test("sleep ballot: no target art, labelled thumbs", () => {
    seatLivingDay();
    serverSays({ type: "vote_called", targetName: "", targetId: 0, sleep: true });
    expect($("vote-target-art").classList.contains("hidden")).toBe(true);
    expect($("btn-vote-yes").textContent).toBe("Sleep");
    expect($("btn-vote-no").textContent).toBe("Stay up");
    // …and back to an unlabelled execution ballot afterwards.
    serverSays({ type: "vote_called", targetName: "Carol", targetId: 3 });
    expect($("btn-vote-yes").textContent).toBe("");
  });
});
