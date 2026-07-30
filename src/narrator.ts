// The narrator's voice.
//
// The TEMPLATES no longer live here: they were extracted verbatim into
// public/i18n/en.json (keys `narr.*`) so the server and every client render from
// ONE source. This module is now the catalogue of narrator LINES — which key each
// game moment uses, and which params it carries.
//
// Two parallel APIs, both rendering the identical English string:
//   Narrator.x(...)     → string   — the historical API; used wherever only the
//                                    rendered text is needed (logs, tests).
//   NarratorMsg.x(...)  → MsgRef   — { text, key, params, seed }; the ADDITIVE
//                                    wire reference. `text` is the same English
//                                    string as before, so old clients and every
//                                    existing assertion are unaffected; `key`,
//                                    `params` and `seed` let a translated client
//                                    re-render the line in its own language.
//
// One `seed` per message drives EVERY random choice inside it, including the
// composite sub-pools (a doctor-save line's save method and location, an
// execution's style — see the sub-pool convention in public/i18n.js). Pool sizes
// may differ per language because the wire carries a seed, never an index.

import { msg, type MsgRef, type MsgParams } from "./i18n";

/**
 * Sort victim names for the combined dawn announcement. ALPHABETICAL on purpose:
 * the kill ORDER (targeted-first vs lover cascade) must not be inferable from the
 * line, so the resolution order is never presented.
 */
function sortNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Build a MsgRef for `key`. `seed` is only passed by determinism tests. */
function line(key: string, params?: MsgParams, seed?: number): MsgRef {
  return msg(key, params, seed);
}

export const NarratorMsg = {
  /**
   * The ONE cause-neutral dawn announcement for the entire simultaneous night
   * batch (mafia + vigilante + joker haunt + their lover cascades). Names only
   * WHO died, never HOW. Never called with 0 names (resolveNight guards it).
   *
   * The victim list rides as a sorted ARRAY, not a pre-joined string, so each
   * language applies its own list grammar ("A and B" / "A와 B"). The array order
   * is the sorted order — a renderer must never re-sort or reverse it.
   */
  nightDeaths(names: string[], seed?: number): MsgRef {
    const who = sortNames(names);
    if (who.length === 1) return line("narr.nightDeath.single", { name: who[0] }, seed);
    if (who.length === 2) return line("narr.nightDeath.two", { names: who }, seed);
    return line("narr.nightDeath.many", { names: who, count: who.length }, seed);
  },
  /** Neutral per-victim line for the victim's own you_died overlay / player_died. */
  diedInNight(name: string, seed?: number): MsgRef {
    return line("narr.diedInNight", { name }, seed);
  },
  doctorSave(name: string, seed?: number): MsgRef {
    return line("narr.doctorSave", { name }, seed);
  },
  /** Official mode: hints someone survived without naming who. */
  doctorSaveOfficial(seed?: number): MsgRef {
    return line("narr.doctorSaveOfficial", undefined, seed);
  },
  noKill(seed?: number): MsgRef {
    return line("narr.noKill", undefined, seed);
  },
  execution(name: string, seed?: number): MsgRef {
    return line("narr.execution", { name }, seed);
  },
  executionSpared(name: string, seed?: number): MsgRef {
    return line("narr.executionSpared", { name }, seed);
  },
  /**
   * Public "died of heartbreak" line. Names ONLY the heartbroken partner, never
   * the original lover — that name is already public from the announcement this
   * line follows, and repeating it here would pair them.
   */
  loverDeath(name: string, seed?: number): MsgRef {
    return line("narr.loverDeath", { name }, seed);
  },
  jokerWin(name: string, seed?: number): MsgRef {
    return line("narr.jokerWin", { name }, seed);
  },
  hunterReveal(name: string, seed?: number): MsgRef {
    return line("narr.hunterReveal", { name }, seed);
  },
  hunterRevengeKill(name: string, seed?: number): MsgRef {
    return line("narr.hunterRevengeKill", { name }, seed);
  },
  hunterDecline(seed?: number): MsgRef {
    return line("narr.hunterDecline", undefined, seed);
  },
  townWin(seed?: number): MsgRef {
    return line("narr.townWin", undefined, seed);
  },
  mafiaWin(seed?: number): MsgRef {
    return line("narr.mafiaWin", undefined, seed);
  },
  nightFalls(seed?: number): MsgRef {
    return line("narr.nightFalls", undefined, seed);
  },
  dayBreaks(seed?: number): MsgRef {
    return line("narr.dayBreaks", undefined, seed);
  },
  // ── Player-initiated accusations (text-only; no recorded audio) ──
  // Accusations are PUBLIC, so these lines name the accuser, accused and seconder.
  accusationMade(accuser: string, target: string, seed?: number): MsgRef {
    return line("narr.accusationMade", { accuser, target }, seed);
  },
  sleepProposed(accuser: string, seed?: number): MsgRef {
    return line("narr.sleepProposed", { accuser }, seed);
  },
  accusationSeconded(seconder: string, seed?: number): MsgRef {
    return line("narr.accusationSeconded", { seconder }, seed);
  },
  sleepSeconded(seconder: string, seed?: number): MsgRef {
    return line("narr.sleepSeconded", { seconder }, seed);
  },
  accusationWithdrawn(accuser: string, target: string, seed?: number): MsgRef {
    return line("narr.accusationWithdrawn", { accuser, target }, seed);
  },
  sleepWithdrawn(accuser: string, seed?: number): MsgRef {
    return line("narr.sleepWithdrawn", { accuser }, seed);
  },
  sleepPassed(seed?: number): MsgRef {
    return line("narr.sleepPassed", undefined, seed);
  },
  sleepFailed(seed?: number): MsgRef {
    return line("narr.sleepFailed", undefined, seed);
  },
  /** Admin declined to call a vote today. */
  abstain(seed?: number): MsgRef {
    return line("narr.abstain", undefined, seed);
  },
  /** Admin cancelled the live ballot. */
  voteCancelled(seed?: number): MsgRef {
    return line("narr.voteCancelled", undefined, seed);
  },
};

/**
 * The rendered-English narrator. Every method is the `.text` of its NarratorMsg
 * twin, so the two can never disagree.
 */
export const Narrator = {
  nightDeaths: (names: string[]): string => NarratorMsg.nightDeaths(names).text,
  diedInNight: (name: string): string => NarratorMsg.diedInNight(name).text,
  doctorSave: (name: string): string => NarratorMsg.doctorSave(name).text,
  doctorSaveOfficial: (): string => NarratorMsg.doctorSaveOfficial().text,
  noKill: (): string => NarratorMsg.noKill().text,
  execution: (name: string): string => NarratorMsg.execution(name).text,
  executionSpared: (name: string): string => NarratorMsg.executionSpared(name).text,
  loverDeath: (name: string): string => NarratorMsg.loverDeath(name).text,
  jokerWin: (name: string): string => NarratorMsg.jokerWin(name).text,
  hunterReveal: (name: string): string => NarratorMsg.hunterReveal(name).text,
  hunterRevengeKill: (name: string): string => NarratorMsg.hunterRevengeKill(name).text,
  hunterDecline: (): string => NarratorMsg.hunterDecline().text,
  townWin: (): string => NarratorMsg.townWin().text,
  mafiaWin: (): string => NarratorMsg.mafiaWin().text,
  nightFalls: (): string => NarratorMsg.nightFalls().text,
  dayBreaks: (): string => NarratorMsg.dayBreaks().text,
  accusationMade: (accuser: string, target: string): string => NarratorMsg.accusationMade(accuser, target).text,
  sleepProposed: (accuser: string): string => NarratorMsg.sleepProposed(accuser).text,
  accusationSeconded: (seconder: string): string => NarratorMsg.accusationSeconded(seconder).text,
  sleepSeconded: (seconder: string): string => NarratorMsg.sleepSeconded(seconder).text,
  accusationWithdrawn: (accuser: string, target: string): string => NarratorMsg.accusationWithdrawn(accuser, target).text,
  sleepWithdrawn: (accuser: string): string => NarratorMsg.sleepWithdrawn(accuser).text,
  sleepPassed: (): string => NarratorMsg.sleepPassed().text,
  sleepFailed: (): string => NarratorMsg.sleepFailed().text,
};
