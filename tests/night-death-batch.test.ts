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
  submitHunterRevenge, removeGame,
} from "../src/game-engine";
import { makeGame, lockTarget, runNight } from "./helpers/engine-fixtures";
import type { Game, Player, Role } from "../src/types";

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

  test("mafia kills a lover → ONE line names BOTH partners, no heartbreak / no order tell", () => {
    const g = game(["mafia", "citizen", "citizen", "citizen", "citizen", "citizen"]);
    const target = g.players.get(3)!, partner = g.players.get(4)!;
    makeLovers(target, partner);
    g.mafiaTarget = target.id;

    const result = resolveNight(g);

    expect(result.messages.length).toBe(1);
    const line = result.messages[0];
    expect(line).toContain(target.username);
    expect(line).toContain(partner.username);
    expect(line).not.toMatch(FORBIDDEN);
    expect(line.toLowerCase()).not.toContain("heartbreak");
    // killed[] integrity: direct death + lover cascade, in kill order.
    expect(result.killed.map((k) => k.cause)).toEqual(["direct", "lover_cascade"]);
    // The cascade victim's own line is neutral and does NOT name the original
    // target (no who-was-targeted tell on the victim-facing surface either).
    expect(result.killed[1].player.id).toBe(partner.id);
    expect(result.killed[1].message).not.toContain(target.username);
    expect(result.killed[1].message.toLowerCase()).not.toContain("heartbreak");
  });

  test("mafia + vigilante + joker haunt + a lover cascade → ONE line, all four names, no cause words", () => {
    const g = game(["mafia", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen", "citizen"]);
    const a = g.players.get(3)!, aLover = g.players.get(4)!; // mafia victim + cascade
    const b = g.players.get(5)!;                              // vigilante victim
    const c = g.players.get(6)!;                              // joker haunt victim
    makeLovers(a, aLover);
    g.mafiaTarget = a.id;
    g.vigilanteTarget = b.id;
    g.jokerHauntTarget = c.id;

    const result = resolveNight(g);

    expect(result.messages.length).toBe(1);
    for (const n of [a.username, aLover.username, b.username, c.username]) {
      expect(result.messages[0]).toContain(n);
    }
    expect(result.messages[0]).not.toMatch(FORBIDDEN);
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
