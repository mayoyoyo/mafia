// P6 — Game Over re-skin regressions (Figma "Game options" 278:2780 /
// 332:6290 and "View game details" 278:2810).
//
// These are DOM-level assertions on public/app.js, so they run on the happy-dom
// client harness rather than the WS playtest harness: every claim below is
// about what the game-over screen RENDERS and which wire frame each control
// sends, which the bot harness (no DOM) cannot see. The wire messages
// themselves (restart_game / return_to_lobby / close_room) already have
// server-side coverage in rejoin.test.ts and handler-guards.test.ts; what was
// missing — and what the re-skin could silently break — is the client half.
//
// Pins:
//   (a) the capability triad GO-D1c keeps: admin sees Play again + Return to
//       lobby + Close room and each sends its existing message; a player sees
//       Return to lobby + Leave room.
//   (b) GO-D12's six app-only disclosures survive the Figma reveal layout:
//       alive/dead, Godfather-vs-Mafia, joint-win trophy, lover partner name,
//       mafia-last ordering, staggered reveal.
//   (c) GO-D13's force-ended variant: neutral header, no winner art, no
//       narrative body.

import { describe, test, expect, afterAll, beforeEach } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

declare const document: any;

// Compress the ~4.8s suspense + stagger into ~100ms of wall clock.
const SCALE = 0.02;
const { ws, serverSays, $ } = loadClientApp({ timeScale: SCALE });

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  ws.sent.length = 0;
});

function joinAs(admin: boolean) {
  serverSays({ type: "logged_in", userId: 1, username: "Me" });
  serverSays({ type: "game_joined", code: "ZZZZ", isAdmin: admin, players: [] });
  serverSays({ type: "game_started", role: "citizen", isLover: false, variant: 0, mafiaTeam: [] });
}

// A single scripted game with a Godfather, a lover pair, a joker (joint winner)
// and a dead player — every disclosure in one roster.
const RICH_PLAYERS = [
  { id: 1, username: "Me", role: "citizen", isAlive: true, isLover: false },
  { id: 2, username: "Bella", role: "doctor", isAlive: false, isLover: true, loverId: 3 },
  { id: 3, username: "Cyd", role: "detective", isAlive: true, isLover: true, loverId: 2 },
  { id: 4, username: "Jax", role: "joker", isAlive: false, isLover: false },
  { id: 5, username: "Vito", role: "mafia", isAlive: true, isLover: false, isGodfather: true },
  { id: 6, username: "Sal", role: "mafia", isAlive: true, isLover: false },
];

async function settle(ms = 400) {
  await Bun.sleep(ms);
}

describe("P6 (a) — game-over controls per capability (GO-D1c)", () => {
  test("admin sees Play again / Return to lobby / Close room, and each sends its existing message", async () => {
    joinAs(true);
    serverSays({ type: "game_over", winner: "town", message: "The town wins!", players: RICH_PLAYERS });
    await settle();

    // The CTA group only appears once the reveal has played (Figma animates the
    // same group from opacity 0%).
    expect($("gameover-ctas").classList.contains("hidden")).toBe(false);
    expect($("gameover-buttons").classList.contains("hidden")).toBe(false);
    expect($("gameover-buttons-player").classList.contains("hidden")).toBe(true);
    expect($("gameover-danger").classList.contains("hidden")).toBe(false);

    expect($("btn-play-again-same").textContent).toBe("Play again");
    expect($("btn-play-again-new").textContent).toBe("Return to lobby");
    expect($("btn-close-room").textContent).toBe("Close room");
    // Figma's second CTA, now a real route to the details view.
    expect($("btn-view-details").textContent).toBe("View game details");

    ws.sent.length = 0;
    $("btn-play-again-same").click();
    expect(ws.sent.map((m: any) => m.type)).toContain("restart_game");

    ws.sent.length = 0;
    $("btn-play-again-new").click();
    expect(ws.sent.map((m: any) => m.type)).toContain("return_to_lobby");

    // Close room routes through the confirm sheet before it sends.
    ws.sent.length = 0;
    $("btn-close-room").click();
    expect($("confirm-sheet").classList.contains("hidden")).toBe(false);
    expect(ws.sent.length).toBe(0);
    $("confirm-sheet-ok").click();
    expect(ws.sent.map((m: any) => m.type)).toContain("close_room");
  });

  test("player sees Return to lobby + Leave room, and no admin controls", async () => {
    joinAs(false);
    serverSays({ type: "game_over", winner: "mafia", message: "The Mafia wins!", players: RICH_PLAYERS });
    await settle();

    expect($("gameover-buttons-player").classList.contains("hidden")).toBe(false);
    expect($("gameover-buttons").classList.contains("hidden")).toBe(true);
    expect($("gameover-danger").classList.contains("hidden")).toBe(true);

    // C4: the header Leave room button has no Figma equivalent and is kept (R7).
    const leave = $("btn-leave-room");
    expect(leave.textContent).toBe("Leave room");
    expect(!!leave.closest(".hidden")).toBe(false);

    ws.sent.length = 0;
    $("btn-return-to-lobby-player").click();
    expect(ws.sent.map((m: any) => m.type)).toContain("player_return_to_lobby");

    ws.sent.length = 0;
    $("btn-leave-room").click();
    expect(ws.sent.map((m: any) => m.type)).toContain("leave_game");
  });
});

describe("P6 (b) — the reveal keeps all six app disclosures (GO-D12)", () => {
  test("godfather + lovers + joker joint win: every disclosure renders", async () => {
    joinAs(false);
    serverSays({ type: "phase_change", phase: "game_over", round: 2, messages: [], events: [
      { round: 1, type: "kill", playerName: "Bella", cause: "direct", source: "mafia" },
      { round: 2, type: "execution", playerName: "Jax" },
    ] });
    serverSays({
      type: "game_over",
      winner: "town",
      message: "The town wins!",
      jokerJointWinner: true,
      players: RICH_PLAYERS,
    });
    await settle();

    // The roster lives behind the "View game details" CTA now.
    $("btn-view-details").click();
    expect($("gameover-view-details").classList.contains("hidden")).toBe(false);
    expect($("gameover-view-options").classList.contains("hidden")).toBe(true);

    const rows = Array.from($("role-reveal").querySelectorAll(".role-reveal-item")) as any[];
    expect(rows.length).toBe(RICH_PLAYERS.length);
    // Match on the NAME cell, not the row text — a lover row also carries its
    // partner's name (disclosure 4), which would alias the two rows.
    const rowFor = (name: string) =>
      rows.find((r) => r.querySelector(".role-reveal-name").textContent === name);

    // 1. alive/dead
    expect(rowFor("Bella").classList.contains("dead")).toBe(true);
    expect(!!rowFor("Bella").querySelector(".role-reveal-dead")).toBe(true);
    expect(!!rowFor("Cyd").querySelector(".role-reveal-dead")).toBe(false);
    // 2. Godfather is distinct from Mafia
    expect(rowFor("Vito").dataset.role).toBe("godfather");
    expect(rowFor("Vito").querySelector(".role-reveal-role").textContent).toBe("godfather");
    expect(rowFor("Sal").dataset.role).toBe("mafia");
    // 3. joint-win trophy on the joker row only
    expect(!!rowFor("Jax").querySelector(".role-reveal-trophy")).toBe(true);
    expect(!!rowFor("Sal").querySelector(".role-reveal-trophy")).toBe(false);
    // 4. lover PARTNER NAME, not just a heart
    expect(rowFor("Bella").querySelector(".role-reveal-lover").textContent).toContain("Cyd");
    expect(rowFor("Cyd").querySelector(".role-reveal-lover").textContent).toContain("Bella");
    // 5. mafia-last ordering (Godfather sorts into the mafia block)
    const order = rows.map((r) => r.dataset.role);
    const firstMafia = order.findIndex((r) => r === "mafia" || r === "godfather");
    expect(firstMafia).toBeGreaterThan(0);
    expect(order.slice(firstMafia).every((r) => r === "mafia" || r === "godfather")).toBe(true);
    // 6. staggered reveal ran (every card ends revealed)
    await settle();
    expect(rows.every((r) => r.classList.contains("reveal-show"))).toBe(true);

    // GO-D2b: the post-game history rides an Events tab on the same card.
    const eventsTab = Array.from(document.querySelectorAll(".go-tab")).find(
      (b: any) => b.dataset.gotab === "events",
    ) as any;
    eventsTab.click();
    expect($("go-panel-events").classList.contains("hidden")).toBe(false);
    expect($("go-panel-players").classList.contains("hidden")).toBe(true);
    // Post-game history is the FULL-detail reveal (unchanged behaviour: at
    // phase game_over the server ships the unprojected event history).
    expect($("game-history").textContent).toContain("Killed by the Mafia");
    expect($("game-history").textContent).toContain("Night 1");
  });
});

describe("P6 (c) — force-ended games take the neutral variant (GO-D13)", () => {
  test("neutral header, no winner art, no narrative", async () => {
    joinAs(false);
    serverSays({
      type: "game_over",
      winner: "town",          // the wire always carries a winner; forceEnded rules
      forceEnded: true,
      message: "The host has left the game.",
      players: RICH_PLAYERS,
    });
    // Force-ended skips the suspense entirely.
    expect($("screen-gameover").classList.contains("active")).toBe(true);
    expect($("screen-gameover").classList.contains("win-neutral")).toBe(true);
    expect($("screen-gameover").classList.contains("win-town")).toBe(false);
    expect($("gameover-title").textContent).toBe("Game over");
    expect($("gameover-art").innerHTML).toBe("");
    expect($("gameover-pre").classList.contains("hidden")).toBe(true);
    // The server's explanatory line stays; the canonical win narrative does not.
    expect($("gameover-message").textContent).toBe("The host has left the game.");
    expect($("gameover-message").textContent).not.toContain("street lamps");
    // The reveal is still reachable.
    $("btn-view-details").click();
    expect(($("role-reveal").querySelectorAll(".role-reveal-item") as any).length).toBe(RICH_PLAYERS.length);
  });

  test("a natural town win DOES take the canonical Figma narrative (GO-D3b)", async () => {
    joinAs(false);
    serverSays({ type: "game_over", winner: "town", message: "The town breathes again.", players: RICH_PLAYERS });
    await settle();
    expect($("screen-gameover").classList.contains("win-town")).toBe(true);
    expect($("gameover-title").textContent).toBe("Citizens Win!");
    expect($("gameover-pre").textContent).toBe("The final verdict");
    expect($("gameover-message").textContent).toContain("The last of the mafia falls.");
    expect($("gameover-art").innerHTML).toContain("/img/ui/win-town.png");
  });

  test("a joker win fills the canonical line with the joker's name", async () => {
    joinAs(false);
    serverSays({ type: "game_over", winner: "joker", message: "Jax got what they wanted.", players: RICH_PLAYERS });
    await settle();
    expect($("gameover-title").textContent).toBe("Joker Wins!");
    expect($("gameover-message").textContent).toStartWith("Jax is smiling as the rope goes taut.");
    expect($("gameover-art").innerHTML).toContain("/img/ui/win-joker.png");
  });
});
