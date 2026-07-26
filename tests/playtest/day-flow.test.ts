// P5 day flow — end-to-end over real WebSockets.
//
// The restyled day surfaces are driven entirely by wire frames, so this file
// pins the frames the P5 UI reads:
//   (a) accuse → second → ballot → EXECUTE, and the same loop → SPARE
//       (including the Day-9 fix: the spared outcome is narrated ONCE, by the
//       engine, on the spared phase_change — the client no longer invents a
//       second, contradicting string)
//   (b) sleep proposal → ballot PASS (night, no execution) and FAIL (day
//       continues with the other accusations still standing)
//   (c) dead spectators receive accusations_update (the read-only view's data
//       source) without disturbing the living flow
//   (d) the admin call_vote secondary path still opens the identical ballot,
//       and cancel_vote returns the day with accusations intact
//
// Run ONLY this file:  bun test tests/playtest/day-flow.test.ts
// (server-spawning; do not run concurrently with other WS suites)

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const FIVE: Role[] = ["mafia", "citizen", "citizen", "citizen", "citizen"];
const uid = (ctx: ScenarioContext, i: number) => ctx.clients[i].userId!;

async function toDay(ctx: ScenarioContext): Promise<void> {
  const admin = ctx.clients[0];
  const dayP = admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)");
  admin.forceDawn();
  await dayP;
}

function pending(c: PlaytestClient): any[] {
  return (c.lastOf("accusations_update")?.accusations as any[]) ?? [];
}

/** Accuse and return the resulting accusation id (as every client sees it). */
async function accuseAndId(
  ctx: ScenarioContext, accuserIdx: number, targetIdx: number | null,
): Promise<number> {
  const watcher = ctx.clients[0];
  const p = watcher.waitFor("accusations_update");
  ctx.clients[accuserIdx].accuse(targetIdx === null ? null : uid(ctx, targetIdx));
  const acc = await p;
  return acc.accusations[acc.accusations.length - 1].id;
}

describe("P5 day flow — accusation loop", () => {
  test("accuse → second → ballot → EXECUTE", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          const id = await accuseAndId(ctx, 1, 2);
          // The accusation is standing and narrated to the whole room — the
          // "Standing accusations" list's data.
          expect(pending(admin).length).toBe(1);
          expect(admin.lastOf("accusations_update")!.message).toBeString();

          // A second consumes the accusation and opens the ballot with no
          // admin in the loop. targetName drives the "Execute X?" headline;
          // `sleep` is absent, so the target art renders.
          const calledP = admin.waitFor("vote_called");
          ctx.clients[3].secondAccusation(id);
          const called = await calledP;
          expect(called.targetId).toBe(uid(ctx, 2));
          expect(called.targetName).toBeString();
          expect(called.sleep).toBeUndefined();
          // Panel data is empty the moment the ballot opens (the client hides
          // the block outright — rule 9).
          expect(pending(admin).length).toBe(0);

          // Running tally frames feed "n/m votes cast".
          const progressP = admin.waitFor("vote_update");
          ctx.clients[2].castVote(false);
          const prog = await progressP;
          expect(prog.total).toBe(5);
          expect(prog.totalVotes).toBeGreaterThan(0);

          const resultP = admin.waitFor("vote_result");
          const diedP = ctx.clients[2].waitFor("you_died");
          const nightP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "night", 14000, "phase_change(night)");
          for (const i of [0, 1, 3, 4]) ctx.clients[i].castVote(true);
          const result = await resultP;
          expect(result.executed).toBe(true);
          expect(result.sleep).toBeUndefined();
          await diedP;
          await nightP;
        },
      ],
    });
  }, 30000);

  test("accuse → second → ballot → SPARE narrates exactly one spared line (Day-9)", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];
          const spared = ctx.clients[2];

          const id = await accuseAndId(ctx, 1, 2);
          const calledP = admin.waitFor("vote_called");
          ctx.clients[3].secondAccusation(id);
          await calledP;

          const resultP = admin.waitFor("vote_result");
          const dayP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)");
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(false);
          const result = await resultP;
          expect(result.executed).toBe(false);
          const back = await dayP;

          // Day-9: the spared phase_change now carries the ENGINE's
          // EXECUTION_SPARED_MESSAGES line — the single source of truth for
          // this outcome. Before the fix it carried nothing and the client
          // supplied two competing strings of its own.
          const sparedName = spared.lastOf("registered")!.username;
          expect(back.messages.length).toBe(1);
          expect(back.messages[0]).toContain(sparedName);
          expect(back.messages[0]).not.toContain("abstain");
          // Nobody died, and the room stays in the day.
          expect(admin.allOf("player_died").length).toBe(0);
          expect(admin.lastOf("phase_change")!.phase).toBe("day");
        },
      ],
    });
  }, 30000);
});

describe("P5 day flow — sleep proposal", () => {
  test("sleep ballot PASSES → night, no execution", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          const id = await accuseAndId(ctx, 1, null);
          expect(pending(admin)[0].targetId).toBe(null);

          // The sleep ballot arrives target-less: no portrait, labelled thumbs.
          const calledP = admin.waitFor("vote_called");
          ctx.clients[2].secondAccusation(id);
          const called = await calledP;
          expect(called.sleep).toBe(true);
          expect(called.targetName).toBe("");

          const resultP = admin.waitFor("vote_result");
          const nightP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "night" && m.round === 2,
            14000, "phase_change(night,2)");
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(true);
          const result = await resultP;
          expect(result.sleep).toBe(true);
          expect(result.sleepPassed).toBe(true);
          await nightP;
          // No execution overlay is possible: nobody died.
          expect(admin.allOf("player_died").length).toBe(0);
        },
      ],
    });
  }, 30000);

  test("sleep ballot FAILS → day continues, other accusations still standing", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          // One execution accusation + one sleep motion stacked (they share the
          // same one-per-day budget, so they come from different players).
          await accuseAndId(ctx, 1, 2);
          const sleepId = await accuseAndId(ctx, 3, null);
          expect(pending(admin).length).toBe(2);

          const calledP = admin.waitFor("vote_called");
          ctx.clients[4].secondAccusation(sleepId);
          expect((await calledP).sleep).toBe(true);

          const resultP = admin.waitFor("vote_result");
          const dayP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)");
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(false);
          const result = await resultP;
          expect(result.sleepPassed).toBe(false);
          await dayP;

          // The execution accusation survives the failed sleep vote, so the
          // "Standing accusations" list comes back populated.
          await ctx.sleep(200);
          const still = pending(admin);
          expect(still.length).toBe(1);
          expect(still[0].accuserId).toBe(uid(ctx, 1));
        },
      ],
    });
  }, 30000);
});

describe("P5 day flow — dead spectators", () => {
  test("a dead client receives accusations_update; the living flow is unaffected", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0]; // mafia
          const victim = ctx.clients[4];

          // Night 1: the mafia kills seat 4, so the day opens with one dead
          // client already in the room.
          const diedP = victim.waitFor("you_died");
          const dayP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)");
          await admin.killAsMafia(uid(ctx, 4));
          await diedP;
          await dayP;

          // A living player accuses another.
          const id = await accuseAndId(ctx, 1, 2);

          // The DEAD client is on the broadcast: it gets the same public frame
          // the living do (accuser/target names are public by construction).
          await victim.waitFor("accusations_update");
          const spectatorView = pending(victim);
          expect(spectatorView.length).toBe(1);
          expect(spectatorView[0].accuserId).toBe(uid(ctx, 1));
          expect(spectatorView[0].targetId).toBe(uid(ctx, 2));
          expect(spectatorView[0].accuserName).toBeString();

          // The dead client cannot act: its second is dropped silently and no
          // ballot opens.
          victim.secondAccusation(id);
          await ctx.sleep(300);
          expect(admin.lastOf("vote_called")).toBeUndefined();
          expect(pending(admin).length).toBe(1);

          // A LIVING second still opens the ballot — spectating changed nothing.
          const calledP = admin.waitFor("vote_called");
          ctx.clients[3].secondAccusation(id);
          expect((await calledP).targetId).toBe(uid(ctx, 2));
        },
      ],
    });
  }, 40000);
});

describe("P5 day flow — admin call_vote (secondary path)", () => {
  test("call_vote opens the same ballot; cancel_vote returns the day with accusations intact", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          // A player accusation is standing when the admin nominates someone
          // else — both day paths coexist.
          await accuseAndId(ctx, 1, 2);

          const called = await admin.callVote(uid(ctx, 3));
          expect(called.targetId).toBe(uid(ctx, 3));
          expect(called.sleep).toBeUndefined();
          expect(called.targetName).toBeString();

          // The admin's Cancel vote works after the admin has voted (Day-8:
          // the app keeps the control up post-vote).
          admin.castVote(true);
          const dayP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)");
          admin.send({ type: "cancel_vote" });
          const back = await dayP;
          expect(back.messages.some((m: string) => m.includes("cancelled"))).toBe(true);

          // The standing accusation outlived the cancelled ballot.
          await ctx.sleep(200);
          expect(pending(admin).length).toBe(1);
          expect(pending(admin)[0].accuserId).toBe(uid(ctx, 1));
        },
      ],
    });
  }, 30000);
});
