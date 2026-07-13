// Player-initiated accusations — end-to-end over real WebSockets.
//
// Full accuse → second → vote → lynch, the sleep-proposal (no-lynch) path,
// rejection paths (silent), and failed-vote persistence of pending accusations.
//
// Run ONLY this file:  bun test tests/playtest/accusation-flow.test.ts
// (server-spawning; do not run concurrently with other WS suites)

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const FIVE: Role[] = ["mafia", "citizen", "citizen", "citizen", "citizen"];
const uid = (ctx: ScenarioContext, i: number) => ctx.clients[i].userId!;

// Force the opened night to dawn so we land in the day phase where accusations
// live. autoNarratorReady has already opened night 1.
async function toDay(ctx: ScenarioContext): Promise<void> {
  const admin = ctx.clients[0];
  const dayP = admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)");
  admin.forceDawn();
  await dayP;
}

/** The pending accusation list from a client's latest accusations_update. */
function pending(c: PlaytestClient): any[] {
  return (c.lastOf("accusations_update")?.accusations as any[]) ?? [];
}

describe("accusations — end to end", () => {
  test("accuse → second → vote → lynch", async () => {
    let lynchTarget = "";
    const { clients } = await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const accuser = ctx.clients[1];
          const seconder = ctx.clients[3];
          const admin = ctx.clients[0];

          // Seat 1 accuses seat 2. A different living player must second it.
          const accP = admin.waitFor("accusations_update");
          accuser.accuse(uid(ctx, 2));
          const acc = await accP;
          expect(acc.accusations.length).toBe(1);
          expect(acc.accusations[0].accuserId).toBe(uid(ctx, 1));
          expect(acc.accusations[0].targetId).toBe(uid(ctx, 2));
          const accusationId = acc.accusations[0].id;
          lynchTarget = ctx.clients[2].lastOf("registered")!.username;

          // Seat 3 seconds → the ballot opens (vote_called on seat 2).
          const calledP = admin.waitFor("vote_called");
          seconder.secondAccusation(accusationId);
          const called = await calledP;
          expect(called.targetId).toBe(uid(ctx, 2));
          expect(called.sleep).toBeUndefined();

          // Everyone except the target votes to execute. Wait on the target's
          // own you_died so the assertion can't race socket teardown.
          const resultP = admin.waitFor("vote_result");
          const diedP = ctx.clients[2].waitFor("you_died");
          const nightP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "night", 14000, "phase_change(night)");
          ctx.clients[2].castVote(false);
          for (const i of [0, 1, 3, 4]) ctx.clients[i].castVote(true);
          const result = await resultP;
          expect(result.executed).toBe(true);
          expect(result.targetName).toBe(lynchTarget);
          await diedP;
          await nightP;
        },
      ],
    });

    // The accused was executed and privately notified.
    expect(clients[2].lastOf("you_died")).toBeDefined();
    expect(clients[0].allOf("player_died").some((m) => m.playerName === lynchTarget)).toBe(true);
  }, 30000);

  test("sleep proposal → second → majority YES ends the day (night falls)", async () => {
    const { clients } = await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          // Seat 1 proposes the town sleeps (targetId null).
          const accP = admin.waitFor("accusations_update");
          ctx.clients[1].accuse(null);
          const acc = await accP;
          expect(acc.accusations[0].targetId).toBe(null);
          const id = acc.accusations[0].id;

          // Seat 2 seconds → sleep ballot opens (vote_called with sleep:true).
          const calledP = admin.waitFor("vote_called");
          ctx.clients[2].secondAccusation(id);
          const called = await calledP;
          expect(called.sleep).toBe(true);

          // Everyone votes YES to sleep → day ends, night 2 begins.
          const nightP = admin.waitMatch(
            (m) => m.type === "phase_change" && m.phase === "night" && m.round === 2,
            14000, "phase_change(night,2)");
          const resultP = admin.waitFor("vote_result");
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(true);
          const result = await resultP;
          expect(result.sleep).toBe(true);
          expect(result.sleepPassed).toBe(true);
          await nightP;
        },
      ],
    });

    // No one died on the sleep night-in.
    expect(clients[0].allOf("player_died").length).toBe(0);
    expect(clients[0].lastOf("phase_change")!.phase).toBe("night");
  }, 30000);

  test("rejection paths are silent (no vote opens)", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          // Self-accusation: rejected → no accusations_update.
          ctx.clients[1].accuse(uid(ctx, 1));
          await ctx.sleep(200);
          expect(admin.lastOf("accusations_update")).toBeUndefined();

          // Valid accusation stands.
          const accP = admin.waitFor("accusations_update");
          ctx.clients[1].accuse(uid(ctx, 2));
          const acc = await accP;
          const id = acc.accusations[0].id;

          // Accuser seconds their own accusation → rejected, no vote_called.
          ctx.clients[1].secondAccusation(id);
          // Accused seconds their own trial → rejected too.
          ctx.clients[2].secondAccusation(id);
          await ctx.sleep(300);
          expect(admin.lastOf("vote_called")).toBeUndefined();
          expect(admin.lastOf("phase_change")!.phase).toBe("day");
          // The accusation is still pending.
          expect(pending(admin).length).toBe(1);
        },
      ],
    });
  }, 30000);

  test("failed vote → other pending accusation still standing", async () => {
    await runScenario({
      roles: FIVE,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          await toDay(ctx);
          const admin = ctx.clients[0];

          // Two pending accusations: seat1→seat2 and seat3→seat4.
          let p = admin.waitFor("accusations_update");
          ctx.clients[1].accuse(uid(ctx, 2));
          await p;
          p = admin.waitFor("accusations_update");
          ctx.clients[3].accuse(uid(ctx, 4));
          const two = await p;
          expect(two.accusations.length).toBe(2);
          const first = two.accusations.find((a: any) => a.accuserId === uid(ctx, 1));

          // Second the first accusation (seat 4 seconds) → ballot on seat 2.
          const calledP = admin.waitFor("vote_called");
          ctx.clients[4].secondAccusation(first.id);
          await calledP;

          // Spare seat 2: everyone votes NO → back to day.
          const dayP = admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 14000, "day");
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(false);
          await dayP;

          // The other accusation (seat3→seat4) is still pending after the failed vote.
          await ctx.sleep(200);
          const still = pending(admin);
          expect(still.length).toBe(1);
          expect(still[0].accuserId).toBe(uid(ctx, 3));
        },
      ],
    });
  }, 30000);
});
