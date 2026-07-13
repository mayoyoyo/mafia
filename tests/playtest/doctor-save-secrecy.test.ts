// Playtest: owner ruling — the Doctor save is secret from LIVING players and
// the saved victim, but DEAD SPECTATORS are omniscient and DO see who was saved
// (in both modes). This restores the dead-spectator night log.
//
// So under BOTH modes, dead spectators receive the named save via two wire
// fields — `spectator_night_complete { phase:"doctor", targetName }` (real-time)
// and the dawn `spectator_kill_confirmed.doctorMessage` ("Doctor saved <name>").
// The secrecy that matters is enforced elsewhere and pinned below: LIVING
// players never receive the saved-name association (the dawn narration stays
// anonymous under official mode — Narrator.doctorSaveOfficial), and the saved
// victim is never privately told. This drives real WebSockets to pin all of it.
//
// Scenario (single mafia, single doctor, deterministic pinned deal):
//   Night 1 — mafia targets C0, doctor SAVES C0 → no death, no spectators yet.
//   Day 1   — the town lynches C1, creating a DEAD SPECTATOR.
//   Night 2 — mafia targets C2, doctor SAVES C2 → the dead C1 watches the
//             doctor sub-phase complete and the anonymous dawn save line.
//
// Run ONLY this file:  bun test tests/playtest/doctor-save-secrecy.test.ts
//   (…then `pkill -f src/server.ts` — heavy WS runs can exhaust sockets.)

import { describe, test, expect } from "bun:test";
import { runScenario, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

// 6 seats so neither the night-1 save nor the day-1 lynch trips a parity win.
const M = 0, DOC = 1, C0 = 2, C1 = 3, C2 = 4, C3 = 5;
const ROLES: Role[] = ["mafia", "doctor", "citizen", "citizen", "citizen", "citizen"];

const uid = (ctx: ScenarioContext, idx: number) => ctx.clients[idx].userId!;
const nameOf = (ctx: ScenarioContext, idx: number) =>
  ctx.clients[idx].lastOf("registered")!.username as string;

/** Night: mafia locks `killIdx`, then the doctor saves `saveIdx`; awaits dawn. */
async function nightKillThenSave(ctx: ScenarioContext, killIdx: number, saveIdx: number): Promise<void> {
  const mafia = ctx.clients[M], doctor = ctx.clients[DOC];
  const dayP = mafia.waitMatch(
    (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)"
  );
  await mafia.killAsMafia(uid(ctx, killIdx));   // mafia sub-phase → doctor opens
  await doctor.waitFor("doctor_targets", 8000);
  await doctor.doctorSave(uid(ctx, saveIdx));    // doctor is last actor → dawn
  await dayP;
}

/** Day: admin nominates `targetIdx`; `aliveIdxs` all vote YES → next night opens. */
async function dayLynch(ctx: ScenarioContext, targetIdx: number, aliveIdxs: number[]): Promise<void> {
  const admin = ctx.clients[M];
  await admin.callVote(uid(ctx, targetIdx));
  const nightP = admin.waitFor("mafia_targets", 12000); // mafia is the admin here
  for (const i of aliveIdxs) ctx.clients[i].castVote(true);
  await nightP;
}

/**
 * Run the shared scenario under a given doctorMode and return the dead
 * spectator's (C1) full log, a LIVING non-doctor player's (C3) full log, the
 * saved victim's (C2) full log, and the saved player's (C2) username.
 */
async function runSecrecyScenario(doctorMode: "official" | "house") {
  const { clients } = await runScenario({
    roles: ROLES,
    settings: { enableDoctor: true, doctorMode },
    autoNarratorReady: true, // opens night 1; mafia receives mafia_targets
    timeline: [
      // NIGHT 1 — mafia targets C0, doctor saves C0 (no death; no spectators yet).
      async (ctx) => { await nightKillThenSave(ctx, C0, C0); },
      // DAY 1 — lynch C1 → the first dead spectator. All 6 alive cast YES
      // (the nominee votes too — the day resolves once every alive seat votes).
      async (ctx) => { await dayLynch(ctx, C1, [M, DOC, C0, C1, C2, C3]); },
      // NIGHT 2 — mafia targets C2, doctor saves C2 (different from night-1 save).
      //           The dead C1 now watches the doctor sub-phase + anonymous dawn.
      async (ctx) => { await nightKillThenSave(ctx, C2, C2); },
      // Settle so any (wrongly-named) spectator payload has time to arrive.
      async ({ sleep }) => { await sleep(150); },
    ],
  });
  const ctx = { clients } as ScenarioContext;
  return {
    spectatorLog: clients[C1].log,
    livingLog: clients[C3].log,
    victimLog: clients[C2].log,
    savedName: nameOf(ctx, C2),
    clients,
  };
}

describe("official Doctor save — dead spectators DO see the save; living + victim do not", () => {
  test("dead spectator DOES learn who the Doctor saved (official)", async () => {
    const { spectatorLog, savedName } = await runSecrecyScenario("official");

    // Sanity: the dead spectator actually observed the night-2 doctor phase.
    const doctorCompletes = spectatorLog.filter(
      (m) => m.type === "spectator_night_complete" && m.phase === "doctor"
    );
    expect(doctorCompletes.length).toBeGreaterThan(0);

    // (a) The doctor-phase completion NAMES the protected player to the dead.
    expect(doctorCompletes.some((m) => m.targetName === savedName)).toBe(true);

    // (b) The dawn kill-confirmed doctorMessage NAMES the save to the dead.
    const killConfirmed = spectatorLog.filter((m) => m.type === "spectator_kill_confirmed");
    expect(killConfirmed.length).toBeGreaterThan(0);
    expect(killConfirmed.some((m) => String(m.doctorMessage ?? "").includes(savedName))).toBe(true);
    // …and it reads as a save (not over-removed).
    expect(killConfirmed.some((m) => /saved/i.test(String(m.doctorMessage ?? "")))).toBe(true);
  }, 60000);

  test("LIVING players never receive the saved-name association (official)", async () => {
    const { livingLog, savedName } = await runSecrecyScenario("official");

    // A living, non-doctor player never receives the dead-only spectator stream.
    expect(livingLog.some((m) => m.type === "spectator_night_complete")).toBe(false);
    expect(livingLog.some((m) => m.type === "spectator_kill_confirmed")).toBe(false);

    // No message a living player receives carries a doctorMessage (spectator-only)…
    expect(livingLog.some((m) => "doctorMessage" in m && m.doctorMessage != null)).toBe(false);

    // …and the dawn narration they DO see (phase_change.messages) never names the
    // save — it stays anonymous under official mode (Narrator.doctorSaveOfficial).
    const narrationText = livingLog
      .filter((m) => m.type === "phase_change")
      .flatMap((m) => (m.messages ?? []) as string[])
      .join(" ∣ ");
    expect(narrationText).not.toContain(savedName);
    // Sanity: dawn narration actually reached this living player (non-empty),
    // so the "never names the save" assertion above isn't vacuous.
    expect(narrationText.length).toBeGreaterThan(0);
  }, 60000);

  test("the saved victim is never told they were saved (official)", async () => {
    const { victimLog, savedName } = await runSecrecyScenario("official");

    // The victim is a living player → no dead-only spectator stream, no doctorMessage.
    expect(victimLog.some((m) => m.type === "spectator_night_complete")).toBe(false);
    expect(victimLog.some((m) => m.type === "spectator_kill_confirmed")).toBe(false);
    expect(victimLog.some((m) => "doctorMessage" in m && m.doctorMessage != null)).toBe(false);

    // No message tells the victim they were the target of a save/protection.
    const victimText = victimLog.map((m) => JSON.stringify(m)).join(" ∣ ");
    expect(/you (were|are|have been) (saved|protected|targeted)/i.test(victimText)).toBe(false);
    // Their own dawn narration is the anonymous public line, never naming them.
    const victimNarration = victimLog
      .filter((m) => m.type === "phase_change")
      .flatMap((m) => (m.messages ?? []) as string[])
      .join(" ∣ ");
    expect(victimNarration).not.toContain(savedName);
  }, 60000);
});

describe("house Doctor save — named for dead spectators (guard)", () => {
  test("dead spectator DOES learn who the Doctor saved (house)", async () => {
    const { spectatorLog, savedName } = await runSecrecyScenario("house");

    // House mode names the target in the real-time completion…
    const doctorCompletes = spectatorLog.filter(
      (m) => m.type === "spectator_night_complete" && m.phase === "doctor"
    );
    expect(doctorCompletes.length).toBeGreaterThan(0);
    expect(doctorCompletes.some((m) => m.targetName === savedName)).toBe(true);

    // …and in the dawn kill-confirmed doctorMessage.
    const killConfirmed = spectatorLog.filter((m) => m.type === "spectator_kill_confirmed");
    expect(killConfirmed.length).toBeGreaterThan(0);
    expect(killConfirmed.some((m) => String(m.doctorMessage ?? "").includes(savedName))).toBe(true);
  }, 60000);
});
