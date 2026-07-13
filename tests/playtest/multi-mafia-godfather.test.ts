// Playtest: MULTI-MAFIA consensus + Godfather over real WebSockets.
//
//   a. Two mafia + a flagged Godfather. Every mafia learns the Godfather; the
//      Godfather learns it is one. The maybe→lock→confirm handshake is driven
//      MANUALLY over the wire: the two mafia first lock DIFFERENT targets
//      (disagreement ⇒ no confirm-ready), then converge on one (consensus ⇒
//      confirm-ready ⇒ confirm ⇒ kill).
//   b. Spare then kill: both mafia "Spare" (letsnot) the SAME player on N1 and
//      the admin force-dawns (no kill). Next night that same player is killed
//      cleanly — the N1 objection did NOT leak into N2 (spare-reset regression,
//      at the WS level).
//
// Run ONLY this file:  bun test tests/playtest/multi-mafia-godfather.test.ts
//   (…then `pkill -f src/server.ts`.)

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

// M0=0 M1=1 C0=2 C1=3 C2=4 C3=5 ; Godfather pinned to seat 0.
const ROLES: Role[] = ["mafia", "mafia", "citizen", "citizen", "citizen", "citizen"];
const SETTINGS = { mafiaCount: 2, enableGodfather: true };

const nameOf = (c: PlaytestClient) => c.lastOf("registered")!.username as string;
const diedNames = (admin: PlaytestClient) => admin.allOf("player_died").map((m) => m.playerName as string);
const uid = (ctx: ScenarioContext, i: number) => ctx.clients[i].userId!;
const dayWaiter = (admin: PlaytestClient, t = 14000) =>
  admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", t, "phase_change(day)");

/** Drive both mafia to a consensus lock on targetIdx, then confirm the kill. */
async function twoMafiaKill(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const m0 = ctx.clients[0], m1 = ctx.clients[1];
  const t = uid(ctx, targetIdx);
  let p = m0.waitFor("mafia_vote_update", 9000); m0.mafiaVote(t, "maybe"); await p;
  p = m0.waitFor("mafia_vote_update", 9000); m0.mafiaVote(t, "lock"); await p;
  p = m1.waitFor("mafia_vote_update", 9000); m1.mafiaVote(t, "maybe"); await p;
  const ready = m1.waitFor("mafia_confirm_ready", 9000); m1.mafiaVote(t, "lock"); await ready;
  const done = m0.waitFor("night_action_done", 9000); m0.confirmMafiaKill(); await done;
}

describe("multi-mafia consensus + Godfather", () => {
  // ── (a) godfather knowledge + disagreement → convergence handshake ──────────
  test("a — mafia learn the Godfather; disagreement then convergence reaches consensus", async () => {
    const { clients } = await runScenario({
      roles: ROLES,
      settings: SETTINGS,
      godfather: 0,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const m0 = ctx.clients[0], m1 = ctx.clients[1];
          const C0 = uid(ctx, 2), C1 = uid(ctx, 3);

          // m0 locks C0.
          let p = m0.waitFor("mafia_vote_update", 9000); m0.mafiaVote(C0, "maybe"); await p;
          p = m0.waitFor("mafia_vote_update", 9000); m0.mafiaVote(C0, "lock"); await p;
          // m1 locks C1 — DISAGREEMENT (locks split ⇒ no confirm-ready anywhere).
          p = m1.waitFor("mafia_vote_update", 9000); m1.mafiaVote(C1, "maybe"); await p;
          p = m1.waitFor("mafia_vote_update", 9000); m1.mafiaVote(C1, "lock"); await p;
          expect(m0.allOf("mafia_confirm_ready").length).toBe(0);
          expect(m1.allOf("mafia_confirm_ready").length).toBe(0);

          // m1 CONVERGES onto C0: release its C1 lock (→ maybe), then lock C0.
          p = m1.waitFor("mafia_vote_update", 9000); m1.mafiaVote(C1, "lock"); await p; // toggle lock→maybe
          p = m1.waitFor("mafia_vote_update", 9000); m1.mafiaVote(C0, "maybe"); await p;
          const ready = m1.waitFor("mafia_confirm_ready", 9000); m1.mafiaVote(C0, "lock"); await ready;

          // Consensus reached ⇒ confirm the kill; dawn resolves to day.
          const dayP = dayWaiter(m0);
          const done = m0.waitFor("night_action_done", 9000);
          m0.confirmMafiaKill();
          await Promise.all([done, dayP]);
        },
      ],
    });

    const admin = clients[0];
    const gfName = nameOf(clients[0]);

    // Godfather knowledge on the wire.
    expect(clients[0].lastOf("game_started")!.isGodfather).toBe(true);
    expect(clients[1].lastOf("game_started")!.isGodfather).toBeUndefined();
    expect(clients[0].lastOf("game_started")!.godfatherName).toBe(gfName);
    expect(clients[1].lastOf("game_started")!.godfatherName).toBe(gfName); // teammate learns it too

    // Convergence killed C0 (the target both finally locked), not C1.
    const died = diedNames(admin);
    expect(died).toContain(nameOf(clients[2])); // C0
    expect(died).not.toContain(nameOf(clients[3])); // C1 was abandoned
    // Exactly one confirm-ready was ever issued (only after convergence).
    expect(admin.allOf("mafia_confirm_ready").length).toBe(1);
  }, 60000);

  // ── (b) spare (letsnot) night → kill next night; no state leak ──────────────
  test("b — both mafia Spare a player on N1 (force-dawn, no kill); same player killed on N2", async () => {
    const { clients } = await runScenario({
      roles: ROLES,
      settings: SETTINGS,
      godfather: 0,
      autoNarratorReady: true,
      timeline: [
        // N1 — both mafia "Spare" (letsnot) seat 2; admin force-dawns: no kill.
        async (ctx) => {
          const m0 = ctx.clients[0], m1 = ctx.clients[1];
          const C0 = uid(ctx, 2);
          let p = m0.waitFor("mafia_vote_update", 9000); m0.mafiaVote(C0, "letsnot"); await p;
          p = m1.waitFor("mafia_vote_update", 9000); m1.mafiaVote(C0, "letsnot"); await p;
          const dayP = dayWaiter(m0);
          m0.forceDawn();
          await dayP;
          // Nobody died on the spared night.
          expect(diedNames(m0).length).toBe(0);
          expect(ctx.clients[2].lastOf("you_died")).toBeUndefined();
        },
        // N2 — the objection must NOT have leaked: seat 2 is nominatable + killable.
        async (ctx) => {
          const m0 = ctx.clients[0];
          const targetsP = m0.waitFor("mafia_targets", 10000);
          m0.endDay();
          await targetsP;
          const dayP = dayWaiter(m0);
          await twoMafiaKill(ctx, 2); // kill the previously-spared seat 2
          await dayP;
        },
      ],
    });

    const admin = clients[0];
    // The spare did not leak: the previously-spared player was killed on N2.
    expect(diedNames(admin)).toContain(nameOf(clients[2]));
    expect(clients[2].lastOf("you_died")).toBeDefined();
  }, 60000);
});
