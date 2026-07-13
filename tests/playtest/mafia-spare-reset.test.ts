// Multiplayer (real-WebSocket) regression for the mafia "Spare" reset bug,
// driven through the deterministic pinned-deal harness — the same loop-testing
// architecture as the rest of the playtest suite.
//
// Scenario (exactly the reported bug): mafia M0 SPARES C0 on night 1 (a letsnot
// objection) while the team kills C1; the town then lynches M0 (the objector) on
// day 1; on night 2 the remaining mafia M1 must be able to kill the
// previously-spared C0. This proves the ENGINE carries no stale objection across
// nights and that a dead objector's spare can't block the survivors. (The
// user-visible half of the bug was a CLIENT rendering leak — see
// tests/mafia-spare-reset.test.ts; this guards the server side end-to-end.)
//
// Run ONLY this file:  bun test tests/playtest/mafia-spare-reset.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

// 7 players so neither the night-1 kill nor the day-1 lynch trips a parity win.
const M0 = 0, M1 = 1, C0 = 2, C1 = 3, C2 = 4, C3 = 5, C4 = 6;
const ROLES: Role[] = ["mafia", "mafia", "citizen", "citizen", "citizen", "citizen", "citizen"];

const uid = (ctx: ScenarioContext, idx: number) => ctx.clients[idx].userId!;

/** Night 1: M0 spares `spareIdx` (letsnot), then both mafia lock `killIdx`. */
async function spareThenKill(ctx: ScenarioContext, spareIdx: number, killIdx: number): Promise<void> {
  const m0 = ctx.clients[M0], m1 = ctx.clients[M1];
  const spareId = uid(ctx, spareIdx), killId = uid(ctx, killIdx);

  // M0 objects to (spares) C0 — this is the state that must NOT persist.
  let p = m0.waitFor("mafia_vote_update", 8000);
  m0.mafiaVote(spareId, "letsnot");
  await p;

  // M0 nominates + locks the real victim (a different target — the spare only
  // blocks others from locking C0, not C1).
  p = m0.waitFor("mafia_vote_update", 8000);
  m0.mafiaVote(killId, "maybe");
  await p;
  p = m0.waitFor("mafia_vote_update", 8000);
  m0.mafiaVote(killId, "lock");
  await p;

  // M1 nominates then locks the same victim → consensus.
  p = m1.waitFor("mafia_vote_update", 8000);
  m1.mafiaVote(killId, "maybe");
  await p;
  const ready = m1.waitFor("mafia_confirm_ready", 8000);
  m1.mafiaVote(killId, "lock");
  await ready;

  // Arm the dawn→day waiter BEFORE the kill resolves, so we don't race past it.
  const done = m0.waitFor("night_action_done", 8000);
  const dayP = m0.waitMatch(
    (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day1)"
  );
  m0.confirmMafiaKill();
  await done;
  await dayP;
}

/** Admin nominates `targetIdx`; every alive seat votes YES → execution → next night opens. */
async function dayExecute(ctx: ScenarioContext, targetIdx: number, aliveIdxs: number[], mafiaWatcherIdx: number): Promise<void> {
  const admin = ctx.clients[M0];
  await admin.callVote(uid(ctx, targetIdx));
  const nightP = ctx.clients[mafiaWatcherIdx].waitFor("mafia_targets", 12000);
  for (const i of aliveIdxs) ctx.clients[i].castVote(true);
  await nightP;
}

const nameOf = (ctx: ScenarioContext, idx: number) => ctx.clients[idx].lastOf("registered")!.username as string;

describe("mafia spare does not persist across nights (engine, end-to-end)", () => {
  test("a target spared on night 1 — by a mafioso later lynched — is killable on night 2", async () => {
    const { clients } = await runScenario({
      roles: ROLES,
      settings: { mafiaCount: 2 },
      autoNarratorReady: true, // opens night 1; mafia receives mafia_targets
      timeline: [
        // NIGHT 1 — M0 spares C0, team kills C1.
        async (ctx) => { await spareThenKill(ctx, C0, C1); },
        // DAY 1 — lynch M0, the objector. (C1 is dead; the rest are alive.)
        async (ctx) => { await dayExecute(ctx, M0, [M0, M1, C0, C2, C3, C4], M1); },
        // NIGHT 2 — the lone remaining mafia M1 kills the previously-spared C0.
        async (ctx) => {
          const dayP = ctx.clients[M1].waitMatch(
            (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)"
          );
          await ctx.clients[M1].killAsMafia(uid(ctx, C0));
          await dayP;
        },
      ],
    });

    const ctx = { clients } as ScenarioContext;
    const died = clients[M0].allOf("player_died").map((m) => m.playerName as string);

    // C1 fell night 1, M0 was lynched day 1, and — the crux — C0 (spared night 1)
    // was killed night 2 by the surviving mafia. If the engine had carried M0's
    // objection forward, M1 could not have locked C0 and this would fail.
    expect(died).toContain(nameOf(ctx, C1));
    expect(died).toContain(nameOf(ctx, M0));
    expect(died).toContain(nameOf(ctx, C0));
  }, 45000);
});
