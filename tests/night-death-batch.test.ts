// Cause-neutral dawn batch — engine-level pins.
//
// At dawn the WHOLE simultaneous night batch (mafia + vigilante + joker haunt
// + their lover cascades) must be announced as ONE cause-neutral line that
// names only WHO died, never HOW. A leak of mafia/vigilante/joker/heartbreak
// here re-outs the very role this fix hides. Hunter revenge is gated and
// post-dawn — it stays a DISTINCT later announcement, never folded in.
//
// Run ONLY this file:  bun test tests/night-death-batch.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  resolveNight, transitionToDay, advanceNightSubPhase,
  submitHunterRevenge, removeGame, projectEventsForClients,
} from "../src/game-engine";
import { makeGame, lockTarget, runNight } from "./helpers/engine-fixtures";
import type { Game, Player, Role, GameEvent } from "../src/types";

// Any of these words in the dawn death line would re-reveal the cause.
const FORBIDDEN = /vigilante|gunshot|bullet|joker|playing card|heartbreak|knife|wire|pistol|razor|shot|clean shot|mafia/i;

const liveGames: string[] = [];
afterEach(() => { for (const code of liveGames.splice(0)) removeGame(code); });

function game(roles: Role[], settings?: Parameters<typeof makeGame>[1], lovers?: [number, number]): Game {
  const g = makeGame(roles, settings, lovers);
  liveGames.push(g.code);
  return g;
}

function makeLovers(a: Player, b: Player): void {
  a.isLover = true; a.loverId = b.id;
  b.isLover = true; b.loverId = a.id;
}

/** Narrator lines that name any of `names` (the single combined batch line). */
function deathLines(messages: string[], names: string[]): string[] {
  return messages.filter((m) => names.some((n) => m.includes(n)));
}

describe("dawn night batch — one cause-neutral combined line", () => {
  test("mafia + vigilante same night → ONE line naming BOTH, no cause words", () => {
    const g = game(["mafia", "vigilante", "citizen", "citizen", "citizen", "citizen"]);
    const a = g.players.get(3)!, b = g.players.get(4)!;
    g.mafiaTarget = a.id;
    g.vigilanteTarget = b.id;

    const result = resolveNight(g);

    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain(a.username);
    expect(result.messages[0]).toContain(b.username);
    expect(result.messages[0]).not.toMatch(FORBIDDEN);
    // killed[] (drives triggers/events/UI) still carries both, source-tagged.
    expect(result.killed.map((k) => k.source).sort()).toEqual(["mafia", "vigilante"]);
  });

  test("mafia kills a lover → combined line for the direct victim, SEPARATE public heartbreak line for the partner", () => {
    const g = game(["mafia", "citizen", "citizen", "citizen", "citizen", "citizen"]);
    const target = g.players.get(3)!, partner = g.players.get(4)!;
    makeLovers(target, partner);
    g.mafiaTarget = target.id;

    const result = resolveNight(g);

    // Owner ruling: the combined line covers only the DIRECT victim (cause
    // stays ambiguous); the cascade partner gets a SEPARATE public "died of
    // heartbreak" line AFTER it.
    expect(result.messages.length).toBe(2);
    const line = result.messages[0];
    expect(line).toContain(target.username);
    expect(line).not.toContain(partner.username);
    expect(line).not.toMatch(FORBIDDEN);
    expect(line.toLowerCase()).not.toContain("heartbreak");
    const heartbreak = result.messages[1];
    expect(heartbreak).toContain(partner.username);
    expect(heartbreak).not.toContain(target.username); // never names the original lover
    expect(heartbreak.toLowerCase()).toContain("heartbreak");
    // killed[] integrity: direct death + lover cascade, in kill order.
    expect(result.killed.map((k) => k.cause)).toEqual(["direct", "lover_cascade"]);
    // The cascade victim's own line IS the heartbreak line (names only them).
    expect(result.killed[1].player.id).toBe(partner.id);
    expect(result.killed[1].message).not.toContain(target.username);
    expect(result.killed[1].message.toLowerCase()).toContain("heartbreak");
  });

  test("LEAK ANALYSIS: mafia + vigilante + joker haunt + a lover cascade → combined neutral line for the 3 directs, then ONE heartbreak line", () => {
    // The canonical leak-boundary scenario (spec): the combined line reveals
    // WHO died directly (a, b, c) but not by whose hand; the separate heartbreak
    // line reveals the bond (aLover↔a) but NOT which of the directs was mafia's
    // vs the vigilante's. That residual is acceptable and correct.
    const g = game(["mafia", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen"]);
    const a = g.players.get(3)!, aLover = g.players.get(4)!; // mafia victim + cascade
    const b = g.players.get(5)!;                              // vigilante victim
    const c = g.players.get(6)!;                              // joker haunt victim
    makeLovers(a, aLover);
    g.mafiaTarget = a.id;
    g.vigilanteTarget = b.id;
    g.jokerHauntTarget = c.id;

    const result = resolveNight(g);

    expect(result.messages.length).toBe(2);
    // Combined line: the three DIRECT victims, never the heartbroken partner.
    for (const n of [a.username, b.username, c.username]) {
      expect(result.messages[0]).toContain(n);
    }
    expect(result.messages[0]).not.toContain(aLover.username);
    expect(result.messages[0]).not.toMatch(FORBIDDEN);
    // Separate public heartbreak line: names only the heartbroken partner.
    expect(result.messages[1]).toContain(aLover.username);
    expect(result.messages[1].toLowerCase()).toContain("heartbreak");
    expect(result.messages[1]).not.toContain(b.username); // doesn't out which direct was mafia's
    expect(result.killed.length).toBe(4);
  });

  test("single mafia kill → ONE neutral line (a lone clean kill must not out the source)", () => {
    const g = game(["mafia", "citizen", "citizen", "citizen"]);
    const v = g.players.get(3)!;
    g.mafiaTarget = v.id;

    const result = resolveNight(g);

    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain(v.username);
    expect(result.messages[0]).not.toMatch(FORBIDDEN);
  });

  test("doctor save + one kill → exactly [save, combined], combined cause-neutral", () => {
    const g = game(["mafia", "doctor", "vigilante", "citizen", "citizen"], { enableDoctor: true, doctorMode: "house" });
    const saved = g.players.get(4)!, killed = g.players.get(5)!;
    g.mafiaTarget = saved.id;     // mafia targets the saved player
    g.doctorTarget = saved.id;    // doctor blocks the mafia kill
    g.vigilanteTarget = killed.id; // vigilante shot lands

    const result = resolveNight(g);

    expect(result.saved).toBe(true);
    expect(result.messages.length).toBe(2); // save line + ONE combined death line
    const combined = deathLines(result.messages, [killed.username]);
    expect(combined.length).toBe(1);
    expect(combined[0]).toContain(killed.username);
    expect(combined[0]).not.toMatch(FORBIDDEN); // the DEATH line is neutral
    expect(result.killed.length).toBe(1);
  });

  test("no deaths, no save → the lone noKill line (unchanged)", () => {
    const g = game(["mafia", "citizen", "citizen", "citizen"]);
    const v = g.players.get(3)!;
    v.isAlive = false;        // target already gone → kill lands on a corpse
    g.mafiaTarget = v.id;

    const result = resolveNight(g);

    expect(result.killed.length).toBe(0);
    expect(result.saved).toBe(false);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).not.toContain(v.username); // generic noKill, names no one
  });
});

// The DIRECT-death labels that must never survive projection (cause-ambiguous).
// "lover_death" is DELIBERATELY NOT here (owner ruling): heartbreak is public,
// so lover_death survives projection as its own distinct type.
const CAUSE_TYPES = new Set(["kill", "vigilante_shot", "joker_haunt"]);

describe("projectEventsForClients — the wire-facing cause neutralization", () => {
  test("the three DIRECT night-death types collapse to 'death'; lover_death survives distinctly", () => {
    // A single simultaneous night carrying all three direct labels (mafia kill,
    // vigilante shot, joker haunt) plus a lover cascade behind the mafia kill.
    // The server-side eventHistory keeps them distinct; the PROJECTION collapses
    // the DIRECT causes to "death" but keeps "lover_death" (public heartbreak).
    const g = game(["mafia", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen"]);
    const a = g.players.get(3)!, aLover = g.players.get(4)!; // mafia victim + cascade
    const b = g.players.get(5)!;                              // vigilante victim
    const c = g.players.get(6)!;                              // joker haunt victim
    makeLovers(a, aLover);
    g.mafiaTarget = a.id;
    g.vigilanteTarget = b.id;
    g.jokerHauntTarget = c.id;

    resolveNight(g);

    // Server-side history stays FULLY detailed (the end-of-game reveal source).
    const raw = g.eventHistory;
    expect(raw.some((e) => e.type === "kill")).toBe(true);
    expect(raw.some((e) => e.type === "vigilante_shot")).toBe(true);
    expect(raw.some((e) => e.type === "joker_haunt")).toBe(true);
    expect(raw.some((e) => e.type === "lover_death")).toBe(true);
    expect(raw.some((e) => e.source !== undefined)).toBe(true);

    const projected = projectEventsForClients(raw);
    // Same count/order, same names — only the DIRECT causes are erased.
    expect(projected.length).toBe(raw.length);
    expect(projected.map((e) => e.playerName)).toEqual(raw.map((e) => e.playerName));
    // lover_death survives; the three direct causes collapse to "death".
    expect(projected.some((e) => e.type === "lover_death")).toBe(true);
    for (const e of projected) {
      expect(CAUSE_TYPES.has(e.type)).toBe(false);           // no DIRECT cause-bearing type survives
      expect(e.type === "death" || e.type === "lover_death").toBe(true);
      expect((e as GameEvent).source).toBeUndefined();       // source stripped
      expect((e as GameEvent).cause).toBeUndefined();        // cause stripped
    }
  });

  test("public/day labels stay DISTINCT through projection; source/cause still stripped", () => {
    // A mixed history: a house-mode save + a day execution + hunter_revenge are
    // all PUBLIC knowledge, so their type must survive; only the additive
    // source/cause fields are shed.
    const raw: GameEvent[] = [
      { round: 1, type: "save", playerName: "S" },
      { round: 1, type: "kill", playerName: "K", cause: "direct", source: "mafia" },
      { round: 2, type: "execution", playerName: "E", cause: "direct", source: "execution" },
      { round: 2, type: "hunter_revenge", playerName: "H", cause: "direct", source: "hunter_revenge" },
      { round: 2, type: "spared", playerName: "P" },
    ];
    const projected = projectEventsForClients(raw);
    expect(projected.map((e) => e.type)).toEqual(["save", "death", "execution", "hunter_revenge", "spared"]);
    for (const e of projected) {
      expect((e as GameEvent).source).toBeUndefined();
      expect((e as GameEvent).cause).toBeUndefined();
    }
    // Purity: projection returns a fresh array; the input is untouched.
    expect(raw.some((e) => e.source !== undefined)).toBe(true);
  });
});

describe("hunter revenge stays a DISTINCT later announcement", () => {
  test("mafia night-kills the hunter → ONE neutral batch line; revenge is a separate later line", () => {
    const g = game(["mafia", "hunter", "citizen", "citizen", "citizen"], { enableHunter: true });
    const hunter = g.players.get(2)!, revengeTarget = g.players.get(3)!;

    const nightResult = runNight(g, hunter.id);

    // The night batch names the hunter exactly once, cause-neutral.
    const batch = deathLines(nightResult.messages, [hunter.username]);
    expect(batch.length).toBe(1);
    expect(batch[0]).not.toMatch(FORBIDDEN);

    // The dawn was DEFERRED: the revenge gate is open, not folded into the batch.
    expect(g.pendingRevenge).not.toBeNull();

    const revenge = submitHunterRevenge(g, hunter.id, revengeTarget.id);
    expect(revenge.ok).toBe(true);
    // Revenge is its own announcement set — distinct from the night batch line.
    expect(revenge.messages.length).toBeGreaterThan(0);
    expect(revenge.messages.join(" ")).toContain(revengeTarget.username);
    expect(revenge.messages).not.toContain(batch[0]);
  });
});
