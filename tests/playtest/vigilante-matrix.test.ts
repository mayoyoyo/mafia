// Playtest matrix: the Vigilante role.
//
// Vigilante = a TOWN one-shot night killer. Hidden. Each night the role is
// enabled a "Vigilante, open your eyes" sub-phase runs (LAST, after the
// detective). A living vigilante with an unused bullet may shoot one player
// (friendly fire allowed, but NOT self) or hold fire. The shot resolves at
// dawn and CAN be blocked by the Doctor (one save blocks one source), and a
// vigilante killed the SAME night still fires (the shot is committed during
// the live night phase). When the vigilante is dead OR out of ammo the
// sub-phase still runs as a PHANTOM (cues + auto-advance, no prompt) so its
// state can't be inferred.
//
// All rows use the 7-player pinned deal:
//   m0=0  m1=1  doc=2  det=3  vig=4  c0=5  c1=6
// settings: { mafiaCount: 2, enableDoctor, enableDetective, enableVigilante }.
//
// Run ONLY this file:  bun test tests/playtest/vigilante-matrix.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioStep, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

// ── Index map ────────────────────────────────────────────────────────────────
const M0 = 0, M1 = 1, DOC = 2, DET = 3, VIG = 4, C0 = 5, C1 = 6;

const BASE_ROLES: Role[] = ["mafia", "mafia", "doctor", "detective", "vigilante", "citizen", "citizen"];
const HUNTER_ROLES: Role[] = ["mafia", "mafia", "doctor", "detective", "vigilante", "citizen", "hunter"];
const BASE_SETTINGS = { mafiaCount: 2, enableDoctor: true, enableDetective: true, enableVigilante: true };
const HUNTER_SETTINGS = { ...BASE_SETTINGS, enableHunter: true };

const uid = (ctx: ScenarioContext, idx: number) => ctx.clients[idx].userId!;

// ── Shared timeline helpers (each waits for the right prompt before acting) ──

/** Drive a 2-mafia kill to consensus + confirm (both m0/m1 must lock the same). */
async function twoMafiaKill(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const first = ctx.clients[M0], second = ctx.clients[M1];
  const targetId = uid(ctx, targetIdx);
  let p = first.waitFor("mafia_vote_update", 8000);
  first.mafiaVote(targetId, "maybe");
  await p;
  p = first.waitFor("mafia_vote_update", 8000);
  first.mafiaVote(targetId, "lock");
  await p;

  p = second.waitFor("mafia_vote_update", 8000);
  second.mafiaVote(targetId, "maybe");
  await p;
  const ready = second.waitFor("mafia_confirm_ready", 8000);
  second.mafiaVote(targetId, "lock");
  await ready;

  const done = first.waitFor("night_action_done", 8000);
  first.confirmMafiaKill();
  await done;
}

/** Single living-mafia kill (used on later nights after a mafioso is gone). */
async function singleMafiaKill(ctx: ScenarioContext, mafiaIdx: number, targetIdx: number): Promise<void> {
  await ctx.clients[mafiaIdx].killAsMafia(uid(ctx, targetIdx));
}

async function doctorSaves(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const doc = ctx.clients[DOC];
  await doc.waitFor("doctor_targets", 8000);
  await doc.doctorSave(uid(ctx, targetIdx));
}

async function detectiveInv(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const det = ctx.clients[DET];
  await det.waitFor("detective_targets", 8000);
  const done = det.waitFor("night_action_done", 8000);
  det.send({ type: "detective_investigate", targetId: uid(ctx, targetIdx) });
  await done;
}

const dayWaiter = (ctx: ScenarioContext, timeout = 14000) =>
  ctx.clients[M0].waitMatch((m) => m.type === "phase_change" && m.phase === "day", timeout, "phase_change(day)");

/** Vigilante real shot (or pass when targetIdx===null), then await dawn → day. */
async function vigShootThenDay(ctx: ScenarioContext, targetIdx: number | null): Promise<void> {
  const vig = ctx.clients[VIG];
  await vig.waitFor("vigilante_targets", 8000);
  const dayP = dayWaiter(ctx);
  await vig.vigilanteShoot(targetIdx === null ? null : uid(ctx, targetIdx));
  await dayP;
}

/** Vigilante real shot, then await the game_over (used for the parity win row). */
async function vigShootThenGameOver(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const vig = ctx.clients[VIG];
  await vig.waitFor("vigilante_targets", 8000);
  const overP = ctx.clients[M0].waitFor("game_over", 14000);
  await vig.vigilanteShoot(uid(ctx, targetIdx));
  await overP;
}

/** Admin ends the day; resolves when the next night's mafia phase opens. */
async function endDayToNight(ctx: ScenarioContext, mafiaWatcherIdx: number): Promise<void> {
  const targetsP = ctx.clients[mafiaWatcherIdx].waitFor("mafia_targets", 10000);
  ctx.clients[M0].endDay();
  await targetsP;
}

/** Admin nominates targetIdx; every alive seat votes YES → execution → night opens. */
async function dayExecute(ctx: ScenarioContext, targetIdx: number, aliveIdxs: number[], mafiaWatcherIdx: number): Promise<void> {
  const admin = ctx.clients[M0];
  await admin.callVote(uid(ctx, targetIdx));
  const nightP = ctx.clients[mafiaWatcherIdx].waitFor("mafia_targets", 10000);
  for (const i of aliveIdxs) ctx.clients[i].castVote(true);
  await nightP;
}

// ── Per-scenario assertion phase (runs against the returned client logs) ─────
interface Scenario {
  name: string;
  roles?: Role[];
  settings?: Record<string, unknown>;
  lovers?: [number, number];
  timeline: ScenarioStep[];
  check: (clients: PlaytestClient[], result: { gameOver?: any; lastPhaseChange?: any }) => void;
}

const nameOf = (c: PlaytestClient) => (c.lastOf("registered")!.username as string);
const diedNames = (admin: PlaytestClient) => admin.allOf("player_died").map((m) => m.playerName as string);
const dawnEvents = (admin: PlaytestClient): Array<{ type: string; playerName: string }> => {
  const dawn = admin.lastOf("phase_change");
  return (dawn?.events as Array<{ type: string; playerName: string }>) ?? [];
};
// The narrator lines on the dawn phase_change (the public night-death stream).
const dawnMessages = (admin: PlaytestClient): string[] => (admin.lastOf("phase_change")?.messages as string[]) ?? [];
// Any of these in a dawn death line would re-out the killer's role.
const NIGHT_CAUSE_WORDS = /Vigilante|gunshot|bullet|shot/i;

const scenarios: Scenario[] = [
  {
    // (1) vigilante kills a mafioso; both deaths land; the bullet is spent.
    name: "1 — vigilante kills mafia (+ mafia kill); bullet spent; two deaths",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, C1); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, M1); },
    ],
    check: (clients) => {
      const admin = clients[M0];
      const died = diedNames(admin);
      expect(died).toContain(nameOf(clients[C0])); // mafia kill
      expect(died).toContain(nameOf(clients[M1])); // vigilante shot
      // WIRE CAUSE-NEUTRALITY (finding 1): a LIVING player's dawn events carry
      // the neutral "death" type for BOTH victims — never the mafia "kill" or
      // the "vigilante_shot" that would out the killer's role from a raw frame.
      const events = dawnEvents(admin);
      expect(events.some((e) => e.type === "death" && e.playerName === nameOf(clients[M1]))).toBe(true);
      expect(events.some((e) => e.type === "death" && e.playerName === nameOf(clients[C0]))).toBe(true);
      expect(events.every((e) => e.type !== "vigilante_shot" && e.type !== "kill")).toBe(true);
      // CAUSE-NEUTRAL DAWN: the two deaths are announced as ONE combined line
      // that names BOTH victims and leaks neither the mafia nor the vigilante.
      const lines1 = dawnMessages(admin).filter((m) => m.includes(nameOf(clients[C0])) || m.includes(nameOf(clients[M1])));
      expect(lines1.length).toBe(1);
      expect(lines1[0]).toContain(nameOf(clients[C0]));
      expect(lines1[0]).toContain(nameOf(clients[M1]));
      expect(lines1[0]).not.toMatch(NIGHT_CAUSE_WORDS);
      // The vigilante's own confirmation says the bullet was spent.
      expect(clients[VIG].lastOf("night_action_done")!.message).toMatch(/spent/i);
      // D3: the vigilante is never offered itself as a target in the live prompt.
      const vigPrompt = clients[VIG].lastOf("vigilante_targets");
      expect(vigPrompt).toBeDefined();
      expect((vigPrompt!.players as Array<{ id: number }>).every((t) => t.id !== clients[VIG].userId)).toBe(true);
    },
  },
  {
    // (2) friendly fire on a townsperson is allowed; game continues.
    name: "2 — vigilante friendly-fires a townsperson",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, VIG); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, C1); },
    ],
    check: (clients, result) => {
      const admin = clients[M0];
      expect(diedNames(admin)).toContain(nameOf(clients[C1]));
      const events = dawnEvents(admin);
      // Living player's dawn event is the neutral "death" (never vigilante_shot).
      expect(events.some((e) => e.type === "death" && e.playerName === nameOf(clients[C1]))).toBe(true);
      expect(events.every((e) => e.type !== "vigilante_shot")).toBe(true);
      // c1 (dead) sees the death in the kill roll — but NOT the source (finding 4):
      // the spectator_kill_confirmed frame no longer carries the killer's role.
      const conf = clients[C1].lastOf("spectator_kill_confirmed");
      expect(conf).toBeDefined();
      expect((conf!.kills as Array<{ name: string }>).some((k) => k.name === nameOf(clients[C1]))).toBe(true);
      expect((conf!.kills as Array<Record<string, unknown>>).every((k) => !("source" in k))).toBe(true);
      // The game is not over — town still has the numbers (and a doctor lives).
      expect(result.lastPhaseChange?.phase).toBe("day");
    },
  },
  {
    // (3) hold fire on N1 (bullet kept) → shoot on N2.
    name: "3 — hold fire N1, shoot N2",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, C1); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, null); }, // PASS
      // N2
      async (ctx) => { await endDayToNight(ctx, M0); },
      async (ctx) => { await twoMafiaKill(ctx, C1); },
      async (ctx) => { await doctorSaves(ctx, DET); },
      async (ctx) => { await detectiveInv(ctx, M1); },
      async (ctx) => { await vigShootThenDay(ctx, M0); },
    ],
    check: (clients) => {
      const vig = clients[VIG];
      const prompts = vig.allOf("vigilante_targets");
      expect(prompts.length).toBe(2); // a fresh prompt each night the bullet is unused
      expect(prompts.every((p) => p.bulletUsed === false)).toBe(true);
      // N1 confirmation: held fire. N2 confirmation: spent.
      const dones = vig.allOf("night_action_done");
      expect(dones[0].message).toMatch(/hold|keep/i);
      expect(dones[dones.length - 1].message).toMatch(/spent/i);
      expect(diedNames(clients[M0])).toContain(nameOf(clients[M0])); // m0 shot on N2
    },
  },
  {
    // (4) once the bullet is spent the sub-phase is a PHANTOM the next night.
    name: "4 — phantom after spending (cues, no prompt, stray shoot rejected)",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, C1); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, M0); }, // spend on m0 (admin survives as admin)
      // N2 — phantom vigilante
      async (ctx) => { await endDayToNight(ctx, M1); },
      async (ctx) => { await singleMafiaKill(ctx, M1, C1); },
      async (ctx) => { await doctorSaves(ctx, DET); },
      async (ctx) => {
        const vig = ctx.clients[VIG], admin = ctx.clients[M0];
        const dayP = dayWaiter(ctx, 22000);
        await detectiveInv(ctx, M1); // completing this opens the phantom vigilante phase
        // A stray shoot during the phantom must be ignored (bullet already spent).
        vig.send({ type: "vigilante_shoot", targetId: uid(ctx, C1) });
        await dayP;
        void admin;
      },
    ],
    check: (clients) => {
      const vig = clients[VIG], admin = clients[M0];
      // Only ONE real prompt ever (N1); N2 sent NO vigilante_targets.
      expect(vig.allOf("vigilante_targets").length).toBe(1);
      // The stray N2 shoot produced no extra confirmation — still just the N1 shot.
      expect(vig.allOf("night_action_done").length).toBe(1);
      // The phantom still narrates: the open cue fired on BOTH nights.
      const opens = admin.allOf("sound_cue").filter((m) => m.sound === "vigilante_open").length;
      expect(opens).toBeGreaterThanOrEqual(2);
    },
  },
  {
    // (5) a vigilante killed on N1 still leaves a PHANTOM phase on N2.
    name: "5 — vigilante killed N1 → N2 phantom still runs",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, VIG); }, // mafia kill the vigilante
      async (ctx) => { await doctorSaves(ctx, C0); },   // doctor does NOT save the vig
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, null); }, // vig alive this night, holds fire
      // N2 — vig is dead; phantom vigilante
      async (ctx) => { await endDayToNight(ctx, M0); },
      async (ctx) => { await twoMafiaKill(ctx, C1); },
      async (ctx) => { await doctorSaves(ctx, DET); },
      async (ctx) => {
        const dayP = dayWaiter(ctx, 22000);
        await detectiveInv(ctx, M1);
        await dayP;
      },
    ],
    check: (clients) => {
      const vig = clients[VIG];
      expect(vig.lastOf("you_died")).toBeDefined(); // vig died on N1
      // Exactly one real prompt (N1, while alive); none on N2.
      expect(vig.allOf("vigilante_targets").length).toBe(1);
      // As a dead spectator on N2 the vig saw the phantom vigilante sub-phase (role not alive).
      const spec = vig.allOf("spectator_night_phase");
      expect(spec.some((m) => m.subPhase === "vigilante" && m.isRoleAlive === false)).toBe(true);
    },
  },
  {
    // (6) simultaneity: vig shoots a mafioso the very night the mafia kills the vig.
    name: "6 — simultaneous: vig shoots mafia + mafia shoots vig → BOTH die",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, VIG); }, // mafia target the vig
      async (ctx) => { await doctorSaves(ctx, C0); },
      async (ctx) => { await detectiveInv(ctx, C1); },
      async (ctx) => { await vigShootThenDay(ctx, M1); }, // vig still fires though dying tonight
    ],
    check: (clients) => {
      const admin = clients[M0];
      const died = diedNames(admin);
      expect(died).toContain(nameOf(clients[VIG])); // mafia kill
      expect(died).toContain(nameOf(clients[M1]));  // vigilante shot
      // Two deaths reported in the dead-spectator confirmation.
      const conf = clients[VIG].lastOf("spectator_kill_confirmed");
      expect(conf).toBeDefined();
      expect((conf!.kills as unknown[]).length).toBe(2);
      // CAUSE-NEUTRAL DAWN: ONE combined line names BOTH victims, no cause tell.
      const lines6 = dawnMessages(admin).filter((m) => m.includes(nameOf(clients[VIG])) || m.includes(nameOf(clients[M1])));
      expect(lines6.length).toBe(1);
      expect(lines6[0]).toContain(nameOf(clients[VIG]));
      expect(lines6[0]).toContain(nameOf(clients[M1]));
      expect(lines6[0]).not.toMatch(NIGHT_CAUSE_WORDS);
    },
  },
  {
    // (7) the Doctor can fully block the lone vigilante shot; the bullet still spends.
    name: "7 — doctor saves the vigilante's target (target lives, bullet spent)",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, C1); }, // protect the vig's victim
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, C1); }, // shoot the protected c1
    ],
    check: (clients) => {
      const admin = clients[M0];
      const died = diedNames(admin);
      expect(died).toContain(nameOf(clients[C0])); // mafia kill landed
      expect(died).not.toContain(nameOf(clients[C1])); // vig shot was blocked
      expect(clients[C1].lastOf("you_died")).toBeUndefined();
      // Exactly one death tonight.
      expect(died.length).toBe(1);
      // Bullet still spent despite the block.
      expect(clients[VIG].lastOf("night_action_done")!.message).toMatch(/spent/i);
    },
  },
  {
    // (8) two distinct night deaths (mafia + vigilante) are both reported.
    name: "8 — two distinct deaths same night both reported",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, DET); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, C1); },
    ],
    check: (clients) => {
      const admin = clients[M0];
      const died = diedNames(admin);
      expect(died).toContain(nameOf(clients[C0]));
      expect(died).toContain(nameOf(clients[C1]));
      // Both night deaths reach a living player as the SAME neutral "death" type
      // (the mafia kill is indistinguishable from the vigilante shot on the wire).
      const events = dawnEvents(admin);
      expect(events.some((e) => e.type === "death" && e.playerName === nameOf(clients[C0]))).toBe(true);
      expect(events.some((e) => e.type === "death" && e.playerName === nameOf(clients[C1]))).toBe(true);
      expect(events.every((e) => e.type !== "kill" && e.type !== "vigilante_shot")).toBe(true);
    },
  },
  {
    // (9) the vigilante counts as TOWN: its shot removing the last mafioso wins for town.
    name: "9 — vigilante counts as town for parity → town win",
    timeline: [
      // N1: mafia kill c0; vig holds fire; detective/doctor act.
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, C1); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, null); },
      // Day1: town executes m1 → 1 mafia remains.
      async (ctx) => { await dayExecute(ctx, M1, [M0, M1, DOC, DET, VIG, C1], M0); },
      // N2: m0 (last mafia) kills c1; vig shoots m0 → no mafia left → town win.
      async (ctx) => { await singleMafiaKill(ctx, M0, C1); },
      async (ctx) => { await doctorSaves(ctx, DET); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenGameOver(ctx, M0); },
    ],
    check: (_clients, result) => {
      expect(result.gameOver).toBeDefined();
      expect(result.gameOver!.winner).toBe("town");
    },
  },
  {
    // (10) shooting a Hunter opens the revenge gate; the vigilante gets no 2nd shot.
    name: "10 — vigilante shoots the Hunter → revenge gate opens",
    roles: HUNTER_ROLES,
    settings: HUNTER_SETTINGS,
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },
      async (ctx) => { await doctorSaves(ctx, VIG); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => {
        const vig = ctx.clients[VIG], admin = ctx.clients[M0];
        await vig.waitFor("vigilante_targets", 8000);
        const pendingP = admin.waitFor("hunter_revenge_pending", 14000);
        await vig.vigilanteShoot(uid(ctx, C1)); // C1 seat is the hunter in this deal
        await pendingP;
        // Hunter declines to close the gate cleanly.
        const dayP = dayWaiter(ctx, 14000);
        ctx.clients[C1].hunterRevenge(null);
        await dayP;
      },
    ],
    check: (clients) => {
      const admin = clients[M0];
      expect(admin.lastOf("hunter_revenge_pending")).toBeDefined();
      // The Hunter's DEATH (a vigilante shot) is neutral on the wire — the PUBLIC
      // reveal is the separate hunter_revenge_pending broadcast, not the cause.
      const events = dawnEvents(admin);
      expect(events.some((e) => e.type === "death" && e.playerName === nameOf(clients[C1]))).toBe(true);
      expect(events.every((e) => e.type !== "vigilante_shot")).toBe(true);
      // Only one shot opportunity; bullet spent.
      expect(clients[VIG].allOf("vigilante_targets").length).toBe(1);
      expect(clients[VIG].lastOf("night_action_done")!.message).toMatch(/spent/i);
    },
  },
  {
    // (11) D6: an armed, living vigilante is counted as plain TOWN and does NOT
    // suppress a mafia parity win (mirror of row 9's town-win side). Only the
    // vigilante is enabled (doctor/detective dealt-but-inert → no phantom delays);
    // the dealt doctor is killed N1 so it can't suppress parity.
    name: "11 — armed vigilante alive does NOT deny the mafia parity win (D6)",
    settings: { mafiaCount: 2, enableVigilante: true },
    timeline: [
      // N1: mafia kill the (inert) doctor so no living doctor suppresses parity; vig holds.
      async (ctx) => { await twoMafiaKill(ctx, DOC); },
      async (ctx) => { await vigShootThenDay(ctx, null); },
      // Day1: town executes c0 → 2 mafia vs {det, vig, c1}. All 6 alive seats
      // vote (doc is dead; the target c0 is included, matching row 9).
      async (ctx) => { await dayExecute(ctx, C0, [M0, M1, DET, VIG, C0, C1], M0); },
      // N2: mafia kill c1; vig HOLDS FIRE (stays armed + alive) → 2 maf vs 2 town
      // (det, vig), no doctor → mafia parity win at this dawn.
      async (ctx) => { await twoMafiaKill(ctx, C1); },
      async (ctx) => {
        const vig = ctx.clients[VIG];
        await vig.waitFor("vigilante_targets", 8000);
        const overP = ctx.clients[M0].waitFor("game_over", 14000);
        await vig.vigilanteShoot(null); // hold fire — armed bullet must not block the win
        await overP;
      },
    ],
    check: (clients, result) => {
      expect(result.gameOver).toBeDefined();
      expect(result.gameOver!.winner).toBe("mafia");
      // The vigilante reached the win ALIVE and never fired (held both nights).
      expect(clients[VIG].lastOf("you_died")).toBeUndefined();
      expect(clients[VIG].allOf("night_action_done").every((m) => /hold|keep/i.test(m.message as string))).toBe(true);
    },
  },
  {
    // (12) LOVERS night cascade: the mafia kills one lover; the partner dies of
    // heartbreak the same night. The dawn must announce BOTH in ONE neutral
    // line — no "heartbreak", no who-was-targeted order tell, and no separate
    // night heartbreak beat (loverDeathName dropped from the dawn phase_change).
    name: "12 — mafia kills a lover → ONE neutral dawn line names both, no heartbreak/target tell",
    settings: { ...BASE_SETTINGS, enableLovers: true },
    lovers: [C0, C1],
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); }, // kill one lover
      async (ctx) => { await doctorSaves(ctx, DET); },  // save misses both lovers
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, null); }, // vig holds fire
    ],
    check: (clients) => {
      const admin = clients[M0];
      const died = diedNames(admin);
      expect(died).toContain(nameOf(clients[C0])); // targeted lover
      expect(died).toContain(nameOf(clients[C1])); // heartbreak cascade
      const lines = dawnMessages(admin).filter((m) => m.includes(nameOf(clients[C0])) || m.includes(nameOf(clients[C1])));
      expect(lines.length).toBe(1);                 // ONE combined line
      expect(lines[0]).toContain(nameOf(clients[C0]));
      expect(lines[0]).toContain(nameOf(clients[C1]));
      expect(lines[0].toLowerCase()).not.toContain("heartbreak");
      expect(lines[0]).not.toMatch(NIGHT_CAUSE_WORDS);
      // No separate night heartbreak beat: the dawn carries no loverDeathName.
      expect(admin.lastOf("phase_change")!.loverDeathName).toBeUndefined();
    },
  },
  {
    // (13) WIRE-LEVEL payload neutrality + canonical death-batch ordering. A
    // living player's raw phase_change on a mafia+vigilante double-kill night
    // must (a) carry only the neutral "death" type — no vigilante_shot/kill/
    // joker_haunt/lover_death and no source/cause on any death event, anywhere
    // in its inbox — and (b) emit player_died in ALPHABETICAL order, not the
    // mafia-then-vigilante RESOLUTION order that would out which role killed
    // whom. Here the mafia victim (C0, seat idx 5) resolves first and the
    // vigilante victim (M1, seat idx 1) second, but the alphabetical seat names
    // flip them — so the sort is observable.
    name: "13 — wire neutrality: neutral 'death' only, no source/cause, alphabetical player_died",
    timeline: [
      async (ctx) => { await twoMafiaKill(ctx, C0); },   // mafia victim = seat idx 5
      async (ctx) => { await doctorSaves(ctx, DET); },
      async (ctx) => { await detectiveInv(ctx, M0); },
      async (ctx) => { await vigShootThenDay(ctx, M1); }, // vigilante victim = seat idx 1
    ],
    check: (clients) => {
      const admin = clients[M0]; // a LIVING player throughout
      const CAUSE_TYPES = ["vigilante_shot", "kill", "joker_haunt", "lover_death"];

      // (a) The dawn phase_change: exactly two neutral deaths, no cause fields.
      const events = dawnEvents(admin);
      const deaths = events.filter((e) => CAUSE_TYPES.includes(e.type) || e.type === "death");
      expect(deaths.length).toBe(2);
      for (const e of deaths) {
        expect(e.type).toBe("death");
        expect(("source" in (e as object))).toBe(false);
        expect(("cause" in (e as object))).toBe(false);
      }

      // Broader sweep: NO message anywhere in the living player's inbox carries a
      // cause-bearing night-death event type, nor a source/cause on a death row.
      const scan = (node: unknown): boolean => {
        if (Array.isArray(node)) return node.some(scan);
        if (node && typeof node === "object") {
          const o = node as Record<string, unknown>;
          if (typeof o.type === "string" && CAUSE_TYPES.includes(o.type)) return true;
          if (o.type === "death" && ("source" in o || "cause" in o)) return true;
          return Object.values(o).some(scan);
        }
        return false;
      };
      expect(admin.log.some(scan)).toBe(false);

      // (b) player_died arrives ALPHABETICAL — flipped from resolution order.
      const died = diedNames(admin);
      expect(died.length).toBe(2);
      expect(died).toEqual([...died].sort((a, b) => a.localeCompare(b)));
      expect(died[0]).toBe(nameOf(clients[M1])); // vigilante victim (idx 1) first
      expect(died[1]).toBe(nameOf(clients[C0])); // mafia victim (idx 5) second
    },
  },
];

describe("vigilante — 7-player edge-case matrix", () => {
  for (const s of scenarios) {
    test(s.name, async () => {
      const result = await runScenario({
        roles: s.roles ?? BASE_ROLES,
        settings: s.settings ?? BASE_SETTINGS,
        ...(s.lovers ? { lovers: s.lovers } : {}),
        autoNarratorReady: true,
        timeline: s.timeline,
      });
      s.check(result.clients, result);
    }, 60000);
  }
});
