// Regression fence: LIVING clients never learn the CAUSE of a night death.
//
// This codifies EXISTING, DELIBERATE behavior (matrix-day-actions.md decision 2
// / section 10) — it is not a bug hunt. A night death may be a mafia kill, a
// vigilante shot, a joker haunt or a heartbreak cascade; every surface a living
// client can see must render the first three IDENTICALLY:
//   - src/narrator.ts:219-235  — NIGHT_DEATH_SINGLE / DIED_IN_NIGHT_MESSAGES
//     name only WHO died, never HOW.
//   - src/game-engine.ts:1176  — projectEventsForClients() collapses
//     kill / vigilante_shot / joker_haunt to the neutral "death" type and
//     strips `cause` / `source` from every event on the wire.
//   - src/server.ts:2078-2084  — the death BATCH is emitted alphabetically
//     among the direct kills, so the resolution order can't out which death
//     was the mafia's and which was the vigilante's.
//   - public/app.js:2144-2171  — the in-game event log maps all four night
//     death labels to "Died in the night" and to ONE shared CSS class.
//
// DEAD SPECTATORS ARE DELIBERATELY EXEMPT. Owner ruling: dead players are
// omniscient (they watch the per-sub-phase spectator stream live). Nothing
// here asserts neutrality for a client that has received `you_died` — doing so
// would contradict the design, not protect it.
//
// Run ONLY this file:  bun test tests/playtest/death-cause-neutrality.test.ts

import { describe, test, expect } from "bun:test";
import { runScenario, type PlaytestClient, type ScenarioContext, type WSMessage } from "./harness.ts";
import type { Role } from "../../src/types.ts";

// ── Pinned 6-player deal (role[i] → clients[i], join order) ─────────────────
// clients[0] is the room admin AND a plain citizen, so the assertions below run
// against at least one living seat with no private night knowledge at all.
const ADMIN = 0, MAF = 1, DOC = 2, DET = 3, VIG = 4, CIT = 5;
const ROLES: Role[] = ["citizen", "mafia", "doctor", "detective", "vigilante", "citizen"];
// Optional roles are OFF in DEFAULT_SETTINGS — a dealt-but-disabled role's
// night sub-phase is skipped entirely, so they must be enabled explicitly.
const SETTINGS = { mafiaCount: 1, enableDoctor: true, enableDetective: true, enableVigilante: true };

// ── The fence ───────────────────────────────────────────────────────────────
// Derived from what the engine COULD say if a cause-revealing variant ever
// leaked into a death surface: the mafia's method (stab/knife/strangle/poison),
// the vigilante's (gun/bullet/shot), the joker's (haunt), or either killer
// named outright. Every one of these is ABSENT from the neutral pools
// (NIGHT_DEATH_SINGLE, DIED_IN_NIGHT_MESSAGES), from DAY_BREAKS/NIGHT_FALLS,
// and from the default-mode DOCTOR_SAVE_OFFICIAL pool — so a match means a real
// leak, not a copy coincidence.
//
// NOT forbidden, on purpose: "heartbreak" — a lover cascade is PUBLIC by owner
// ruling, so no deal here seats lovers and the word is left out of the pattern.
// The deals also seat NO Hunter: the Hunter's revenge is a public reveal whose
// copy legitimately says "shot"/"gun", so extending this fence to a Hunter
// scenario would need an explicit carve-out for those two lines.
const CAUSE_TERMS =
  /\b(?:stab\w*|knif\w*|blade|strangl\w*|poison\w*|gun\w*|bullet\w*|shot|shoot\w*|mafia|mafioso|vigilante|joker|haunt\w*)\b/i;

// Scoped to DEATH-ANNOUNCEMENT surfaces only. A living mafioso's own
// `mafia_targets`, the vigilante's own `night_action_done` ("bullet spent") and
// every client's own `game_started` role card legitimately carry role words —
// sweeping the whole inbox would false-positive on them.
const DEATH_SURFACES = new Set(["phase_change", "player_died", "you_died", "game_sync"]);

// Cause-bearing event types that must never survive projectEventsForClients().
const CAUSE_EVENT_TYPES = ["kill", "vigilante_shot", "joker_haunt"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameOf = (c: PlaytestClient) => c.lastOf("registered")!.username as string;
const uid = (ctx: ScenarioContext, idx: number) => ctx.clients[idx].userId!;

/** The exact NIGHT_DEATH_SINGLE pool (narrator.ts:221-226) for one victim. */
const neutralDawnLine = (name: string) =>
  new RegExp(
    `^(?:${esc(name)} did not see the morning\\.` +
    `|${esc(name)} did not live to see the dawn\\.` +
    `|${esc(name)} was gone before first light\\.` +
    `|The night took ${esc(name)}\\.)$`
  );

/** The exact DIED_IN_NIGHT_MESSAGES pool (narrator.ts:230-235) for one victim. */
const neutralDiedInNight = (name: string) =>
  new RegExp(
    `^(?:${esc(name)} did not see the morning\\.` +
    `|${esc(name)} did not live to see the dawn\\.` +
    `|${esc(name)} did not survive the night\\.` +
    `|The night took ${esc(name)}\\.)$`
  );

const dawn = (c: PlaytestClient) => c.lastOf("phase_change")!;
const dawnMessages = (c: PlaytestClient): string[] => (dawn(c).messages as string[]) ?? [];
const dawnEvents = (c: PlaytestClient): Array<Record<string, unknown>> =>
  (dawn(c).events as Array<Record<string, unknown>>) ?? [];

/**
 * The core assertion. For every LIVING client:
 *   (a) no death-announcement payload contains a cause term;
 *   (b) the dawn line naming the victim comes from the neutral pool;
 *   (c) the victim's dawn event is the neutral "death" type with no
 *       cause/source, and no cause-bearing event type appears anywhere.
 */
function assertLivingSeeNoCause(
  clients: PlaytestClient[],
  livingIdxs: number[],
  victimNames: string[],
): void {
  for (const i of livingIdxs) {
    const c = clients[i];
    // Sanity: this seat really is alive (never received you_died).
    expect(c.lastOf("you_died")).toBeUndefined();

    // (a) Nothing on any death surface names a cause.
    const surfaces = c.log.filter((m: WSMessage) => DEATH_SURFACES.has(m.type));
    expect(surfaces.length).toBeGreaterThan(0);
    const blob = JSON.stringify(surfaces);
    expect(blob).not.toMatch(CAUSE_TERMS);

    // (b) Exactly ONE dawn line mentions the night's victims, and it is drawn
    //     from the cause-neutral pool (single-victim scenarios only).
    if (victimNames.length === 1) {
      const [v] = victimNames;
      const lines = dawnMessages(c).filter((m) => m.includes(v));
      expect(lines.length).toBe(1);
      expect(lines[0]).toMatch(neutralDawnLine(v));
    }

    // (c) Wire-level event projection.
    const events = dawnEvents(c);
    for (const v of victimNames) {
      expect(events.some((e) => e.type === "death" && e.playerName === v)).toBe(true);
    }
    for (const e of events) {
      expect(CAUSE_EVENT_TYPES).not.toContain(e.type as string);
      expect("source" in e).toBe(false);
      expect("cause" in e).toBe(false);
    }
  }
}

/** The victim's own overlay copy is cause-neutral BY CONSTRUCTION. */
function assertVictimDeathMessageNeutral(victim: PlaytestClient, name: string): void {
  const died = victim.lastOf("you_died")!;
  expect(died).toBeDefined();
  expect(died.message as string).toMatch(neutralDiedInNight(name));
  expect(died.message as string).not.toMatch(CAUSE_TERMS);
  // No cause field rides alongside it (the wire has only `message`, plus
  // `isLoverDeath` on a heartbreak cascade — absent here).
  expect("cause" in died).toBe(false);
  expect("source" in died).toBe(false);
  expect("isLoverDeath" in died).toBe(false);
}

// ── Timeline helpers (each waits for its prompt before acting) ───────────────
async function mafiaKills(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  await ctx.clients[MAF].killAsMafia(uid(ctx, targetIdx));
}

async function doctorSaves(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const doc = ctx.clients[DOC];
  await doc.waitFor("doctor_targets", 8000);
  await doc.doctorSave(uid(ctx, targetIdx));
}

async function detectiveInvestigates(ctx: ScenarioContext, targetIdx: number): Promise<void> {
  const det = ctx.clients[DET];
  await det.waitFor("detective_targets", 8000);
  const done = det.waitFor("night_action_done", 8000);
  det.send({ type: "detective_investigate", targetId: uid(ctx, targetIdx) });
  await done;
}

/**
 * Vigilante shoots (or holds fire when null), then resolves once EVERY client
 * has received the dawn `phase_change`. Waiting on the admin alone would race:
 * runScenario closes the sockets as soon as the timeline returns, so a slower
 * peer's dawn frame can still be in flight and its log ends at the night
 * transition (which is exactly what this assertion set reads).
 */
async function vigilanteThenDawn(ctx: ScenarioContext, targetIdx: number | null): Promise<void> {
  const vig = ctx.clients[VIG];
  await vig.waitFor("vigilante_targets", 8000);
  const dayPs = ctx.clients.map((c) =>
    c.waitMatch((m) => m.type === "phase_change" && m.phase === "day", 14000, "phase_change(day)"),
  );
  await vig.vigilanteShoot(targetIdx === null ? null : uid(ctx, targetIdx));
  await Promise.all(dayPs);
}

describe("night deaths are cause-neutral to living clients", () => {
  test("1 — mafia night kill: no living client can tell HOW the victim died", async () => {
    const { clients } = await runScenario({
      roles: ROLES,
      settings: SETTINGS,
      autoNarratorReady: true,
      timeline: [
        // The doctor protects someone the mafia did NOT target, so no save
        // narration joins the dawn (keeps the death surface a clean read).
        async (ctx) => { await mafiaKills(ctx, CIT); },
        async (ctx) => { await doctorSaves(ctx, DET); },
        async (ctx) => { await detectiveInvestigates(ctx, MAF); },
        async (ctx) => { await vigilanteThenDawn(ctx, null); }, // hold fire
      ],
    });

    const victim = nameOf(clients[CIT]);
    expect(clients[ADMIN].allOf("player_died").map((m) => m.playerName)).toEqual([victim]);

    assertLivingSeeNoCause(clients, [ADMIN, MAF, DOC, DET, VIG], [victim]);
    // Scenario 3: the victim's own overlay copy.
    assertVictimDeathMessageNeutral(clients[CIT], victim);
  }, 60000);

  test("2 — vigilante night kill is indistinguishable from a mafia kill", async () => {
    const { clients } = await runScenario({
      roles: ROLES,
      settings: SETTINGS,
      autoNarratorReady: true,
      timeline: [
        // The doctor blocks the mafia kill, so the ONLY death tonight is the
        // vigilante's — the lone-death dawn line must read exactly as row 1's.
        async (ctx) => { await mafiaKills(ctx, CIT); },
        async (ctx) => { await doctorSaves(ctx, CIT); },
        async (ctx) => { await detectiveInvestigates(ctx, MAF); },
        async (ctx) => { await vigilanteThenDawn(ctx, DET); }, // shoot the detective
      ],
    });

    const victim = nameOf(clients[DET]);
    // Exactly one death, and it is the vigilante's.
    expect(clients[ADMIN].allOf("player_died").map((m) => m.playerName)).toEqual([victim]);
    expect(clients[CIT].lastOf("you_died")).toBeUndefined(); // mafia target was saved
    expect(clients[VIG].lastOf("night_action_done")!.message).toMatch(/spent/i);

    assertLivingSeeNoCause(clients, [ADMIN, MAF, DOC, VIG, CIT], [victim]);
    assertVictimDeathMessageNeutral(clients[DET], victim);

    // The strongest form of the fence: the vigilante's lone victim is announced
    // with the SAME pool row 1's mafia victim is — same shape, same wording set.
    const line = dawnMessages(clients[ADMIN]).find((m) => m.includes(victim))!;
    expect(line).toMatch(neutralDawnLine(victim));

    // The mafia-kill/doctor-save half of the night is likewise anonymous to the
    // living: the official save narration names nobody and no cause.
    expect(dawn(clients[ADMIN]).saved).toBe(true);
    expect(dawnMessages(clients[ADMIN]).join(" ")).not.toMatch(CAUSE_TERMS);
  }, 60000);

  test("3 — mafia + vigilante on the same night: both deaths read identically", async () => {
    const { clients } = await runScenario({
      roles: ROLES,
      settings: SETTINGS,
      autoNarratorReady: true,
      timeline: [
        async (ctx) => { await mafiaKills(ctx, CIT); },
        async (ctx) => { await doctorSaves(ctx, DOC); }, // self-save, misses both victims
        async (ctx) => { await detectiveInvestigates(ctx, MAF); },
        async (ctx) => { await vigilanteThenDawn(ctx, DET); },
      ],
    });

    const mafiaVictim = nameOf(clients[CIT]);
    const vigVictim = nameOf(clients[DET]);

    assertLivingSeeNoCause(clients, [ADMIN, MAF, DOC, VIG], [mafiaVictim, vigVictim]);

    // ONE combined dawn line names BOTH victims — a per-victim line would let
    // the count/order out which kill was whose.
    const combined = dawnMessages(clients[ADMIN]).filter(
      (m) => m.includes(mafiaVictim) || m.includes(vigVictim),
    );
    expect(combined.length).toBe(1);
    expect(combined[0]).toContain(mafiaVictim);
    expect(combined[0]).toContain(vigVictim);
    expect(combined[0]).not.toMatch(CAUSE_TERMS);

    // Both victims' private overlays are drawn from the same neutral pool, and
    // their player_died broadcasts are structurally identical (same key set) —
    // no field distinguishes the mafia kill from the vigilante shot.
    assertVictimDeathMessageNeutral(clients[CIT], mafiaVictim);
    assertVictimDeathMessageNeutral(clients[DET], vigVictim);
    const rows = clients[ADMIN].allOf("player_died");
    expect(rows.length).toBe(2);
    expect(Object.keys(rows[0]).sort()).toEqual(Object.keys(rows[1]).sort());
    for (const r of rows) expect(r.message as string).toMatch(neutralDiedInNight(r.playerName as string));

    // Dead spectators are EXEMPT by design (they watched the night live) — the
    // two victims' own inboxes are deliberately not asserted neutral here.
  }, 60000);
});
