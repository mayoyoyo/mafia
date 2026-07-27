// P4 — night flows, client side (Figma re-skin, .claude/plans/figma-ui-migration.md).
//
// Covers the three BIG night deltas the phase adopted, at the altitude where
// they actually live (the DOM), driving the real handlers through the happy-dom
// client harness:
//
//  (a) N-D2 pre-choice GATES for Hunter (130:573) and Vigilante (225:542):
//      the prompt opens on two CTAs — a primary that reveals the target list and
//      a decline that resolves the action outright. Both the gate→list→confirm
//      and gate→decline paths are pinned, on both roles, together with the fact
//      that the list is genuinely shuttered until the primary is tapped.
//      The DECLINE affordance stays reachable in ONE tap from the first screen
//      (the "kitchen problem" — a stalled hunter blocks the whole room), which
//      is the property the gate must not regress.
//  (b) N-D12 post-confirm TEARDOWN: after the role's own <role>_close cue the
//      confirmed selection is gone from the rendered page, not left sitting on
//      a face-up phone for the rest of the night. Figma's confirmed frames imply
//      persistence; R5 says the app wins.
//  (c) N-D4 detective inline history and N-D11 heartbreak headline.
//
// The privacy assertions here are one-directional: they check that information
// is ABSENT after teardown, never that more of it is shown.

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

function startGame(role: string, mafiaTeam: string[] = []) {
  serverSays({ type: "logged_in", userId: 1, username: "Tester" });
  serverSays({ type: "game_started", role, isLover: false, variant: 0, mafiaTeam });
}

/**
 * Text a human would actually read: skips any subtree the app has hidden with
 * the `.hidden` class (the app's only display toggle). Used for the teardown
 * assertions — "hidden" and "absent from the page" must agree.
 */
function visibleText(el: any): string {
  if (!el) return "";
  if (el.nodeType === 3) return el.textContent || "";
  if (el.nodeType !== 1) return "";
  if (el.classList && el.classList.contains("hidden")) return "";
  let out = "";
  for (const child of Array.from(el.childNodes) as any[]) out += visibleText(child);
  return out;
}

const rows = () => Array.from(document.querySelectorAll("#action-targets li")) as any[];

// ───────────────────────────────────────────────────────────────────────────
describe("P4 (a) — Hunter pre-choice gate (Figma 130:573 → 225:364)", () => {
  test("the prompt opens on the gate: two CTAs, target list shuttered", () => {
    startGame("hunter");
    serverSays({ type: "hunter_revenge_targets", players: TARGETS });

    expect(isHidden("night-actions")).toBe(false);
    // Primary CTA present with the Figma gate label.
    expect(isHidden("btn-night-gate-go")).toBe(false);
    expect($("btn-night-gate-go").textContent).toBe("Take revenge");
    // Decline present, one tap away, with the gate frame's label (N-D6).
    expect(isHidden("btn-decline-revenge")).toBe(false);
    expect($("btn-decline-revenge").textContent).toBe("Spare the others");
    // The list is genuinely not on screen yet.
    expect(isHidden("action-list-wrap")).toBe(true);
    expect($("night-choice").classList.contains("gate-mode")).toBe(true);
    expect(visibleText($("night-actions"))).not.toContain("Bob");
    // Nothing has gone to the server from merely opening the gate.
    expect(ws.sent).toEqual([]);
  });

  test("gate → list → confirm sends the revenge shot", () => {
    startGame("hunter");
    serverSays({ type: "hunter_revenge_targets", players: TARGETS });

    $("btn-night-gate-go").click();

    // List revealed; the primary CTA is spent; the decline takes the target-list
    // frame's label (225:364).
    expect(isHidden("action-list-wrap")).toBe(false);
    expect(isHidden("btn-night-gate-go")).toBe(true);
    expect($("night-choice").classList.contains("gate-mode")).toBe(false);
    expect($("btn-decline-revenge").textContent).toBe("Don't shoot");
    expect(visibleText($("night-actions"))).toContain("Bob");

    rows()[0].click();
    expect(isHidden("action-confirm")).toBe(false);
    expect($("btn-action-confirm").textContent).toBe("Avenge");
    $("btn-action-confirm").click();

    expect(ws.sent).toEqual([{ type: "hunter_revenge", targetId: 3 }]);
    // Both gate affordances are gone once the action resolves.
    expect(isHidden("btn-decline-revenge")).toBe(true);
    expect(isHidden("btn-night-gate-go")).toBe(true);
  });

  test("gate → decline resolves in ONE tap from the first screen", () => {
    startGame("hunter");
    serverSays({ type: "hunter_revenge_targets", players: TARGETS });

    $("btn-decline-revenge").click(); // no gate traversal required

    expect(ws.sent).toEqual([{ type: "hunter_revenge", targetId: null }]);
    expect(isHidden("btn-decline-revenge")).toBe(true);
    expect($("action-status").textContent).toBe("You lower your bow.");

    // Locked: a late tap on either affordance is a no-op on the wire.
    $("btn-night-gate-go").click();
    $("btn-decline-revenge").click();
    expect(ws.sent.length).toBe(1);
  });

  test("declining from the revealed list still works (post-gate decline)", () => {
    startGame("hunter");
    serverSays({ type: "hunter_revenge_targets", players: TARGETS });
    $("btn-night-gate-go").click();
    $("btn-decline-revenge").click();

    expect(ws.sent).toEqual([{ type: "hunter_revenge", targetId: null }]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 (b) — Vigilante pre-choice gate (Figma 225:542 → 234:1332 / 234:1397)", () => {
  test("the prompt opens on Shoot / Hold fire with the list shuttered", () => {
    startGame("vigilante");
    serverSays({ type: "vigilante_targets", players: TARGETS, bulletUsed: false });

    expect(isHidden("btn-night-gate-go")).toBe(false);
    expect($("btn-night-gate-go").textContent).toBe("Shoot");
    expect(isHidden("btn-vigilante-pass")).toBe(false);
    expect($("btn-vigilante-pass").textContent).toBe("Hold fire");
    expect(isHidden("action-list-wrap")).toBe(true);
    expect(visibleText($("night-actions"))).not.toContain("Carol");
    expect(ws.sent).toEqual([]);
  });

  test("gate → list → confirm fires the shot and spends the bullet", () => {
    startGame("vigilante");
    serverSays({ type: "vigilante_targets", players: TARGETS, bulletUsed: false });

    $("btn-night-gate-go").click();
    expect(isHidden("action-list-wrap")).toBe(false);
    // 234:1332 keeps the same decline string as the gate frame.
    expect($("btn-vigilante-pass").textContent).toBe("Hold fire");

    rows()[1].click();
    expect($("btn-action-confirm").textContent).toBe("Shoot");
    $("btn-action-confirm").click();

    expect(ws.sent).toEqual([{ type: "vigilante_shoot", targetId: 4 }]);
    expect(isHidden("btn-vigilante-pass")).toBe(true);
  });

  test("gate → hold fire resolves in ONE tap, with the unified N-D8 string", () => {
    startGame("vigilante");
    serverSays({ type: "vigilante_targets", players: TARGETS, bulletUsed: false });

    $("btn-vigilante-pass").click();

    expect(ws.sent).toEqual([{ type: "vigilante_shoot", targetId: null }]);
    // N-D8: the client no longer flashes a shorter variant before the server's
    // night_action_done lands — both sides say the same sentence.
    expect($("action-status").textContent).toBe("You hold your fire and keep your bullet.");
    serverSays({ type: "night_action_done", message: "You hold your fire and keep your bullet." });
    expect($("action-status").textContent).toBe("You hold your fire and keep your bullet.");
  });

  test("the gate never leaks into an ungated role's prompt", () => {
    startGame("doctor");
    serverSays({ type: "doctor_targets", players: TARGETS });

    expect(isHidden("btn-night-gate-go")).toBe(true);
    expect(isHidden("action-list-wrap")).toBe(false);
    expect($("night-choice").classList.contains("gate-mode")).toBe(false);
    expect(visibleText($("night-actions"))).toContain("Bob");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 (c) — post-confirm teardown on <role>_close (N-D12, R5)", () => {
  // Figma's confirmed-kill / save-confirmed / investigation-confirmed frames
  // leave the choice on screen. The app tears it down; these pin the teardown as
  // "not rendered", not merely "styled away".
  const cases: Array<{ role: string; targets: string; extra?: Record<string, unknown>; verb: string }> = [
    { role: "doctor", targets: "doctor_targets", verb: "Save" },
    { role: "detective", targets: "detective_targets", verb: "Investigate" },
    { role: "vigilante", targets: "vigilante_targets", extra: { bulletUsed: false }, verb: "Shoot" },
  ];

  for (const c of cases) {
    test(`${c.role}: the confirmed selection is gone from the page after ${c.role}_close`, () => {
      startGame(c.role);
      serverSays({ type: c.targets, players: TARGETS, ...(c.extra || {}) });

      // The gated roles must cross their gate first.
      if (!isHidden("btn-night-gate-go")) $("btn-night-gate-go").click();

      rows()[0].click(); // Bob
      expect($("btn-action-confirm").textContent).toBe(c.verb);
      $("btn-action-confirm").click();
      serverSays({ type: "night_action_done", message: "Locked in for tonight." });

      // Confirmed state is up and names the choice on the actor's OWN screen.
      expect(visibleText($("night-actions"))).toContain("Bob");

      serverSays({ type: "sound_cue", sound: `${c.role}_close` });

      // Torn down: panel hidden, confirm bar hidden, and — the property that
      // actually matters for shoulder-surfing — the target's name is nowhere in
      // the rendered game screen.
      expect(isHidden("night-actions")).toBe(true);
      expect(isHidden("action-confirm")).toBe(true);
      expect(visibleText($("night-actions"))).toBe("");
      expect(visibleText($("screen-game"))).not.toContain("Bob");
    });
  }

  test("mafia: the deliberation surface (chips, activity feed) goes with it", () => {
    startGame("mafia", ["Tester", "Vito"]);
    serverSays({ type: "mafia_targets", players: TARGETS });
    serverSays({
      type: "mafia_vote_update",
      voterTargets: { Vito: [{ target: "Bob", targetId: 3, voteType: "lock" }] },
      objectedTargets: {},
      aliveMafiaCount: 2,
      lockedTarget: null,
    });
    expect(visibleText($("screen-game"))).toContain("Vito");

    serverSays({ type: "sound_cue", sound: "mafia_close" });

    expect(isHidden("night-actions")).toBe(true);
    expect(isHidden("mafia-vote-status")).toBe(true);
    expect($("mafia-vote-details").innerHTML).toBe("");
    expect(visibleText($("screen-game"))).not.toContain("Vito");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 — detective inline investigation history (N-D4, Figma 130:625)", () => {
  test("past results annotate the night list and the row stays selectable", () => {
    startGame("detective");
    serverSays({ type: "detective_targets", players: TARGETS });
    rows()[0].click();
    $("btn-action-confirm").click();
    serverSays({ type: "detective_result", targetName: "Bob", isMafia: true });

    // Night 2 — the same list, now annotated from the client-side history.
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "detective_targets", players: TARGETS });

    const bob = rows()[0];
    expect(bob.textContent).toContain("investigated as MAFIA");
    expect(rows()[1].textContent).not.toContain("investigated as");
    // The engine imposes no re-investigation ban, so the row must stay live.
    expect(bob.classList.contains("disabled")).toBe(false);

    ws.sent.length = 0;
    bob.click();
    $("btn-action-confirm").click();
    expect(ws.sent).toEqual([{ type: "detective_investigate", targetId: 3 }]);
    // The annotation must not bleed into the collapsed confirmation row.
    expect($("action-targets").textContent).toContain("Bob ✔");
    expect($("action-targets").textContent).not.toContain("investigated as");
  });

  test("PRIVACY: a non-detective never renders an investigation annotation", () => {
    // Same wire history in client memory, a different role: no annotation.
    startGame("doctor");
    serverSays({ type: "detective_result", targetName: "Bob", isMafia: true });
    serverSays({ type: "doctor_targets", players: TARGETS });

    expect($("action-targets").textContent).not.toContain("investigated as");
    expect(visibleText($("screen-game"))).not.toContain("investigated as");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 — death overlay headline variant (N-D11, Figma 254:865)", () => {
  test("heartbreak swaps the headline pair; every other death stays generic", () => {
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "The night took Tester.", isLoverDeath: true });

    expect($("dead-pre").textContent).toBe("You died of");
    expect($("dead-text").textContent).toBe("HEARTBREAK");
    // The MESSAGE stays the server's cause-neutral pool line (R5).
    expect($("death-message").textContent).toBe("The night took Tester.");

    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "Tester did not see the morning." });

    expect($("dead-pre").textContent).toBe("You are");
    expect($("dead-text").textContent).toBe("DEAD");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 §5.11 PRIVACY — phantom vigilante renders identically (dead vs spent)", () => {
  // The server collapses "vigilante is dead" and "vigilante spent the bullet"
  // onto isRoleAlive:false (pinned byte-for-byte in
  // tests/playtest/night-gates.test.ts). Figma only ever drew the taking-aim
  // frame, so this pins the CLIENT half: the re-skin must not have invented a
  // "Vigilante has fallen" variant by analogy with the doctor/detective frames.
  function renderVigilanteSubPhase(isRoleAlive: boolean): string {
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "you_died", message: "The night took Tester." });
    $("dead-overlay").click(); // dismiss the poster to reach the spectator view
    serverSays({ type: "spectator_night_phase", subPhase: "vigilante", isRoleAlive });
    return visibleText($("night-actions"));
  }

  test("the rendered sub-phase text is byte-identical in both phantom states", () => {
    // Both phantom states arrive on the wire as isRoleAlive:false.
    const deadVig = renderVigilanteSubPhase(false);
    const spentBullet = renderVigilanteSubPhase(false);

    expect(deadVig).toBe(spentBullet);
    expect(deadVig).not.toMatch(/fallen|taking aim/i);
    expect(deadVig).toContain("The night stays quiet");
    expect(deadVig).toContain("No shot is fired tonight");

    // ...and it is a DIFFERENT string from the live-vigilante frame, so the
    // phantom is not just the aim copy with the name removed.
    expect(renderVigilanteSubPhase(true)).not.toBe(deadVig);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 — neutral night idle line (Figma 74:335)", () => {
  test("shown when no night panel is up, and identically after a sub-phase closes", () => {
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    expect(isHidden("night-idle")).toBe(false);

    // A role with an open prompt does NOT see it...
    startGame("doctor");
    serverSays({ type: "phase_change", phase: "night", round: 2 });
    serverSays({ type: "doctor_targets", players: TARGETS });
    expect(isHidden("night-idle")).toBe(true);

    // ...but once their sub-phase closes they land on the same neutral screen a
    // citizen has had all night — the line must not itself become a role tell.
    serverSays({ type: "sound_cue", sound: "doctor_close" });
    expect(isHidden("night-idle")).toBe(false);
  });

  test("never shown by day", () => {
    // game_started resets previousPhase, so this phase_change applies directly
    // instead of going through the dawn suspense chain.
    startGame("citizen");
    serverSays({ type: "phase_change", phase: "day", round: 1 });
    expect(isHidden("night-idle")).toBe(true);
  });
});
