// Playtest: LOVERS end-to-end over real WebSockets (previously ZERO WS coverage).
//
// The lover cascade ("heartbreak") is a death that follows its partner's death
// through the SAME applyDeath funnel. This file pins the cascade's wire shape at
// dawn and on the day-execution path, and two trigger-interaction edges:
//   a. mafia kills a lover at night  → ONE neutral dawn line names both, no
//      heartbreak/cause tell; living-client events are neutral "death" ×2;
//      player_died is alphabetical (resolution order flipped); both get you_died.
//   b. day execution of a lover      → the partner cascades; the narrator shows
//      the execution line THEN the cascade line (both PUBLIC by design), and the
//      cascade line still names no bond/cause.
//   c. lover partner is the HUNTER, dies by heartbreak cascade → NO revenge gate
//      (cause is "lover_cascade", not "direct").
//   d. a MAFIA lover executed by day → town-lover cascades → win recomputed on
//      the settled board (the sole mafia gone ⇒ town win); at game_over the
//      events payload is FULL detail (execution + lover_death types restored).
//
// Run ONLY this file:  bun test tests/playtest/lovers-heartbreak.test.ts
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

// Any of these words in a public death line would out the bond or the killer.
const CAUSE_WORDS = /heartbreak|lover|sweetheart|Vigilante|gunshot|bullet|\bshot\b|knife|wire|mafia/i;

const dayWaiter = (admin: PlaytestClient, t = 14000) =>
  admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", t, "phase_change(day)");

describe("lovers — heartbreak cascade end-to-end", () => {
  // ── (a) mafia kills a lover at night → both die, ONE neutral dawn line ──────
  test("a — mafia kills a lover: one neutral dawn line names both, alphabetical player_died", async () => {
    // 5 seats: admin/mafia(0) is a LIVING observer throughout; lovers at 3 & 4.
    // Mafia targets seat 4 so the DIRECT death (4) resolves before the CASCADE
    // (3) — the alphabetical wire sort must then flip them back to [3, 4].
    const { clients } = await runScenario({
      roles: ["mafia", "citizen", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableLovers: true },
      lovers: [3, 4],
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 4)); // kill lover B (seat 4)
          await dayP;
        },
      ],
    });

    const admin = clients[0];
    const A = nameOf(clients[3]), B = nameOf(clients[4]);
    const died = diedNames(admin);

    // Both lovers dead; both notified privately.
    expect(died).toContain(A);
    expect(died).toContain(B);
    expect(clients[3].lastOf("you_died")).toBeDefined();
    expect(clients[4].lastOf("you_died")).toBeDefined();

    // ONE combined dawn line names BOTH — no heartbreak/bond/cause tell.
    const lines = dawnMsgs(admin).filter((m) => m.includes(A) || m.includes(B));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(A);
    expect(lines[0]).toContain(B);
    expect(lines[0]).not.toMatch(CAUSE_WORDS);

    // Living-client events: neutral "death" ×2, no source/cause on either.
    const events = dawnEvents(admin);
    expect(events.filter((e) => e.type === "death").length).toBe(2);
    expect(events.some((e) => e.type === "death" && e.playerName === A)).toBe(true);
    expect(events.some((e) => e.type === "death" && e.playerName === B)).toBe(true);
    for (const e of events) {
      expect("source" in (e as object)).toBe(false);
      expect("cause" in (e as object)).toBe(false);
      expect(e.type).not.toBe("lover_death");
    }

    // No separate heartbreak beat rides the dawn.
    expect(admin.lastOf("phase_change")!.loverDeathName).toBeUndefined();

    // player_died is ALPHABETICAL — seat 3 (cascade) ahead of seat 4 (direct),
    // reversing the mafia-then-cascade RESOLUTION order.
    expect(died).toEqual([...died].sort((a, b) => a.localeCompare(b)));
    expect(died[0]).toBe(A);
    expect(died[1]).toBe(B);
  }, 60000);

  // ── (b) day execution of a lover → execution THEN cascade line (both public) ─
  test("b — executing a lover cascades to the partner; execution line precedes cascade line", async () => {
    // 6 seats so neither the N1 kill nor the D1 execution+cascade trips a win.
    const { clients } = await runScenario({
      roles: ["mafia", "citizen", "citizen", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableLovers: true },
      lovers: [4, 5],
      autoNarratorReady: true,
      timeline: [
        // N1: mafia kills a non-lover citizen so day 1 has a fresh board.
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 1));
          await dayP;
        },
        // D1: execute lover seat 4 → seat 5 cascades. Wait for the execution
        // phase_change (it carries the execution + cascade narrator lines).
        async (ctx) => {
          const admin = ctx.clients[0];
          const execName = nameOf(ctx.clients[4]);
          await admin.callVote(uid(ctx, 4));
          const pcP = admin.waitMatch(
            (m) => m.type === "phase_change" && Array.isArray(m.messages) && (m.messages as string[]).some((s) => s.includes(execName)),
            14000,
            "phase_change(execution)",
          );
          // Arm the partner's you_died BEFORE voting — it rides a different
          // socket than the admin's phase_change and can otherwise still be in
          // flight when pcP resolves.
          const partnerDiedP = ctx.clients[5].waitFor("you_died", 14000);
          for (const i of [0, 2, 3, 4, 5]) ctx.clients[i].castVote(true); // seat 1 is dead
          await Promise.all([pcP, partnerDiedP]);
        },
      ],
    });

    const admin = clients[0];
    const execLover = nameOf(clients[4]); // executed
    const partner = nameOf(clients[5]);   // cascade

    // vote_result names the executed lover as a real execution.
    const vr = admin.lastOf("vote_result")!;
    expect(vr.executed).toBe(true);
    expect(vr.targetName).toBe(execLover);

    // Both die; both get you_died.
    const died = diedNames(admin);
    expect(died).toContain(execLover);
    expect(died).toContain(partner);
    expect(clients[4].lastOf("you_died")).toBeDefined();
    expect(clients[5].lastOf("you_died")).toBeDefined();

    // The execution phase_change carries BOTH lines (public by design), with the
    // execution line BEFORE the cascade line.
    const msgs = dawnMsgs(admin);
    const execIdx = msgs.findIndex((m) => m.includes(execLover));
    const cascadeIdx = msgs.findIndex((m) => m.includes(partner) && !m.includes(execLover));
    expect(execIdx).toBeGreaterThanOrEqual(0);
    expect(cascadeIdx).toBeGreaterThanOrEqual(0);
    expect(execIdx).toBeLessThan(cascadeIdx);
    // The cascade line still names no bond/cause (only WHO).
    expect(msgs[cascadeIdx]).not.toMatch(CAUSE_WORDS);
  }, 60000);

  // ── (c) lover HUNTER dies by cascade → NO revenge gate (cause != direct) ────
  test("c — a Hunter who dies by heartbreak cascade takes NO revenge", async () => {
    // Lovers 3 (citizen) & 4 (HUNTER). Mafia kills seat 3 → seat 4 (Hunter)
    // dies as a lover_cascade → the revenge trigger must NOT queue.
    const { clients } = await runScenario({
      roles: ["mafia", "citizen", "citizen", "citizen", "hunter"] as Role[],
      settings: { enableLovers: true, enableHunter: true },
      lovers: [3, 4],
      autoNarratorReady: true,
      timeline: [
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 3)); // kill the Hunter's lover
          await dayP;
        },
      ],
    });

    const admin = clients[0];
    const hunter = clients[4];

    // Both lovers dead.
    expect(diedNames(admin)).toContain(nameOf(clients[3]));
    expect(diedNames(admin)).toContain(nameOf(hunter));
    expect(hunter.lastOf("you_died")).toBeDefined();

    // NO revenge gate anywhere: no public pending broadcast, no hunter prompt.
    expect(admin.allOf("hunter_revenge_pending").length).toBe(0);
    expect(hunter.allOf("hunter_revenge_targets").length).toBe(0);
    expect(admin.allOf("hunter_revenge_pending").length + hunter.allOf("hunter_revenge_targets").length).toBe(0);

    // The dawn resolved straight to day (no deferred two-stage dawn).
    expect(admin.lastOf("phase_change")!.phase).toBe("day");
  }, 60000);

  // ── (d) a MAFIA lover executed → town-lover cascades → win recomputed ───────
  test("d — executing the sole (lover) mafioso ⇒ town win after the cascade; full events at game_over", async () => {
    // admin/mafia(0) is the ONLY mafioso AND a lover with citizen seat 1.
    // N1: the mafia kills a citizen (game continues). D1: the admin nominates
    // ITSELF; the room executes the mafioso → 0 mafia ⇒ TOWN win, and the town
    // lover (seat 1) cascades on the same funnel.
    const { clients } = await runScenario({
      roles: ["mafia", "citizen", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableLovers: true },
      lovers: [0, 1],
      autoNarratorReady: true,
      timeline: [
        // N1: mafia kills seat 4.
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = dayWaiter(admin);
          await admin.killAsMafia(uid(ctx, 4));
          await dayP;
        },
        // D1: execute the mafia lover (admin/seat 0) → town win + cascade.
        async (ctx) => {
          const admin = ctx.clients[0];
          await admin.callVote(uid(ctx, 0));
          const overP = admin.waitFor("game_over", 14000);
          for (const i of [0, 1, 2, 3]) ctx.clients[i].castVote(true); // seat 4 dead
          await overP;
        },
      ],
    });

    const admin = clients[0];
    const gameOver = admin.lastOf("game_over")!;

    // The recomputed win: the sole mafioso is gone ⇒ TOWN, not a stalemate.
    expect(gameOver.winner).toBe("town");

    // The cascade is accounted for: both the mafia lover and the town lover
    // are dead in the final roster.
    const players = gameOver.players as Array<{ username: string; isAlive: boolean }>;
    const mafLover = players.find((p) => p.username === nameOf(clients[0]))!;
    const townLover = players.find((p) => p.username === nameOf(clients[1]))!;
    expect(mafLover.isAlive).toBe(false);
    expect(townLover.isAlive).toBe(false);

    // At game_over the phase_change events are FULL detail again: the execution
    // and the lover_death labels are restored (no longer collapsed to "death").
    const events = dawnEvents(admin);
    expect(events.some((e) => e.type === "execution" && e.playerName === nameOf(clients[0]))).toBe(true);
    expect(events.some((e) => e.type === "lover_death" && e.playerName === nameOf(clients[1]))).toBe(true);
  }, 60000);
});
