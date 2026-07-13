// Regression: a role's night-action panel must be torn down when that role's
// sub-phase closes, not left on screen for the rest of the night. Reported
// bug: the server broadcasts a `sound_cue` with sound "<role>_close" to ALL
// clients when a sub-phase ends (src/server.ts handleSubPhaseAdvance), but
// the client's sound_cue handler only queued audio — it never hid
// #night-actions. The finished role's own selection (e.g. doctor's "Name ✔")
// stayed visible through the rest of the night, letting neighbors shoulder-surf.
//
// Fix (client-only, public/app.js sound_cue handler): when
// msg.sound === myRole + "_close" for mafia/doctor/detective/vigilante, hide
// #night-actions (and for mafia, #mafia-vote-status + clear
// #mafia-vote-details), mirroring applyPhaseChange's dawn teardown.
//
// Driven through the real DOM handlers via the happy-dom client harness —
// same architecture as action-confirm.test.ts / mafia-spare-reset.test.ts.

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

const TARGETS = [
  { id: 3, username: "Bob" },
  { id: 4, username: "Carol" },
];

function selectAndConfirm(index: number) {
  (document.querySelectorAll("#action-targets li")[index] as any).click();
  $("btn-action-confirm").click();
}

describe("night-action teardown on <role>_close sound cue", () => {
  test("doctor: panel hides on doctor_close after a confirmed selection", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Doc" });
    serverSays({ type: "game_started", role: "doctor", isLover: false, variant: 0, mafiaTeam: [] });
    serverSays({ type: "doctor_targets", players: TARGETS });

    selectAndConfirm(0); // protect Bob
    serverSays({ type: "night_action_done", message: "You have chosen to protect someone tonight." });

    expect(isHidden("night-actions")).toBe(false); // still visible: own sub-phase hasn't closed yet

    serverSays({ type: "sound_cue", sound: "doctor_close" });

    expect(isHidden("night-actions")).toBe(true);
  });

  test("detective: panel hides on detective_close, but #detective-result stays visible at dawn", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Sherlock" });
    serverSays({ type: "game_started", role: "detective", isLover: false, variant: 0, mafiaTeam: [] });
    serverSays({ type: "detective_targets", players: TARGETS });

    selectAndConfirm(0); // investigate Bob
    serverSays({ type: "night_action_done", message: "You have chosen to investigate someone tonight." });

    serverSays({ type: "sound_cue", sound: "detective_close" });
    expect(isHidden("night-actions")).toBe(true);

    // Dawn reveal — detective_result is dawn-gated and intentionally stays
    // visible through the day; the teardown fix must not touch it.
    serverSays({ type: "detective_result", targetName: "Bob", isMafia: false });
    expect(isHidden("detective-result")).toBe(false);

    // Re-deliver a stray/duplicate close cue (should be a no-op either way).
    serverSays({ type: "sound_cue", sound: "detective_close" });
    expect(isHidden("detective-result")).toBe(false);
  });

  test("vigilante: panel hides on vigilante_close after a shot is fired", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Vig" });
    serverSays({ type: "game_started", role: "vigilante", isLover: false, variant: 0, mafiaTeam: [] });
    serverSays({ type: "vigilante_targets", players: TARGETS, bulletUsed: false });

    selectAndConfirm(0); // shoot Bob
    serverSays({ type: "night_action_done", message: "You have chosen your victim. Revenge is sweet." });

    expect(isHidden("night-actions")).toBe(false);

    serverSays({ type: "sound_cue", sound: "vigilante_close" });

    expect(isHidden("night-actions")).toBe(true);
  });

  test("vigilante: panel also hides on vigilante_close after holding fire (pass)", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Vig" });
    serverSays({ type: "game_started", role: "vigilante", isLover: false, variant: 0, mafiaTeam: [] });
    serverSays({ type: "vigilante_targets", players: TARGETS, bulletUsed: false });

    $("btn-vigilante-pass").click(); // hold fire — null targetId
    expect(isHidden("night-actions")).toBe(false);

    serverSays({ type: "sound_cue", sound: "vigilante_close" });

    expect(isHidden("night-actions")).toBe(true);
  });

  test("mafia (single): panel hides on mafia_close", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
    serverSays({ type: "game_started", role: "mafia", isLover: false, variant: 0, mafiaTeam: ["Mafioso"] });
    serverSays({ type: "mafia_targets", players: TARGETS });

    selectAndConfirm(0); // kill Bob (single mafia, no consensus dance)
    serverSays({ type: "night_action_done", message: "The Mafia has chosen their victim." });

    expect(isHidden("night-actions")).toBe(false);

    serverSays({ type: "sound_cue", sound: "mafia_close" });

    expect(isHidden("night-actions")).toBe(true);
  });

  test("mafia (multi): panel and vote-status both hide on mafia_close (mid-vote force-advance)", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
    serverSays({ type: "game_started", role: "mafia", isLover: false, variant: 0, mafiaTeam: ["Mafioso", "Vito"] });
    serverSays({ type: "mafia_targets", players: TARGETS });

    // Teammate nominates a target — vote-status is visible with in-flight
    // detail lines, but the team never reaches consensus (no mafia_confirm_ready).
    serverSays({
      type: "mafia_vote_update",
      voterTargets: { Vito: [{ target: "Bob", targetId: 3, voteType: "maybe" }] },
      objectedTargets: {},
      aliveMafiaCount: 2,
      lockedTarget: null,
    });

    expect(isHidden("night-actions")).toBe(false);
    expect(isHidden("mafia-vote-status")).toBe(false);
    expect($("mafia-vote-details").innerHTML).not.toBe("");

    // Night ends mid-selection (e.g. admin force-advance) — the server closes
    // the mafia sub-phase regardless of consensus.
    serverSays({ type: "sound_cue", sound: "mafia_close" });

    expect(isHidden("night-actions")).toBe(true);
    expect(isHidden("mafia-vote-status")).toBe(true);
    expect($("mafia-vote-details").innerHTML).toBe("");
  });

  test("mafia (multi): panel and vote-status both hide on mafia_close after reaching consensus", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
    serverSays({ type: "game_started", role: "mafia", isLover: false, variant: 0, mafiaTeam: ["Mafioso", "Vito"] });
    serverSays({ type: "mafia_targets", players: TARGETS });

    // Reach consensus and confirm the kill (mirrors action-confirm.test.ts).
    serverSays({ type: "mafia_confirm_ready", targetName: "Bob", targetId: 3 });
    $("btn-action-confirm").click();
    serverSays({ type: "night_action_done", message: "The Mafia has chosen their victim." });

    expect(isHidden("night-actions")).toBe(false);

    serverSays({ type: "sound_cue", sound: "mafia_close" });

    expect(isHidden("night-actions")).toBe(true);
    expect(isHidden("mafia-vote-status")).toBe(true);
  });

  test("cross-role isolation: a doctor's open panel survives another role's _close cue", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Doc" });
    serverSays({ type: "game_started", role: "doctor", isLover: false, variant: 0, mafiaTeam: [] });
    serverSays({ type: "doctor_targets", players: TARGETS });

    expect(isHidden("night-actions")).toBe(false);

    serverSays({ type: "sound_cue", sound: "mafia_close" });

    expect(isHidden("night-actions")).toBe(false); // untouched — not our cue
  });

  test("joker haunt panel is unaffected by any of the four role _close cues (no joker_close cue exists)", () => {
    serverSays({ type: "logged_in", userId: 1, username: "Joker" });
    serverSays({ type: "game_started", role: "joker", isLover: false, variant: 0, mafiaTeam: [] });
    serverSays({ type: "you_died" });
    serverSays({ type: "joker_haunt_targets", players: TARGETS });

    expect(isHidden("night-actions")).toBe(false);

    for (const sound of ["mafia_close", "doctor_close", "detective_close", "vigilante_close"]) {
      serverSays({ type: "sound_cue", sound });
      expect(isHidden("night-actions")).toBe(false);
    }
  });
});
