// Playtest: official-mode Doctor save must stay secret from DEAD SPECTATORS too.
//
// The old bug: even after the victim-facing `doctor_save_private` was removed,
// dead spectators still learned exactly who the Doctor protected via two wire
// fields — `spectator_night_complete { phase:"doctor", targetName }` (real-time)
// and the dawn `spectator_kill_confirmed.doctorMessage` ("Doctor saved <name>").
// Under official mode both must be anonymised; under house mode both keep the
// name. This drives real WebSockets to pin both halves.
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
 * spectator's (C1) full log plus the saved player's (C2) username.
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
  return { spectatorLog: clients[C1].log, savedName: nameOf(ctx, C2), clients };
}

describe("official Doctor save — no reveal to dead spectators", () => {
  test("dead spectator never learns who the Doctor saved (official)", async () => {
    const { spectatorLog, savedName } = await runSecrecyScenario("official");

    // Sanity: the dead spectator actually observed the night-2 doctor phase.
    const doctorCompletes = spectatorLog.filter(
      (m) => m.type === "spectator_night_complete" && m.phase === "doctor"
    );
    expect(doctorCompletes.length).toBeGreaterThan(0);

    // (a) Every doctor-phase completion withholds the target name.
    for (const m of doctorCompletes) {
      expect(m.targetName == null).toBe(true);
      expect(String(m.targetName ?? "")).not.toContain(savedName);
    }

    // (b) The dawn kill-confirmed message is anonymous — no saved name.
    const killConfirmed = spectatorLog.filter((m) => m.type === "spectator_kill_confirmed");
    expect(killConfirmed.length).toBeGreaterThan(0);
    for (const m of killConfirmed) {
      expect(String(m.doctorMessage ?? "")).not.toContain(savedName);
    }
    // …and it still communicates that SOMEONE was saved (not over-removed).
    expect(killConfirmed.some((m) => /saved/i.test(String(m.doctorMessage ?? "")))).toBe(true);
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
