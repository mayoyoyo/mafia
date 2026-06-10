// Client-side behavioral tests for public/app.js (M11, L6).
// Drives the real DOM handlers via the happy-dom harness and asserts on the
// exact wire frames sent through the stub WebSocket.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

// The server tsconfig has no "dom" lib; these exist at runtime once the
// harness has registered happy-dom globals.
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

function mafiaVoteFrames(from: number) {
  return ws.sent.slice(from).filter((m) => m.type === "mafia_vote");
}

function startNightAsMafia(mafiaTeam: string[]) {
  serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
  serverSays({
    type: "game_started",
    role: "mafia",
    isLover: false,
    variant: 0,
    mafiaTeam,
  });
  serverSays({
    type: "mafia_targets",
    players: [
      { id: 3, username: "Bob" },
      { id: 4, username: "Carol" },
    ],
  });
}

// Renders the multi-mafia card list where both targets are partial-locked by
// other mafia, so each card shows the auto maybe+lock "Lock In" button for me.
function startMultiMafiaPartialLockNight() {
  startNightAsMafia(["Mafioso", "Vito", "Tony"]);
  serverSays({
    type: "mafia_vote_update",
    voterTargets: {
      Vito: [{ target: "Bob", targetId: 3, voteType: "lock" }],
      Tony: [{ target: "Carol", targetId: 4, voteType: "lock" }],
    },
    objectedTargets: {},
    aliveMafiaCount: 3,
    lockedTarget: null,
  });
}

function lockInButton(targetId: number): any {
  const btn = document.querySelector(
    `#action-targets li[data-id="${targetId}"] .mtc-btn-lock`
  );
  if (!btn) throw new Error(`no Lock In button for target ${targetId}`);
  return btn as any;
}

describe("M11: single-mafia target selection", () => {
  test("double-tapping the same target sends exactly one maybe+lock pair (no toggle-off)", async () => {
    startNightAsMafia(["Mafioso"]);
    const from = ws.sent.length;

    const lis = document.querySelectorAll("#action-targets li");
    (lis[0] as any).click();
    (lis[0] as any).click();
    await Bun.sleep(80); // let any delayed sends flush

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("rapidly switching targets never locks a target different from the UI selection", async () => {
    startNightAsMafia(["Mafioso"]);
    const from = ws.sent.length;

    const lis = document.querySelectorAll("#action-targets li");
    (lis[0] as any).click(); // tap Bob (3)
    (lis[1] as any).click(); // immediately tap Carol (4)
    await Bun.sleep(80);

    const frames = mafiaVoteFrames(from);
    const locks = frames.filter((f) => f.voteType === "lock");
    expect(locks.length).toBe(1);

    // The UI highlight must match the target the wire locked.
    const selected = document.querySelector(
      "#action-targets li.selected"
    ) as any;
    expect(selected).not.toBeNull();
    expect(String(locks[0].targetId)).toBe(selected.dataset.id);

    // First tap wins outright: exactly one maybe+lock pair, no strays.
    expect(frames).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("a fresh night re-render allows picking again", async () => {
    startNightAsMafia(["Mafioso"]);
    (document.querySelectorAll("#action-targets li")[0] as any).click();
    await Bun.sleep(80);

    // Next night: server re-sends targets, list re-renders.
    serverSays({
      type: "mafia_targets",
      players: [
        { id: 3, username: "Bob" },
        { id: 4, username: "Carol" },
      ],
    });
    const from = ws.sent.length;
    (document.querySelectorAll("#action-targets li")[1] as any).click();
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 4, voteType: "maybe" },
      { type: "mafia_vote", targetId: 4, voteType: "lock" },
    ]);
  });
});

describe("M11: multi-mafia auto Lock In (partial-lock card)", () => {
  test("double-clicking Lock In sends exactly one maybe+lock pair (no toggle-off)", async () => {
    startMultiMafiaPartialLockNight();
    const from = ws.sent.length;

    const btn = lockInButton(3);
    btn.click();
    btn.click();
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("clicking Lock In on a second card while the first is in flight is ignored", async () => {
    startMultiMafiaPartialLockNight();
    const from = ws.sent.length;

    lockInButton(3).click();
    lockInButton(4).click(); // in flight — must not produce any frames
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 3, voteType: "maybe" },
      { type: "mafia_vote", targetId: 3, voteType: "lock" },
    ]);
  });

  test("after a server vote update echoes back, Lock In works again", async () => {
    startMultiMafiaPartialLockNight();
    lockInButton(3).click();
    await Bun.sleep(80);

    // Server echo arrives (here: my votes didn't stick — list re-renders).
    serverSays({
      type: "mafia_vote_update",
      voterTargets: {
        Vito: [{ target: "Bob", targetId: 3, voteType: "lock" }],
        Tony: [{ target: "Carol", targetId: 4, voteType: "lock" }],
      },
      objectedTargets: {},
      aliveMafiaCount: 3,
      lockedTarget: null,
    });

    const from = ws.sent.length;
    lockInButton(4).click();
    await Bun.sleep(80);

    expect(mafiaVoteFrames(from)).toEqual([
      { type: "mafia_vote", targetId: 4, voteType: "maybe" },
      { type: "mafia_vote", targetId: 4, voteType: "lock" },
    ]);
  });
});

describe("L6: corrupt mafia_user localStorage", () => {
  test("corrupt JSON does not throw on connect, removes the bad key, sends no login", () => {
    localStorage.setItem("mafia_user", "{definitely not json");
    const from = ws.sent.length;

    expect(() => ws.onopen!()).not.toThrow();

    expect(localStorage.getItem("mafia_user")).toBeNull();
    expect(ws.sent.slice(from).filter((m) => m.type === "login")).toEqual([]);
  });

  test("non-object stored value is treated as logged-out", () => {
    localStorage.setItem("mafia_user", "null");
    const from = ws.sent.length;

    expect(() => ws.onopen!()).not.toThrow();

    expect(localStorage.getItem("mafia_user")).toBeNull();
    expect(ws.sent.slice(from).filter((m) => m.type === "login")).toEqual([]);
  });

  test("valid stored credentials still auto-login on connect", () => {
    localStorage.setItem(
      "mafia_user",
      JSON.stringify({ username: "Mafioso", passcode: "1234" })
    );
    const from = ws.sent.length;

    ws.onopen!();

    expect(ws.sent.slice(from)).toEqual([
      { type: "login", username: "Mafioso", passcode: "1234" },
    ]);
  });
});
