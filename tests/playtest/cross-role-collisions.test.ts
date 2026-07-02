// Playtest: SIMULTANEITY edges where several night roles collide, over real WS.
//
//   a. mafia + vigilante target the SAME player, doctor saves that player → the
//      target STILL dies (one save blocks ONE source); ONE neutral death, no
//      double announcement.
//   b. mafia + vigilante target DIFFERENT players → both die; ONE combined dawn
//      line, alphabetical player_died, both neutral on the wire.
//   c. doctor saves the VIGILANTE's target (mafia targets someone else) → the
//      vigilante's target lives, the mafia's target dies.
//   d. Hunter killed AT NIGHT by the VIGILANTE → revenge gate opens (direct
//      cause), wake cues fire; the revenge death is a SEPARATE, public
//      hunter_revenge on the wire while the Hunter's own death stays neutral.
//   e. Godfather + vigilante same night: the detective reads the Godfather
//      INNOCENT while the vigilante kills the Godfather → the death resolves and
//      the investigation result is still delivered at dawn.
//
// Run ONLY this file:  bun test tests/playtest/cross-role-collisions.test.ts
//   (…then `pkill -f src/server.ts`.)

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const nameOf = (c: PlaytestClient) => c.lastOf("registered")!.username as string;
const diedNames = (admin: PlaytestClient) => admin.allOf("player_died").map((m) => m.playerName as string);
const dawnMsgs = (admin: PlaytestClient): string[] => (admin.lastOf("phase_change")?.messages as string[]) ?? [];
const dawnEvents = (admin: PlaytestClient): Array<{ type: string; playerName: string }> =>
  (admin.lastOf("phase_change")?.events as Array<{ type: string; playerName: string }>) ?? [];
const uid = (ctx: ScenarioContext, i: number) => ctx.clients[i].userId!;
const CAUSE_WORDS = /Vigilante|vigilante|gunshot|bullet|\bshot\b|knife|wire|mafia|heartbreak/i;

const dayWaiter = (admin: PlaytestClient, t = 14000) =>
  admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", t, "phase_change(day)");

async function doctorSaves(ctx: ScenarioContext, docIdx: number, tgtIdx: number): Promise<void> {
  const doc = ctx.clients[docIdx];
  await doc.waitFor("doctor_targets", 10000);
  await doc.doctorSave(uid(ctx, tgtIdx));
}
async function vigShoot(ctx: ScenarioContext, vigIdx: number, tgtIdx: number | null): Promise<void> {
  const vig = ctx.clients[vigIdx];
  await vig.waitFor("vigilante_targets", 10000);
  await vig.vigilanteShoot(tgtIdx === null ? null : uid(ctx, tgtIdx));
}

describe("cross-role collisions — night simultaneity edges", () => {
  // ── (a) same target, doctor save blocks only one source → target dies ───────
  test("a — mafia + vigilante same target, doctor saves it → target STILL dies (one neutral death)", async () => {
    // M=0 DOC=1 VIG=2 C0=3 C1=4
    const { clients } = await runScenario({
      roles: ["mafia", "doctor", "vigilante", "citizen", "citizen"] as Role[],
      settings: { enableDoctor: true, enableVigilante: true },
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 3)); // mafia → C0
          await doctorSaves(ctx, 1, 3);         // doctor → C0 (saves the mafia bullet)
          await vigShoot(ctx, 2, 3);            // vigilante → C0 (kills anyway)
          await dayP;
        },
      ],
    });
    const admin = clients[0];
    const victim = nameOf(clients[3]);
    const died = diedNames(admin);
    // Exactly one death — the shared target — despite the save.
    expect(died).toEqual([victim]);
    expect(clients[3].lastOf("you_died")).toBeDefined();
    // One neutral death line; no double announcement, no cause tell.
    const lines = dawnMsgs(admin).filter((m) => m.includes(victim));
    expect(lines.length).toBe(1);
    expect(lines[0]).not.toMatch(CAUSE_WORDS);
    const deaths = dawnEvents(admin).filter((e) => e.playerName === victim);
    expect(deaths.length).toBe(1);
    expect(deaths[0].type).toBe("death");
  }, 60000);

  // ── (b) different targets → both die, one combined line, alphabetical ───────
  test("b — mafia + vigilante different targets → both die; one line, alphabetical, neutral", async () => {
    const { clients } = await runScenario({
      roles: ["mafia", "doctor", "vigilante", "citizen", "citizen"] as Role[],
      settings: { enableDoctor: true, enableVigilante: true },
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 3)); // mafia → C0 (seat 3)
          await doctorSaves(ctx, 1, 2);         // doctor saves the vigilante (irrelevant)
          await vigShoot(ctx, 2, 4);            // vigilante → C1 (seat 4)
          await dayP;
        },
      ],
    });
    const admin = clients[0];
    const c0 = nameOf(clients[3]), c1 = nameOf(clients[4]);
    const died = diedNames(admin);
    expect(died).toContain(c0);
    expect(died).toContain(c1);
    // Alphabetical wire order.
    expect(died).toEqual([...died].sort((a, b) => a.localeCompare(b)));
    // ONE combined line names both, neutral.
    const lines = dawnMsgs(admin).filter((m) => m.includes(c0) || m.includes(c1));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(c0);
    expect(lines[0]).toContain(c1);
    expect(lines[0]).not.toMatch(CAUSE_WORDS);
    // Both neutral "death" on the wire (no kill / vigilante_shot leak).
    const events = dawnEvents(admin);
    expect(events.filter((e) => (e.playerName === c0 || e.playerName === c1)).every((e) => e.type === "death")).toBe(true);
    expect(events.every((e) => e.type !== "kill" && e.type !== "vigilante_shot")).toBe(true);
  }, 60000);

  // ── (c) doctor saves vigilante's target (mafia elsewhere) → vig target lives ─
  test("c — doctor saves the vigilante's target, mafia kills another → vig target lives", async () => {
    const { clients } = await runScenario({
      roles: ["mafia", "doctor", "vigilante", "citizen", "citizen"] as Role[],
      settings: { enableDoctor: true, enableVigilante: true },
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 3)); // mafia → C0 (dies)
          await doctorSaves(ctx, 1, 4);         // doctor → C1 (the vigilante's target)
          await vigShoot(ctx, 2, 4);            // vigilante → C1 (blocked)
          await dayP;
        },
      ],
    });
    const admin = clients[0];
    const died = diedNames(admin);
    expect(died).toEqual([nameOf(clients[3])]);           // only the mafia target
    expect(clients[4].lastOf("you_died")).toBeUndefined(); // vig target survived
    // Bullet is spent even though the shot was blocked (D1 ruling).
    expect(clients[2].lastOf("night_action_done")!.message).toMatch(/spent/i);
  }, 60000);

  // ── (d) hunter killed at night by the vigilante → revenge gate + wake cues ──
  test("d — vigilante kills the Hunter → revenge gate opens; wake cues; public hunter_revenge", async () => {
    // M=0 VIG=1 HUN=2 C0=3 C1=4 C2=5 (6 seats so the revenge chain doesn't win)
    const { clients } = await runScenario({
      roles: ["mafia", "vigilante", "hunter", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableVigilante: true, enableHunter: true },
      autoNarratorReady: true,
      timeline: [
        // N1 mafia → C0; vigilante → Hunter. The dawn defers behind the gate.
        async (ctx) => {
          const admin = ctx.clients[0], vig = ctx.clients[1], hunter = ctx.clients[2];
          await admin.killAsMafia(uid(ctx, 3));
          await vig.waitFor("vigilante_targets", 10000);
          const pendingP = admin.waitFor("hunter_revenge_pending", 14000);
          const targetsP = hunter.waitFor("hunter_revenge_targets", 14000);
          await vig.vigilanteShoot(uid(ctx, 2)); // shoot the Hunter
          await Promise.all([pendingP, targetsP]);
        },
        // Hunter takes revenge on C1; the deferred dawn then completes.
        async (ctx) => {
          const admin = ctx.clients[0], hunter = ctx.clients[2];
          const dayP = dayWaiter(admin);
          const c1DiedP = ctx.clients[4].waitFor("you_died", 14000);
          hunter.hunterRevenge(uid(ctx, 4));
          await Promise.all([dayP, c1DiedP]);
        },
      ],
    });
    const admin = clients[0];
    const hunterName = nameOf(clients[2]);
    const revengeVictim = nameOf(clients[4]);

    // The gate opened publicly and the Hunter got its prompt.
    expect(admin.lastOf("hunter_revenge_pending")).toBeDefined();
    expect(clients[2].lastOf("hunter_revenge_targets")).toBeDefined();

    // Wake cues: a night-killed Hunter gets an open cue then a close cue.
    const cues = admin.allOf("sound_cue").map((m) => m.sound as string);
    expect(cues).toContain("hunter_open");
    expect(cues).toContain("hunter_close");

    // The Hunter's OWN death (a vigilante shot) is neutral on the wire; the
    // revenge death keeps its PUBLIC hunter_revenge type (already-revealed).
    const events = dawnEvents(admin);
    expect(events.some((e) => e.type === "death" && e.playerName === hunterName)).toBe(true);
    expect(events.some((e) => e.type === "hunter_revenge" && e.playerName === revengeVictim)).toBe(true);
    // The revenge victim really died.
    expect(diedNames(admin)).toContain(revengeVictim);
  }, 60000);

  // ── (e) godfather read innocent while the vigilante kills them ──────────────
  test("e — detective reads the Godfather innocent; vigilante kills the Godfather same night; result still delivered", async () => {
    // GF/M=0 DET=1 VIG=2 C0=3 C1=4  (killing the sole mafioso ⇒ town win)
    const { clients } = await runScenario({
      roles: ["mafia", "detective", "vigilante", "citizen", "citizen"] as Role[],
      settings: { enableDetective: true, enableVigilante: true, enableGodfather: true },
      godfather: 0,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0], det = ctx.clients[1], vig = ctx.clients[2];
          await admin.killAsMafia(uid(ctx, 3)); // GF (mafia) kills C0
          // Detective investigates the Godfather.
          await det.waitFor("detective_targets", 10000);
          const detDone = det.waitFor("night_action_done", 10000);
          det.send({ type: "detective_investigate", targetId: uid(ctx, 0) });
          await detDone;
          // Vigilante shoots the Godfather; investigation result lands at dawn.
          await vig.waitFor("vigilante_targets", 10000);
          const overP = admin.waitFor("game_over", 14000);
          const resultP = det.waitFor("detective_result", 14000);
          await vig.vigilanteShoot(uid(ctx, 0));
          await Promise.all([overP, resultP]);
        },
      ],
    });
    const admin = clients[0], det = clients[1];
    const gfName = nameOf(clients[0]);

    // The Godfather read INNOCENT even though role === mafia.
    const result = det.lastOf("detective_result")!;
    expect(result.targetName).toBe(gfName);
    expect(result.isMafia).toBe(false);

    // The mafia player learned they are the Godfather; killing the sole mafioso
    // wins for town.
    expect(admin.lastOf("game_started")!.isGodfather).toBe(true);
    expect(admin.lastOf("game_started")!.godfatherName).toBe(gfName);
    expect(admin.lastOf("game_over")!.winner).toBe("town");
    expect(diedNames(admin)).toContain(gfName);
    expect(diedNames(admin)).toContain(nameOf(clients[3]));
  }, 60000);
});
