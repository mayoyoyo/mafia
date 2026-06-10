// B0d — structured logging + debug serialization (audit D2/D9).
//
// Every structured log is ONE JSON line on stdout whose stable tag is the
// "slog" key (value = event name). Logs go to console only — they must
// NEVER be written into WS message payloads (the golden message-sequence
// tests prove the wire stays untouched).

import type { Game } from "./types";

/** Emit one structured JSON log line to stdout: {"slog":<event>,...fields}. */
export function slog(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ slog: event, ...fields }));
}

/**
 * Phase-transition log (audit D2). INTERIM placement: called by hand at
 * every `game.phase = ...` transition site; B4 consolidates those sites
 * into a single transition helper (D1) and sweeps these calls into it.
 * `from` is passed explicitly so callers log BEFORE mutating game.phase.
 * Likewise `round` is the value BEFORE any transition mutations: lobby→night
 * logs round 0 (startGame bumps it after), and day→night logs the OLD round.
 */
export function logTransition(game: Game, from: string, to: string, reason: string): void {
  slog("phase_transition", { code: game.code, from, to, reason, round: game.round });
}

/**
 * JSON-safe snapshot of a Game for debugging/tests: Maps become arrays or
 * plain objects, no functions, no circular refs — JSON.stringify
 * round-trips losslessly. Not wired to any WS message.
 *
 * The `satisfies Record<keyof Game, unknown>` guard makes any future Game
 * field a compile error here until it is added to the snapshot (and rejects
 * keys that don't exist on Game).
 */
export function dumpGame(game: Game): Record<string, unknown> {
  return {
    code: game.code,
    adminId: game.adminId,
    createdAt: game.createdAt,
    phase: game.phase,
    round: game.round,
    settings: { ...game.settings },
    players: Array.from(game.players.values()).map((p) => ({ ...p })),
    mafiaVariant: game.mafiaVariant,
    mafiaVotes: Object.fromEntries(
      Array.from(game.mafiaVotes.entries()).map(([voterId, entries]) => [
        voterId,
        entries.map((e) => ({ ...e })),
      ]),
    ),
    mafiaTarget: game.mafiaTarget,
    doctorTarget: game.doctorTarget,
    detectiveTarget: game.detectiveTarget,
    lastDoctorTarget: game.lastDoctorTarget,
    jokerHauntTarget: game.jokerHauntTarget,
    jokerHauntVoters: [...game.jokerHauntVoters],
    jokerJointWinner: game.jokerJointWinner,
    voteTarget: game.voteTarget,
    votes: Object.fromEntries(game.votes),
    nightKill: game.nightKill,
    doctorSaved: game.doctorSaved,
    detectiveResult: game.detectiveResult ? { ...game.detectiveResult } : null,
    winner: game.winner,
    forceEnded: game.forceEnded,
    pendingMessages: [...game.pendingMessages],
    eventHistory: game.eventHistory.map((e) => ({ ...e })),
    dayStartedAt: game.dayStartedAt,
    dayVoteCount: game.dayVoteCount,
    narratorHistory: [...game.narratorHistory],
    detectiveHistory: game.detectiveHistory.map((e) => ({ ...e })),
    nightSubPhase: game.nightSubPhase,
    awaitingNarratorReady: game.awaitingNarratorReady,
  } satisfies Record<keyof Game, unknown>;
}
