// Playtest: JOKER end-to-end over real WebSockets (previously ZERO WS coverage).
//
//   a. Official mode — joker lynched, game CONTINUES; next night the dead joker
//      gets a haunt prompt, haunts a lynch-voter, the victim dies at dawn as a
//      neutral "death"; the joint-win is recorded (jokerJointWinner at game_over,
//      and a joker_win_overlay to the joker at the lynch).
//   b. Official mode — the Doctor SAVES the haunt target → the haunt is blocked,
//      the target lives.
//   c. House mode   — joker lynched ⇒ INSTANT game_over, winner "joker".
//
// Run ONLY this file:  bun test tests/playtest/joker-haunt.test.ts
//   (…then `pkill -f src/server.ts`.)

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioContext } from "./harness.ts";
import type { Role } from "../../src/types.ts";

const nameOf = (c: PlaytestClient) => c.lastOf("registered")!.username as string;
const diedNames = (admin: PlaytestClient) => admin.allOf("player_died").map((m) => m.playerName as string);
const dawnMsgs = (admin: PlaytestClient): string[] => (admin.lastOf("phase_change")?.messages as string[]) ?? [];
const uid = (ctx: ScenarioContext, i: number) => ctx.clients[i].userId!;
const CAUSE_WORDS = /joker|haunt|card|clown|vengeance|Vigilante|bullet|\bshot\b|mafia|knife/i;

/** Admin force-dawns the opening night (a no-kill "spare") and awaits day. */
async function spareNightToDay(ctx: ScenarioContext): Promise<void> {
  const admin = ctx.clients[0];
  const dayP = admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 14000, "day");
  admin.forceDawn();
  await dayP;
}

/** Doctor save (waits for its prompt first). */
async function doctorSaves(ctx: ScenarioContext, doctorIdx: number, targetIdx: number): Promise<void> {
  const doc = ctx.clients[doctorIdx];
  await doc.waitFor("doctor_targets", 10000);
  await doc.doctorSave(uid(ctx, targetIdx));
}

describe("joker — haunt & joint-win end-to-end", () => {
  // ── (a) official: lynch → continue → haunt kills a voter → joint win ────────
  test("a — official joker lynched, haunts a voter at dawn; joint-win recorded", async () => {
    const { clients } = await runScenario({
      roles: ["mafia", "joker", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableJoker: true, jokerMode: "official" },
      autoNarratorReady: true,
      timeline: [
        // N1: spare (no kill) so the day-1 board is full.
        async (ctx) => { await spareNightToDay(ctx); },
        // D1: the whole room votes to lynch the joker (seat 1).
        async (ctx) => {
          const admin = ctx.clients[0], joker = ctx.clients[1];
          await admin.callVote(uid(ctx, 1));
          const overlayP = joker.waitFor("joker_win_overlay", 12000);
          const hauntP = joker.waitFor("joker_haunt_targets", 12000); // N2 opened for the dead joker
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(true);
          await Promise.all([overlayP, hauntP]);
        },
        // N2: the dead joker haunts a YES-voter (seat 2); the mafia kills seat 3.
        // Both deaths at dawn tip parity ⇒ mafia win (joker joint-winner).
        async (ctx) => {
          const admin = ctx.clients[0], joker = ctx.clients[1];
          joker.jokerHaunt(uid(ctx, 2));
          const overP = admin.waitFor("game_over", 14000);
          const hauntDiedP = ctx.clients[2].waitFor("you_died", 14000);
          await admin.killAsMafia(uid(ctx, 3));
          await Promise.all([overP, hauntDiedP]);
        },
      ],
    });

    const admin = clients[0], joker = clients[1];
    const hauntVictim = nameOf(clients[2]); // a lynch-voter, NOT the mafia target
    const mafiaVictim = nameOf(clients[3]);

    // The lynch produced the joker's win overlay (official joint-win).
    expect(joker.lastOf("joker_win_overlay")).toBeDefined();

    // The haunt killed its voter (seat 2 was never the mafia's target ⇒ the only
    // possible source is the haunt) and the mafia killed seat 3.
    const died = diedNames(admin);
    expect(died).toContain(hauntVictim);
    expect(died).toContain(mafiaVictim);
    expect(clients[2].lastOf("you_died")).toBeDefined();

    // The dawn line names both, cause-neutral (never "haunt"/"joker").
    const lines = dawnMsgs(admin).filter((m) => m.includes(hauntVictim) || m.includes(mafiaVictim));
    expect(lines.some((l) => l.includes(hauntVictim) && l.includes(mafiaVictim))).toBe(true);
    for (const l of lines) expect(l).not.toMatch(CAUSE_WORDS);

    // Joint-win representation: game_over winner "mafia" + jokerJointWinner true.
    const over = admin.lastOf("game_over")!;
    expect(over.winner).toBe("mafia");
    expect(over.jokerJointWinner).toBe(true);

    // At game_over the events are FULL detail: the haunt death keeps its real
    // "joker_haunt" label (collapsed to "death" only while in progress).
    const events = (admin.lastOf("phase_change")?.events as Array<{ type: string; playerName: string }>) ?? [];
    expect(events.some((e) => e.type === "joker_haunt" && e.playerName === hauntVictim)).toBe(true);
  }, 60000);

  // ── (b) official: doctor saves the haunt target → no death ──────────────────
  test("b — the Doctor blocks the joker haunt (haunt target lives)", async () => {
    const { clients } = await runScenario({
      roles: ["mafia", "joker", "doctor", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableJoker: true, jokerMode: "official", enableDoctor: true },
      autoNarratorReady: true,
      timeline: [
        // N1: mafia kills seat 3; doctor saves seat 4 (keeps seats 4 & 5 alive).
        async (ctx) => {
          const admin = ctx.clients[0];
          const dayP = admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 14000, "day");
          await admin.killAsMafia(uid(ctx, 3));
          await doctorSaves(ctx, 2, 4);
          await dayP;
        },
        // D1: lynch the joker (seat 1); seats 4 & 5 vote YES (haunt-eligible).
        async (ctx) => {
          const admin = ctx.clients[0], joker = ctx.clients[1];
          await admin.callVote(uid(ctx, 1));
          const hauntP = joker.waitFor("joker_haunt_targets", 12000);
          // ALL alive must vote for the ballot to resolve (seat 3 is dead).
          for (const i of [0, 1, 2, 4, 5]) ctx.clients[i].castVote(true);
          await hauntP;
        },
        // N2: joker haunts seat 5, mafia kills seat 4, DOCTOR saves seat 5 (the
        // haunt target) → the haunt is blocked; only the mafia kill lands.
        async (ctx) => {
          const admin = ctx.clients[0], joker = ctx.clients[1];
          joker.jokerHaunt(uid(ctx, 5));
          const dayP = admin.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 16000, "day2");
          await admin.killAsMafia(uid(ctx, 4));
          await doctorSaves(ctx, 2, 5); // save the haunt target (≠ N1 save seat 4)
          await dayP;
        },
        async ({ sleep }) => { await sleep(150); },
      ],
    });

    const admin = clients[0];
    // The haunt target (seat 5) survived: no private death, not in the roll.
    expect(clients[5].lastOf("you_died")).toBeUndefined();
    expect(diedNames(admin)).not.toContain(nameOf(clients[5]));
    // The mafia's target (seat 4) died.
    expect(diedNames(admin)).toContain(nameOf(clients[4]));
    // The joker really did submit a haunt (got the prompt + we sent it).
    expect(clients[1].lastOf("joker_haunt_targets")).toBeDefined();
  }, 60000);

  // ── (c) house: lynch ⇒ instant joker win ────────────────────────────────────
  test("c — house-mode joker lynched ⇒ instant game_over, winner joker", async () => {
    const { clients } = await runScenario({
      roles: ["mafia", "joker", "citizen", "citizen", "citizen"] as Role[],
      settings: { enableJoker: true, jokerMode: "house" },
      autoNarratorReady: true,
      timeline: [
        async (ctx) => { await spareNightToDay(ctx); },
        async (ctx) => {
          const admin = ctx.clients[0];
          await admin.callVote(uid(ctx, 1));
          const overP = admin.waitFor("game_over", 12000);
          for (const i of [0, 1, 2, 3, 4]) ctx.clients[i].castVote(true);
          await overP;
        },
      ],
    });

    const over = clients[0].lastOf("game_over")!;
    expect(over.winner).toBe("joker");
    // House mode is a solo joker win — no haunt night happened.
    expect(clients[1].allOf("joker_haunt_targets").length).toBe(0);
  }, 60000);
});
