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
import { readFileSync } from "fs";
import { join } from "path";
import { runScenario, type PlaytestClient, type ScenarioContext, type WSMessage } from "./harness.ts";
import type { Role } from "../../src/types.ts";
import { runtime as i18nRuntime } from "../../src/i18n.ts";

/** The shipped Korean bundle, so the fence covers translations, not just English. */
const KO_BUNDLE: Record<string, unknown> = (() => {
  const raw = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "..", "public", "i18n", "ko.json"), "utf8"),
  ) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("$")) out[k] = v;
  return out;
})();

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

// ── i18n extension of the fence ─────────────────────────────────────────────
// Death text now travels as an ADDITIVE { key, params, seed } reference beside
// the rendered English `text`. That reference is a NEW disclosure surface, and
// the invariant is that it may never reveal more than the English string did:
//
//   - a KEY NAME must not encode the cause ("narr.mafiaKill" would leak the
//     killer's faction to anyone reading the raw frame, even though the
//     rendered text stayed neutral);
//   - PARAMS must carry only the victim identities the line already names;
//   - and every TRANSLATION of the key must be cause-neutral too — a Korean
//     variant reading "마피아가 …" would leak exactly what the English pool is
//     carefully built to hide, and no English-only assertion would catch it.
const CAUSE_TERMS_KO =
  /(?:마피아|마피오소|자경단|광대|조커|사냥꾼|총알|총|칼|권총|칼날|찔러|찔렀|쏘았|쏘았다|쐈|목을\s*졸|교살|독살|독을)/;

/** Keys a LIVING client may legitimately receive on a death surface. */
const NEUTRAL_DEATH_KEYS = new Set([
  "narr.nightDeath.single",
  "narr.nightDeath.two",
  "narr.nightDeath.many",
  "narr.diedInNight",
]);

/** Param names a neutral death line may carry. Nothing else is allowed. */
const ALLOWED_DEATH_PARAMS = new Set(["name", "names", "count"]);

interface WireRef { text?: string; key?: string; params?: Record<string, unknown>; seed?: number }

/** Every message reference reachable from one wire frame. */
function refsIn(m: WSMessage): WireRef[] {
  const out: WireRef[] = [];
  const push = (r: unknown) => {
    if (r && typeof r === "object") out.push(r as WireRef);
  };
  push((m as Record<string, unknown>).messageRef);
  push((m as Record<string, unknown>).doctorMessageRef);
  for (const arr of ["messageRefs", "narratorHistoryRefs"]) {
    const v = (m as Record<string, unknown>)[arr];
    if (Array.isArray(v)) for (const r of v) push(r);
  }
  return out;
}

/**
 * For every LIVING client: no key name, param set or TRANSLATION on a death
 * surface may betray the cause. Skips cleanly (asserting nothing) on a server
 * that does not yet ship refs, so this stays a fence rather than a coupling.
 */
function assertLivingDeathRefsNeutral(
  clients: PlaytestClient[],
  livingIdxs: number[],
  victimNames: string[],
): void {
  const I18n = i18nRuntime as unknown as {
    setBundle(l: string, d: unknown): void;
    setLang(l: string): string;
    lang(): string;
    t(k: string, p?: unknown, s?: number): string;
    has(k: string): boolean;
  };
  // Load Korean so the fence covers the shipped translation, not just English.
  I18n.setBundle("ko", KO_BUNDLE);
  const previous = I18n.lang();
  // A fence that silently inspects nothing is worthless: count what we actually
  // checked and assert it was non-zero, so this can never rot into a no-op if
  // the wire stops shipping refs.
  let refsChecked = 0;
  let victimRefsChecked = 0;

  try {
    for (const i of livingIdxs) {
      const c = clients[i];
      const surfaces = c.log.filter((m: WSMessage) => DEATH_SURFACES.has(m.type));
      for (const m of surfaces) {
        for (const ref of refsIn(m)) {
          if (!ref.key) continue;
          refsChecked++;

          // A key NAME is itself readable in the raw frame.
          expect(ref.key, `key on ${m.type}`).not.toMatch(CAUSE_TERMS);

          const namesVictim = victimNames.some((v) =>
            JSON.stringify(ref.params ?? {}).includes(v) || (ref.text ?? "").includes(v),
          );
          if (namesVictim) {
            victimRefsChecked++;
            // The line that names tonight's victims must come from the neutral
            // pool — never a cause-specific key.
            expect(NEUTRAL_DEATH_KEYS.has(ref.key), `victim-naming key ${ref.key}`).toBe(true);
            for (const p of Object.keys(ref.params ?? {})) {
              expect(ALLOWED_DEATH_PARAMS.has(p), `param {${p}} on ${ref.key}`).toBe(true);
            }
          }

          // Params must not smuggle a cause in a value.
          expect(JSON.stringify(ref.params ?? {})).not.toMatch(CAUSE_TERMS);

          // English re-render must equal the shipped text: the ref may not say
          // anything the rendered string did not already say.
          if (I18n.has(ref.key) && typeof ref.text === "string") {
            I18n.setLang("en");
            expect(I18n.t(ref.key, ref.params ?? null, ref.seed)).toBe(ref.text);
          }

          // And the Korean rendering must be cause-neutral as well.
          if (I18n.has(ref.key)) {
            I18n.setLang("ko");
            const ko = I18n.t(ref.key, ref.params ?? null, ref.seed);
            expect(ko, `ko render of ${ref.key}`).not.toMatch(CAUSE_TERMS_KO);
            expect(ko, `ko render of ${ref.key}`).not.toMatch(CAUSE_TERMS);
          }
        }
      }
    }
  } finally {
    I18n.setLang(previous);
  }

  // Proof the fence did real work: living clients must have received refs, and
  // at least one of them must have named tonight's victim.
  expect(refsChecked, "no message refs were inspected — is the wire still shipping them?").toBeGreaterThan(0);
  expect(victimRefsChecked, "no victim-naming ref was inspected").toBeGreaterThan(0);
}

/**
 * Sweep EVERY Korean death-pool variant for cause terms, independent of which
 * variants a given scenario happened to roll. A seeded run only exercises one
 * variant per line, so without this a leaking variant could sit unnoticed.
 */
function assertKoreanDeathPoolsNeutral(): void {
  const bundle = KO_BUNDLE as Record<string, string | string[]>;
  const offenders: string[] = [];
  for (const key of NEUTRAL_DEATH_KEYS) {
    const value = bundle[key];
    if (value === undefined) continue;
    for (const variant of Array.isArray(value) ? value : [value]) {
      if (CAUSE_TERMS_KO.test(variant) || CAUSE_TERMS.test(variant)) offenders.push(`${key}: ${variant}`);
    }
  }
  // The default-mode anonymous save line must also stay anonymous in Korean.
  const official = bundle["narr.doctorSaveOfficial"];
  for (const variant of Array.isArray(official) ? official : official ? [official] : []) {
    if (CAUSE_TERMS_KO.test(variant)) offenders.push(`narr.doctorSaveOfficial: ${variant}`);
  }
  expect(offenders).toEqual([]);
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
    assertLivingDeathRefsNeutral(clients, [ADMIN, MAF, DOC, DET, VIG], [victim]);
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
    assertLivingDeathRefsNeutral(clients, [ADMIN, MAF, DOC, VIG, CIT], [victim]);
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
    assertLivingDeathRefsNeutral(clients, [ADMIN, MAF, DOC, VIG], [mafiaVictim, vigVictim]);

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

// ── Translation-level fence ────────────────────────────────────────────────
// Independent of any scripted night: sweep EVERY variant of every Korean death
// pool. A seeded run only rolls one variant per line, so a leaking variant would
// otherwise hide until it happened to be selected in production.
describe("Korean death copy is cause-neutral in every variant", () => {
  test("no shipped Korean death/anonymous-save variant names a cause", () => {
    assertKoreanDeathPoolsNeutral();
  });
});
