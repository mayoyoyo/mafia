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

  test("accuse UI hides for a dead player", () => {
    seatLivingDay();
    serverSays({ type: "you_died", message: "gone" });
    serverSays({ type: "phase_change", phase: "day", round: 1, messages: [] });
    expect($("day-accuse-controls").classList.contains("hidden")).toBe(true);
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
