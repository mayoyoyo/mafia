// Regression: a mafia "Spare" (letsnot/objection) must NOT survive into the
// next night. Reported bug: if mafia A spares a target one night — and worse, if
// A is then lynched that day — the remaining mafia see that target rendered as
// "Blocked" with no action buttons the following night and can't act on it.
//
// Root cause is purely client-side stale state: app.js keeps mafia vote state in
// module-level globals (mafiaObjectedTargets / myMafiaVotes / lastVoterTargets),
// reset only on game_started and game_sync — NOT between nights of a live
// session. showNightAction's mafia_vote branch re-renders the cards from those
// stale globals, so last night's objection persists. The engine state itself is
// correctly cleared every night (NIGHT_RESETS). The fix resets the globals at the
// start of each mafia night in showNightAction.
//
// Driven through the real DOM handlers via the happy-dom client harness — the
// same loop-testing architecture, at the layer where this bug actually lives.

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { loadClientApp, unloadClientApp } from "./helpers/client-harness";

// The server tsconfig has no "dom" lib; these exist at runtime once the harness
// has registered happy-dom globals.
declare const document: any;
declare const localStorage: any;

// timeScale compresses app.js's day/night overlay chains from seconds to ms so
// the realistic phase-transition variant doesn't sleep wall-clock seconds.
const { ws, serverSays } = loadClientApp({ timeScale: 0.02 });

afterAll(async () => {
  await unloadClientApp();
});

beforeEach(() => {
  localStorage.clear();
  ws.sent.length = 0;
});

const TARGETS = [
  { id: 3, username: "Bob" },
  { id: 4, username: "Carol" },
];

function startGameAsMafia(mafiaTeam: string[]) {
  serverSays({ type: "logged_in", userId: 1, username: "Mafioso" });
  serverSays({
    type: "game_started",
    role: "mafia",
    isLover: false,
    variant: 0,
    mafiaTeam,
  });
}

// Night 1: the mafia prompt arrives, then teammate Vito Spares Carol (id 4).
// "Mafioso" (us) casts no vote, so we are NOT the objector.
function night1VitoSparesCarol() {
  serverSays({ type: "mafia_targets", players: TARGETS });
  serverSays({
    type: "mafia_vote_update",
    voterTargets: { Vito: [{ target: "Carol", targetId: 4, voteType: "letsnot" }] },
    objectedTargets: { 4: ["Vito"] },
    aliveMafiaCount: 2,
    lockedTarget: null,
  });
}

function carolCard(): any {
  return document.querySelector('#action-targets li[data-id="4"]');
}

describe("mafia objection does not leak across nights", () => {
  test("night 1 render: Carol is Blocked and gives the non-objecting mafioso no buttons", () => {
    startGameAsMafia(["Mafioso", "Vito"]);
    night1VitoSparesCarol();

    // Sanity: the bug's precondition. Carol is objected, and because we are not
    // the objector, the only buttons a Blocked card would offer (Remove
    // Objection) are absent — i.e. a non-objecting mafioso can't act on her.
    const carol = carolCard();
    expect(carol).not.toBeNull();
    expect(carol.classList.contains("objected")).toBe(true);
    expect(carol.querySelector(".mtc-btn-suggest")).toBeNull();
    expect(carol.querySelector(".mtc-btn-object")).toBeNull();
  });

  test("next night (objector gone): the spared target is actionable again", () => {
    startGameAsMafia(["Mafioso", "Vito"]);
    night1VitoSparesCarol();

    // NIGHT 2 prompt — a continuous session (no game_started / game_sync between
    // nights), exactly as after Vito is lynched and a fresh night opens.
    serverSays({ type: "mafia_targets", players: TARGETS });

    const carol = carolCard();
    expect(carol).not.toBeNull();
    // Fresh night: no stale objection.
    expect(carol.classList.contains("objected")).toBe(false);
    expect(carol.querySelector(".mtc-blocked-label")).toBeNull();
    // The remaining mafia can act on her again: Nominate + Spare are present.
    expect(carol.querySelector(".mtc-btn-suggest")).not.toBeNull();
    expect(carol.querySelector(".mtc-btn-object")).not.toBeNull();
  });

  test("realistic flow: day→night transition between nights still resets the objection", async () => {
    startGameAsMafia(["Mafioso", "Vito"]);
    night1VitoSparesCarol();

    // Night resolves to day, the day plays out (Vito is voted out), then a new
    // night opens — the real sequence, with the overlay chains compressed.
    serverSays({ type: "phase_change", phase: "day", round: 1, events: [] });
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "mafia_targets", players: TARGETS });
    await Bun.sleep(250); // let the compressed transition/hold-replay settle

    const carol = carolCard();
    expect(carol).not.toBeNull();
    expect(carol.classList.contains("objected")).toBe(false);
    expect(carol.querySelector(".mtc-btn-suggest")).not.toBeNull();
  });
});
