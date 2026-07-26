// P3 (Game Menu) client tests — the parts that are pure UI and must stay off
// the wire. Driven through the real DOM handlers via the happy-dom harness.
//
//  - F2 (spec:42-766 lines 23-29): the room-code field is visible on first
//    paint; the old "Join Game" reveal step is gone.
//  - F3 (spec:42-766 line 32 -> spec:287-3259 line 32): the Join CTA is
//    disabled until the code is 4 characters and enabled after — decided
//    CLIENT-SIDE, so not one frame goes out while the user types.
//  - F6 (spec:42-782 line 269 -> 268:640): the Roles in Play sheet opens from
//    the lobby nav, pre-game, from `lobby_update` alone — and shows the LINEUP
//    only, never a player's identity.
//  - F9 (spec:130-370 lines 245-253): the room code is in Settings for
//    non-admins too.
//  - Plus the pre-existing silent-error gap: #screen-lobby-player had no
//    .error-msg, so showError() swallowed anything raised there.

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

function typeCode(value: string) {
  const el = $("join-code");
  el.value = value;
  el.dispatchEvent(new (globalThis as any).Event("input", { bubbles: true }));
}

const LOBBY_SETTINGS = {
  mafiaCount: 2,
  enableDoctor: true,
  enableDetective: true,
  enableJoker: false,
  enableHunter: true,
  enableVigilante: false,
  enableLovers: false,
  enableGodfather: false,
  doctorMode: "official",
  jokerMode: "official",
};

const LOBBY_PLAYERS = [
  { id: 1, username: "dale", isAdmin: true, color: "#E53935" },
  { id: 2, username: "mo", isAdmin: false, color: "#8E24AA" },
  { id: 3, username: "jenny", isAdmin: false, color: "#1E88E5" },
  { id: 4, username: "kevin", isAdmin: false, color: "#00897B" },
  { id: 5, username: "natasha", isAdmin: false, color: "#43A047" },
  { id: 6, username: "christopher", isAdmin: false, color: "#FDD835" },
];

/** Log in and land in a lobby as `isAdmin`, with a synced lobby_update. */
function enterLobby(isAdmin: boolean) {
  serverSays({ type: "logged_in", userId: 2, username: "mo" });
  serverSays({ type: "game_joined", code: "E92G", isAdmin });
  serverSays({ type: "lobby_update", players: LOBBY_PLAYERS, settings: LOBBY_SETTINGS, adminName: "dale" });
}

describe("F2 — the room-code field is always visible", () => {
  test("no reveal step exists and the field is on screen from the start", () => {
    expect($("btn-join-show")).toBeNull();
    expect(isHidden("join-section")).toBe(false);
    expect($("join-code")).not.toBeNull();
  });
});

describe("F3 — the Join CTA disabled state is client-only", () => {
  test("disabled while the code is short, enabled at 4 chars, and reverts", () => {
    typeCode("");
    expect($("btn-join").disabled).toBe(true);

    typeCode("E9");
    expect($("btn-join").disabled).toBe(true);

    typeCode("E92G");
    expect($("btn-join").disabled).toBe(false);

    typeCode("E92");
    expect($("btn-join").disabled).toBe(true);
  });

  test("typing sends NOTHING over the wire — validity is a length check, not a probe", () => {
    typeCode("");
    typeCode("E");
    typeCode("E9");
    typeCode("E92");
    typeCode("E92G");
    typeCode("E92");
    expect(ws.sent).toEqual([]);
  });

  test("the empty-submit error is unreachable, and Enter still joins with a valid code", () => {
    serverSays({ type: "logged_in", userId: 2, username: "mo" });
    ws.sent.length = 0;

    // A click on the disabled CTA does nothing and raises no error line.
    typeCode("");
    $("btn-join").click();
    expect(ws.sent).toEqual([]);
    expect($("menu-error").textContent).toBe("");

    // Enter-to-join keybinding survives the F2/F3 rework.
    typeCode("e92g");
    $("join-code").dispatchEvent(new (globalThis as any).KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(ws.sent).toEqual([{ type: "join_game", code: "E92G" }]);
  });

  test("server-side join errors still render into #menu-error", () => {
    serverSays({ type: "logged_in", userId: 2, username: "mo" });
    serverSays({ type: "error", message: "Game not found" });
    expect($("menu-error").textContent).toBe("Game not found");
  });
});

describe("F6 — Roles in Play opens from the lobby, pre-game", () => {
  test("player lobby: the nav control renders the derived lineup with no server roster", () => {
    enterLobby(false);
    expect(isHidden("modal-roster")).toBe(true);

    $("btn-roster-lobby-player").click();
    expect(isHidden("modal-roster")).toBe(false);

    // 6 players, mafiaCount 2, doctor + detective + hunter on
    // => 2 mafia, 1 doctor, 1 detective, 1 hunter, 1 citizen (engine:831-871).
    const text = $("roster-list").textContent;
    expect(text).toContain("Mafia");
    expect(text).toContain("×2");
    expect(text).toContain("Doctor");
    expect(text).toContain("Detective");
    expect(text).toContain("Hunter");
    expect(text).toContain("Citizen");
    expect(text).not.toContain("Joker");     // toggled off
    expect(text).not.toContain("Vigilante"); // toggled off

    // Opening it is a pure read of state the lobby already had.
    expect(ws.sent).toEqual([]);
  });

  test("host lobby: the same control, the same lineup", () => {
    enterLobby(true);
    $("btn-roster-lobby-admin").click();
    expect(isHidden("modal-roster")).toBe(false);
    expect($("roster-list").textContent).toContain("Mafia");
    expect($("roster-list").textContent).toContain("×2");
  });

  test("mafia count is clamped to a third of the room, as the engine clamps it", () => {
    // 6 players with mafiaCount 4 deals 2 (engine:831 min(4, floor(6/3))).
    serverSays({ type: "logged_in", userId: 2, username: "mo" });
    serverSays({ type: "game_joined", code: "E92G", isAdmin: false });
    serverSays({
      type: "lobby_update",
      players: LOBBY_PLAYERS,
      settings: { ...LOBBY_SETTINGS, mafiaCount: 4 },
      adminName: "dale",
    });
    $("btn-roster-lobby-player").click();
    expect($("roster-list").textContent).toContain("×2");
  });

  test("the lobby sheet lists roles only — never a player's name", () => {
    enterLobby(false);
    $("btn-roster-lobby-player").click();
    const text = $("roster-list").textContent;
    for (const p of LOBBY_PLAYERS) {
      expect(text.includes(p.username), `roster leaked the name "${p.username}"`).toBe(false);
    }
  });

  test("Hunter is listed pre-game, per the existing roster relaxation", () => {
    enterLobby(false);
    $("btn-roster-lobby-player").click();
    expect($("roster-list").querySelector('[data-role="hunter"]')).not.toBeNull();
  });
});

describe("F9 — the room code is in Settings for every member of a room", () => {
  test("a non-admin player sees it", () => {
    enterLobby(false);
    $("btn-settings-lobby-player").click();
    expect(isHidden("settings-room-code")).toBe(false);
    expect($("settings-room-code-value").textContent).toBe("E92G");
  });

  test("the admin path does not regress", () => {
    enterLobby(true);
    $("btn-settings-lobby-admin").click();
    expect(isHidden("settings-room-code")).toBe(false);
    expect($("settings-room-code-value").textContent).toBe("E92G");
  });

  test("outside a room there is no code row", () => {
    serverSays({ type: "logged_in", userId: 2, username: "mo" });
    serverSays({ type: "room_closed" });
    $("btn-settings").click();
    expect(isHidden("settings-room-code")).toBe(true);
  });
});

describe("the player lobby's error slot (pre-existing silent-error gap)", () => {
  test("an error raised while a non-admin sits in the lobby is shown, not swallowed", () => {
    enterLobby(false);
    expect(document.querySelector("#screen-lobby-player .error-msg")).not.toBeNull();
    serverSays({ type: "error", message: "Invalid color" });
    expect($("lobby-player-error").textContent).toBe("Invalid color");
  });
});
