// P4 — night gates + vigilante phantom parity, over real WebSockets.
//
// The Figma re-skin (.claude/plans/figma-ui-migration.md, P4) adopts a
// pre-choice GATE for the Hunter (130:573) and the Vigilante (225:542). The
// gate itself is a client surface (pinned in tests/client-night-flows.test.ts);
// what this file pins is the WIRE contract the gate must not break:
//
//   1. HUNTER — the revenge gate BLOCKS THE WHOLE ROOM. No client may reach
//      day while it is open; both resolutions (the hunter's own decline and the
//      admin's Skip revenge safety net) must close it. Adding a tap in front of
//      the hunter's choice is exactly the change that could strand a room, so
//      the block-and-release property is asserted from every seat's log.
//   2. VIGILANTE — both wire shapes the gate can produce, { targetId: n }
//      (Shoot) and { targetId: null } (Hold fire), are accepted and settle the
//      sub-phase with the right server message + bullet state.
//   3. §5.11 PHANTOM PARITY (PRIVACY) — Figma draws only "Vigilante is taking
//      aim…", so a naive re-skin could invent a "Vigilante has fallen" frame by
//      analogy with the doctor/detective ones and out both whether the
//      vigilante lives AND whether the bullet is spent. The server already
//      collapses those two states onto one payload; this asserts the dead
//      spectator's vigilante-related stream is BYTE-IDENTICAL between a
//      dead-vigilante game and a spent-bullet game.
//
// 7-player pinned deal: m0=0 m1=1 doc=2 det=3 vig=4 c0=5 c1=6 (hunter swaps in
// at index 6 for the hunter rows).
//
// Run ONLY this file:  bun test tests/playtest/night-gates.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario, type ScenarioContext, type WSMessage } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const M0 = 0, M1 = 1, DOC = 2, DET = 3, VIG = 4, C0 = 5, LAST = 6;

const VIG_ROLES: Role[] = ["mafia", "mafia", "doctor", "detective", "vigilante", "citizen", "citizen"];
const HUNTER_ROLES: Role[] = ["mafia", "mafia", "doctor", "detective", "vigilante", "citizen", "hunter"];
const BASE_SETTINGS = { mafiaCount: 2, enableDoctor: true, enableDetective: true, enableVigilante: true };
const HUNTER_SETTINGS = { ...BASE_SETTINGS, enableHunter: true };

const uid = (ctx: ScenarioContext, idx: number) => ctx.clients[idx].userId!;

// ── Shared night drivers ────────────────────────────────────────────────────
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

const dayWaiter = (ctx: ScenarioContext, watcher = M0, timeout = 16000) =>
  ctx.clients[watcher].waitMatch((m) => m.type === "phase_change" && m.phase === "day", timeout, "phase_change(day)");

// ───────────────────────────────────────────────────────────────────────────
describe("P4 — Hunter revenge gate blocks the room until it is resolved", () => {
  test("decline path: every seat waits, then every seat is released", async () => {
    const res = await runScenario({
      roles: HUNTER_ROLES,
      settings: HUNTER_SETTINGS,
      autoNarratorReady: true,
      timeline: [
        // N1 — the mafia kill the Hunter, which opens the room-wide gate.
        async (ctx) => {
          const pendingAll = ctx.clients.map((c) => c.waitFor("hunter_revenge_pending", 16000));
          await twoMafiaKill(ctx, LAST);
          await doctorSaves(ctx, C0);
          await detectiveInv(ctx, M1);
          const vig = ctx.clients[VIG];
          await vig.waitFor("vigilante_targets", 8000);
          await vig.vigilanteShoot(null); // hold fire — keeps this row about the hunter
          await Promise.all(pendingAll);
        },
        // While the gate is open NO seat may have advanced to day.
        async (ctx) => {
          await ctx.sleep(400); // give any errant transition time to land
          for (const c of ctx.clients) {
            const gateOpenedAt = c.log.findIndex((m) => m.type === "hunter_revenge_pending");
            expect(gateOpenedAt).toBeGreaterThanOrEqual(0);
            const after = c.log.slice(gateOpenedAt);
            expect(after.some((m) => m.type === "phase_change" && m.phase === "day")).toBe(false);
          }
          // The hunter — and only the hunter — holds the prompt.
          expect(ctx.clients[LAST].lastOf("hunter_revenge_targets")).toBeDefined();
          for (const i of [M0, M1, DOC, DET, VIG, C0]) {
            expect(ctx.clients[i].lastOf("hunter_revenge_targets")).toBeUndefined();
          }
        },
        // Resolving it releases the room. targetId:null is the decline shape the
        // gate's "Spare the others" / "Don't shoot" CTA sends.
        async (ctx) => {
          const dayAll = ctx.clients.map((c) =>
            c.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 16000, "day"),
          );
          ctx.clients[LAST].hunterRevenge(null);
          await Promise.all(dayAll);
        },
      ],
    });
    // Nobody died to the revenge shot.
    const day = res.clients[M0].lastOf("phase_change")!;
    expect(day.phase).toBe("day");
  }, 60000);

  test("admin Skip revenge resolves a stalled gate for the whole room", async () => {
    await runScenario({
      roles: HUNTER_ROLES,
      settings: HUNTER_SETTINGS,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const pendingAll = ctx.clients.map((c) => c.waitFor("hunter_revenge_pending", 16000));
          await twoMafiaKill(ctx, LAST);
          await doctorSaves(ctx, C0);
          await detectiveInv(ctx, M1);
          const vig = ctx.clients[VIG];
          await vig.waitFor("vigilante_targets", 8000);
          await vig.vigilanteShoot(null);
          await Promise.all(pendingAll);
        },
        async (ctx) => {
          await ctx.sleep(300);
          // Room still blocked: the hunter never answers.
          for (const c of ctx.clients) {
            const at = c.log.findIndex((m) => m.type === "hunter_revenge_pending");
            expect(c.log.slice(at).some((m) => m.type === "phase_change" && m.phase === "day")).toBe(false);
          }
        },
        async (ctx) => {
          // A NON-admin's skip must not resolve anything.
          const before = ctx.clients[M0].log.length;
          ctx.clients[C0].send({ type: "force_skip_revenge" });
          await ctx.sleep(300);
          expect(
            ctx.clients[M0].log.slice(before).some((m) => m.type === "phase_change" && m.phase === "day"),
          ).toBe(false);
        },
        async (ctx) => {
          // clients[0] is the room admin (it created the game).
          const dayAll = ctx.clients.map((c) =>
            c.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 16000, "day"),
          );
          ctx.clients[M0].send({ type: "force_skip_revenge" });
          await Promise.all(dayAll);
        },
      ],
    });
  }, 60000);
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 — Vigilante gate: both wire shapes settle the sub-phase", () => {
  test("Shoot → { targetId } spends the bullet and lands the kill", async () => {
    const res = await runScenario({
      roles: VIG_ROLES,
      settings: BASE_SETTINGS,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await twoMafiaKill(ctx, C0);
          await doctorSaves(ctx, C0); // save the mafia's target so only the shot kills
          await detectiveInv(ctx, M1);
          const vig = ctx.clients[VIG];
          await vig.waitFor("vigilante_targets", 8000);
          const dayP = dayWaiter(ctx);
          const done = await vig.vigilanteShoot(uid(ctx, M1));
          expect(done.message).toBe("You have taken your shot. Your bullet is spent.");
          await dayP;
        },
      ],
    });
    // The shot victim is dead; the saved player is not.
    const died = res.clients[M1].lastOf("you_died");
    expect(died).toBeDefined();
    expect(res.clients[C0].lastOf("you_died")).toBeUndefined();
  }, 60000);

  test("Hold fire → { targetId: null } keeps the bullet and re-prompts next night", async () => {
    const res = await runScenario({
      roles: VIG_ROLES,
      settings: BASE_SETTINGS,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await twoMafiaKill(ctx, C0);
          await doctorSaves(ctx, C0);
          await detectiveInv(ctx, M1);
          const vig = ctx.clients[VIG];
          await vig.waitFor("vigilante_targets", 8000);
          const dayP = dayWaiter(ctx);
          const done = await vig.vigilanteShoot(null);
          expect(done.message).toBe("You hold your fire and keep your bullet.");
          await dayP;
        },
        // Next night the prompt returns with an unspent bullet.
        async (ctx) => {
          const p = ctx.clients[VIG].waitFor("vigilante_targets", 16000);
          ctx.clients[M0].endDay();
          await twoMafiaKill(ctx, C0);
          await doctorSaves(ctx, DET);
          await detectiveInv(ctx, M1);
          const prompt = await p;
          expect(prompt.bulletUsed).toBe(false);
        },
      ],
    });
    expect(res.clients[VIG].allOf("vigilante_targets").length).toBe(2);
  }, 60000);
});

// ───────────────────────────────────────────────────────────────────────────
describe("P4 §5.11 PRIVACY — phantom vigilante parity for dead spectators", () => {
  /**
   * Everything a dead spectator learns about the vigilante sub-phase, in
   * arrival order, from the point the given round's night opens. If the two
   * scenarios differ anywhere in here, the re-skin has a state tell.
   */
  function vigilanteStream(log: WSMessage[]): string {
    return JSON.stringify(
      log
        .filter(
          (m) =>
            (m.type === "spectator_night_phase" && m.subPhase === "vigilante") ||
            (m.type === "spectator_night_complete" && m.phase === "vigilante") ||
            (m.type === "sound_cue" && typeof m.sound === "string" && m.sound.startsWith("vigilante")),
        )
        .map((m) => {
          const { type, subPhase, isRoleAlive, phase, targetName, alive, sound } = m as any;
          return { type, subPhase, isRoleAlive, phase, targetName, alive, sound };
        }),
    );
  }

  /**
   * Both rows run the SAME script apart from the one bit under test, and both
   * leave c0 (index 5) dead and spectating on night 2 while the vigilante
   * sub-phase is a phantom:
   *   spent  — the vigilante is ALIVE but fired on night 1 (the shot is blocked
   *            by the doctor, so it spends the bullet without changing the
   *            roster: game-engine.ts:1408-1417, one save blocks one source)
   *   dead   — the vigilante still holds an unspent bullet but was killed on
   *            night 1
   * The vigilante's own liveness is necessarily the one roster difference; both
   * mafiosi stay alive in both rows so the night-2 driver is identical, and
   * night 2 produces no deaths at all (the doctor saves the mafia's target), so
   * neither row can end early.
   */
  async function phantomRow(mode: "spent" | "dead"): Promise<string> {
    const res = await runScenario({
      roles: VIG_ROLES,
      settings: BASE_SETTINGS,
      autoNarratorReady: true,
      timeline: [
        // N1 — mafia kill + doctor save differ only in WHO, so that "spent"
        // loses c0 and keeps the vigilante, and "dead" loses the vigilante.
        async (ctx) => {
          await twoMafiaKill(ctx, mode === "spent" ? C0 : VIG);
          await doctorSaves(ctx, LAST);
          await detectiveInv(ctx, M1);
          const vig = ctx.clients[VIG];
          await vig.waitFor("vigilante_targets", 8000);
          const dayP = dayWaiter(ctx);
          // spent: fire at the doctor's protected pick — bullet gone, nobody
          // extra dies. dead: hold, and die to the mafia kill above.
          await vig.vigilanteShoot(mode === "spent" ? uid(ctx, LAST) : null);
          await dayP;
        },
        // Day — in the "dead" row, execute c0 so both rows have c0 spectating.
        async (ctx) => {
          const nightP = ctx.clients[M0].waitFor("mafia_targets", 16000);
          if (mode === "dead") {
            await ctx.clients[M0].callVote(uid(ctx, C0));
            for (const i of [M0, M1, DOC, DET, C0, LAST]) ctx.clients[i].castVote(true);
          } else {
            ctx.clients[M0].endDay();
          }
          await nightP;
        },
        // N2 — the vigilante sub-phase runs as a PHANTOM in both rows.
        async (ctx) => {
          // The phantom sub-phase burns a randomised "thinking" delay
          // (~5-15s, src/server.ts:390) before it closes, and the full suite
          // runs many server subprocesses at once — so this waiter gets a wide
          // budget. Waiting for the CLOSE (not just the open) is deliberate:
          // the close cue is part of the compared stream.
          const closeP = ctx.clients[C0].waitMatch(
            (m) => m.type === "sound_cue" && m.sound === "vigilante_close",
            60000,
            "vigilante_close",
          );
          await twoMafiaKill(ctx, DET);
          await doctorSaves(ctx, DET); // save the mafia's pick: no deaths tonight
          await detectiveInv(ctx, DOC);
          await closeP;
        },
      ],
    });
    return vigilanteStream(res.clients[C0].log);
  }

  test("a dead spectator's vigilante stream is byte-identical, dead vs spent", async () => {
    const spent = await phantomRow("spent");
    const dead = await phantomRow("dead");

    expect(spent).toBe(dead);
    // And the payload never carries the discriminator in the first place.
    expect(spent).not.toMatch(/"isRoleAlive":true/);
    expect(spent).toContain('"subPhase":"vigilante"');
    // Neither stream carries a name, a "fallen" flag or an aim cue.
    for (const s of [spent, dead]) {
      expect(s).not.toMatch(/fallen|taking aim|bullet|spent/i);
    }
  }, 240000);
});
