import type { Game, GameSettings, Player, Role, PlayerInfo, GameEvent, MafiaVoteType, MafiaVoteEntry, NightSubPhase, Death, DeathCause, DeathEventType, KillSource, ConcludeRoundOptions } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { Narrator } from "./narrator";
// B0d (audit D2): INTERIM per-site phase-transition logging — B4 (D1)
// consolidates the `game.phase = ...` sites into one transition helper and
// sweeps these logTransition calls into it.
// B2 (audit D4): slog carries invariant_violation lines; dumpGame is the
// JSON-safe field universe assertInvariants compares against.
import { logTransition, slog, dumpGame } from "./debug";

const games = new Map<string, Game>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(adminId: number, adminUsername: string, initialSettings?: Partial<GameSettings>): Game {
  let code: string;
  do {
    code = generateCode();
  } while (games.has(code));

  const admin: Player = {
    id: adminId,
    username: adminUsername,
    role: null,
    isAlive: true,
    isLover: false,
    loverId: null,
    isGodfather: false,
    connected: true,
    variant: 0,
    vigilanteBulletUsed: false,
  };

  const game: Game = {
    code,
    adminId,
    createdAt: Date.now(),
    phase: "lobby",
    round: 0,
    mafiaVariant: 0,
    settings: { ...DEFAULT_SETTINGS, ...(initialSettings || {}) },
    players: new Map([[adminId, admin]]),
    mafiaVotes: new Map(),
    mafiaTarget: null,
    doctorTarget: null,
    detectiveTarget: null,
    vigilanteTarget: null,
    lastDoctorTarget: null,
    jokerHauntTarget: null,
    jokerHauntVoters: [],
    jokerJointWinner: false,
    voteTarget: null,
    votes: new Map(),
    nightKill: null,
    doctorSaved: false,
    detectiveResult: null,
    winner: null,
    forceEnded: false,
    pendingMessages: [],
    eventHistory: [],
    dayStartedAt: null,
    dayVoteCount: 0,
    narratorHistory: [],
    detectiveHistory: [],
    nightSubPhase: null,
    awaitingNarratorReady: false,
    pendingRevenge: null,
  };

  games.set(code, game);
  return game;
}

// ── P1 reset seam: ONE field table, two reset scopes ────────────────────────
//
// Every mutable Game field is classified in EXACTLY ONE of:
//   NIGHT_RESETS      — per-night scope: cleared by resetNightActions() at
//                       every night/vote boundary (all seven former lists);
//   GAME_RESETS       — whole-game scope: additionally cleared by
//                       resetGameState() when returning to the lobby;
//   PERSISTENT_FIELDS — never bulk-reset (each entry says why).
//
// Structural rule (audit P1): a new Game field gets ONE line in one of these
// tables — no other reset list may exist. The compile-time guards below make
// an unclassified (or doubly-classified) field a type error; the field-scope
// coverage test in tests/reset-seam.test.ts enforces the same at runtime via
// dumpGame's key universe.
//
// Two deliberate carve-outs (the entire subtlety — see audit §1.3 P1):
//   1. transitionToDay assigns lastDoctorTarget = doctorTarget BEFORE calling
//      resetNightActions (the doctor may not repeat tonight's save tomorrow);
//      forceDawn deliberately does NOT capture it (the night never resolved).
//   2. The official-joker execution passes { preserveHauntVoters: true } so
//      the voters captured in resolveVote survive into the haunt night.

const NIGHT_RESETS = {
  mafiaVotes: (g: Game) => { g.mafiaVotes.clear(); },
  mafiaTarget: (g: Game) => { g.mafiaTarget = null; },
  doctorTarget: (g: Game) => { g.doctorTarget = null; },
  detectiveTarget: (g: Game) => { g.detectiveTarget = null; },
  vigilanteTarget: (g: Game) => { g.vigilanteTarget = null; },
  jokerHauntTarget: (g: Game) => { g.jokerHauntTarget = null; },
  jokerHauntVoters: (g: Game) => { g.jokerHauntVoters = []; },
  nightSubPhase: (g: Game) => { g.nightSubPhase = null; },
  voteTarget: (g: Game) => { g.voteTarget = null; },
  votes: (g: Game) => { g.votes.clear(); },
  awaitingNarratorReady: (g: Game) => { g.awaitingNarratorReady = false; },
  // B4a/C2a: the revenge gate clears at every forced transition
  // (HUNTER-DESIGN §6 L2 row) — per-night scope reaches all of them
  // (forceDawn/endDay/cancelVote via resetNightActions, lobby resets via
  // resetGameState; forceEndGame clears by hand like awaitingNarratorReady).
  // Opened ONLY by concludeRound's trigger-queue consume (C2a). Resets by
  // REASSIGNMENT — no fresh-copy line needed in nightRestingSnapshot's
  // shield (see the FUTURE-BINDING note there).
  // SEQUENCING TRAP (implemented — keep it this way): notifyDeathTriggers
  // fires inside applyDeath, which runs BEFORE the caller's
  // resetNightActions in all three flows (transitionToDay, both resolveVote
  // execution branches) — a gate opened at trigger time is WIPED by this
  // very line before concludeRound's gate check runs. That is why the
  // trigger queues OUTSIDE the Game (queuedHunterTrigger, observe-and-queue)
  // and the gate opens in concludeRound, past the reset boundary
  // (regression pinned in tests/hunter-engine.test.ts).
  pendingRevenge: (g: Game) => { g.pendingRevenge = null; },
} as const;

const GAME_RESETS = {
  phase: (g: Game) => { g.phase = "lobby"; },
  round: (g: Game) => { g.round = 0; },
  players: (g: Game) => {
    for (const [, player] of g.players) {
      player.role = null;
      player.isAlive = true;
      player.isLover = false;
      player.loverId = null;
      player.variant = 0;
      player.isGodfather = false;
      // CRITICAL (same reset-leak class as isGodfather): a spent bullet must
      // not survive a Play Again — without this a previous vigilante's flag
      // would leak onto whoever holds the seat in the next game.
      player.vigilanteBulletUsed = false;
    }
  },
  lastDoctorTarget: (g: Game) => { g.lastDoctorTarget = null; },
  jokerJointWinner: (g: Game) => { g.jokerJointWinner = false; },
  nightKill: (g: Game) => { g.nightKill = null; },
  doctorSaved: (g: Game) => { g.doctorSaved = false; },
  detectiveResult: (g: Game) => { g.detectiveResult = null; },
  winner: (g: Game) => { g.winner = null; },
  forceEnded: (g: Game) => { g.forceEnded = false; },
  pendingMessages: (g: Game) => { g.pendingMessages = []; },
  eventHistory: (g: Game) => { g.eventHistory = []; },
  dayStartedAt: (g: Game) => { g.dayStartedAt = null; },
  dayVoteCount: (g: Game) => { g.dayVoteCount = 0; },
  narratorHistory: (g: Game) => { g.narratorHistory = []; },
  detectiveHistory: (g: Game) => { g.detectiveHistory = []; },
} as const;

const PERSISTENT_FIELDS = [
  "code",        // room identity
  "adminId",     // room identity
  "createdAt",   // refreshed explicitly by restartGame, kept by returnToLobby
  "settings",    // deliberately kept across games
  "mafiaVariant", // overwritten by assignRoles on every deal
] as const satisfies readonly (keyof Game)[];

// Exported for the field-scope coverage test (tests/reset-seam.test.ts).
export const NIGHT_RESET_FIELDS = Object.keys(NIGHT_RESETS) as (keyof typeof NIGHT_RESETS)[];
export const GAME_RESET_FIELDS = Object.keys(GAME_RESETS) as (keyof typeof GAME_RESETS)[];
export const PERSISTENT_GAME_FIELDS: readonly (keyof Game)[] = PERSISTENT_FIELDS;

// Compile-time guards: every Game key classified in exactly one scope.
type _ClassifiedKey = keyof typeof NIGHT_RESETS | keyof typeof GAME_RESETS | (typeof PERSISTENT_FIELDS)[number];
// compile error here means a Game field is missing from all three reset scopes
const _everyGameFieldClassified: Exclude<keyof Game, _ClassifiedKey> extends never ? true : false = true;
void _everyGameFieldClassified;
// compile error here means a classified key does not exist on Game
const _noPhantomFields: Exclude<_ClassifiedKey, keyof Game> extends never ? true : false = true;
void _noPhantomFields;
// compile error here means a Game field appears in more than one scope
type _ScopeOverlap =
  | (keyof typeof NIGHT_RESETS & keyof typeof GAME_RESETS)
  | (keyof typeof NIGHT_RESETS & (typeof PERSISTENT_FIELDS)[number])
  | (keyof typeof GAME_RESETS & (typeof PERSISTENT_FIELDS)[number]);
const _scopesDisjoint: _ScopeOverlap extends never ? true : false = true;
void _scopesDisjoint;

export interface ResetNightOptions {
  /** Official-joker carve-out: keep the captured voters for the haunt night. */
  preserveHauntVoters?: boolean;
}

/** Clear every per-night field (night actions + day-vote state) from the table. */
export function resetNightActions(game: Game, opts: ResetNightOptions = {}): void {
  for (const key of NIGHT_RESET_FIELDS) {
    if (key === "jokerHauntVoters" && opts.preserveHauntVoters) continue;
    NIGHT_RESETS[key](game);
  }
}

/**
 * Enter the night phase: transition log + phase/round/sub-phase bookkeeping +
 * per-night reset. Returns the narrator's night-falls line for the caller to
 * place in its message flow. Used by startGame, endDay, and both resolveVote
 * auto-night paths.
 */
export function beginNight(game: Game, reason: string, opts: ResetNightOptions = {}): string {
  logTransition(game, game.phase, "night", reason);
  game.phase = "night";
  game.round++;
  resetNightActions(game, opts);
  game.nightSubPhase = "mafia";
  return Narrator.nightFalls();
}

/**
 * Whole-game reset back to the lobby (per-night scope + whole-game scope).
 * Replaces the formerly byte-duplicated returnToLobby/restartGame blocks.
 * B4b (engine symmetry with beginNight): the →lobby transition log lives
 * HERE — callers pass their reason instead of logging by hand. The log
 * fires before any reset, so from/round are the pre-reset values, exactly
 * as the callers' own logTransition lines were placed.
 */
export function resetGameState(game: Game, reason: string): void {
  logTransition(game, game.phase, "lobby", reason);
  // C2a: a queued-but-unconsumed Hunter trigger (only possible behind a
  // house-joker instant win, which already discards at the win site — this
  // is defense in depth) must never survive into a restarted/next game.
  // D2: slog'd only when an entry or open gate actually existed — the
  // routine lobby reset stays silent.
  if (queuedHunterTrigger.has(game) || game.pendingRevenge) {
    slog("hunter_gate", {
      code: game.code, event: "discarded",
      hunterId: queuedHunterTrigger.get(game) ?? game.pendingRevenge!.hunterId,
      phase: game.phase, round: game.round,
    });
  }
  queuedHunterTrigger.delete(game);
  resetNightActions(game);
  for (const key of GAME_RESET_FIELDS) {
    GAME_RESETS[key](game);
  }
}

// ── B2 (audit D4): invariant assertions at the server choke points ──────────
//
// assertInvariants(game, ctx) is called by server.ts at the two instrumented
// choke points: handleMessage entry and the armNightTimer fired callback.
// Both call sites see SETTLED state (before any handler/timer work runs), so
// every check below is against a guarantee the code makes between messages.
//
// Mode (resolved once at import):
//   "throw" — test runs. `bun test` sets NODE_ENV=test (verified), and the
//             WS suites spawn servers with { ...process.env }, so the whole
//             suite — in-process AND spawned — fails loudly on a violation.
//   "log"   — production. One slog("invariant_violation") line, processing
//             continues: a thrown assert would change failure modes for the
//             M1/M3/M10-class admin messages (audit D4 risk note), and an
//             over-strict invariant must produce log noise, not breakage.

export type InvariantMode = "throw" | "log";

let invariantMode: InvariantMode = process.env.NODE_ENV === "test" ? "throw" : "log";

/** Test seam: force a mode; returns the previous mode so callers restore it. */
export function setInvariantMode(mode: InvariantMode): InvariantMode {
  const previous = invariantMode;
  invariantMode = mode;
  return previous;
}

export interface InvariantContext {
  /** Choke-point label for the log line, e.g. "ws_in:cast_vote" or "timer_fire:resolve". */
  at: string;
  /**
   * Whether this game's (single, tracked) night-timer slot is occupied. The
   * timer map lives in server.ts, so the caller passes it in; engine-level
   * callers omit it and the timer invariant is skipped.
   */
  hasPendingNightTimer?: boolean;
}

/**
 * The night-scope "resting" snapshot: what every NIGHT_RESETS field looks
 * like immediately after resetNightActions. Computed by actually running the
 * reset table on a shield copy of the game, so the expected values share a
 * single source of truth with the resets themselves — no second hand-written
 * field/value list. The shield swaps in fresh Maps for the two fields whose
 * reset fns mutate in place (.clear()); every other table entry reassigns,
 * so the live game is never touched.
 *
 * FUTURE-BINDING: any new NIGHT_RESETS entry whose reset fn mutates IN PLACE
 * (.clear(), .length = 0, splice, delete-key, ...) MUST get a fresh-copy line
 * in this shield. Miss it and the reset fn reaches THROUGH the shallow spread
 * into the live game at every choke point — and in prod log-mode the check
 * silently scrubs the live field on every message, masking the very bug it
 * exists to catch. The non-perturbation test in tests/invariants.test.ts
 * (byte-identical dumpGame before/after assertInvariants) is the tripwire.
 */
function nightRestingSnapshot(game: Game): Record<string, unknown> {
  const shield: Game = { ...game, mafiaVotes: new Map(), votes: new Map() };
  resetNightActions(shield);
  return dumpGame(shield);
}

/**
 * Check every stateable invariant (audit D4) against a settled Game; returns
 * the violation list. On violations: always slog("invariant_violation"), and
 * additionally throw in "throw" mode (tests).
 */
export function assertInvariants(game: Game, ctx: InvariantContext): string[] {
  const violations: string[] = [];
  const snapshot = dumpGame(game);

  // Invariant: outside night, every per-night field — the list is DERIVED
  // from B1's NIGHT_RESETS classification, never restated — sits at its
  // post-reset value. Phase allowances, each matching a positive guarantee
  // pinned in tests:
  //   voting    — voteTarget/votes ARE the live ballot (callVote/castVote),
  //               and pendingRevenge may hold the vote-path revenge gate
  //               (C2a; its shape is checked by the §4 invariant below);
  //               jokerHauntVoters survive a gated official-joker lynch
  //               ONLY while the gate's resume preserves them (C2b);
  //   game_over — jokerHauntVoters stay populated ONLY when the official-
  //               joker execution itself ends the game: that branch is the
  //               sole writer of jokerHauntVoters AND sets jokerJointWinner
  //               in the same block, and every other route to game_over
  //               passes a no-preserve reset boundary first (narrowed from
  //               an unconditional game_over allowance in B4a; pinned in
  //               tests/reset-seam.test.ts + tests/invariants.test.ts);
  //             — a force-ended game (forceEndGame) freezes ALL in-flight
  //               night/vote state where it stood: its only night-scope
  //               guarantees are awaitingNarratorReady=false (the L2 fix)
  //               and pendingRevenge=null (both cleared by hand there), so
  //               those are the only fields still checked when forceEnded.
  if (game.phase !== "night") {
    const resting = nightRestingSnapshot(game);
    const skip = new Set<keyof Game>();
    if (game.phase === "voting") {
      skip.add("voteTarget");
      skip.add("votes");
      skip.add("pendingRevenge"); // C2a: vote-path gate legitimately holds at "voting" (§4 check below)
      // C2b (E4 variant): an official-joker lynch whose lover cascade killed
      // the Hunter defers its haunt night behind the gate — the captured
      // FOR-voters legitimately survive at "voting" exactly when the deferred
      // epilogue says to preserve them. Positive guarantee: the sole writer
      // of jokerHauntVoters (resolveVote's official branch) pairs its
      // preserving reset with the same flag on the concludeRound options the
      // gate stores as `resume` (pinned in tests/hunter-edge-matrix.test.ts).
      if (game.pendingRevenge?.resume.preserveHauntVoters) skip.add("jokerHauntVoters");
    }
    if (game.phase === "game_over") {
      if (game.jokerJointWinner) skip.add("jokerHauntVoters");
      if (game.forceEnded) {
        for (const field of NIGHT_RESET_FIELDS) {
          if (field !== "awaitingNarratorReady" && field !== "pendingRevenge") skip.add(field);
        }
      }
    }
    for (const field of NIGHT_RESET_FIELDS) {
      if (skip.has(field)) continue;
      if (JSON.stringify(snapshot[field]) !== JSON.stringify(resting[field])) {
        violations.push(`night_scope_dirty:${field}`);
      }
    }
  }

  // Invariant (L3 class): winner is well-defined at game_over — consumers
  // (buildGameSync, the end_game broadcast) dereference it with `!`.
  if (game.phase === "game_over" && game.winner === null) {
    violations.push("winner_null_at_game_over");
  }

  // Invariant (C2a, HUNTER-DESIGN §4): the revenge gate is phase-scoped.
  // Non-null ⇒ phase ∈ {night, voting} with the ballot already cleared (the
  // caller's reset runs BEFORE the gate opens) and no winner (the gate
  // defers the win check — a winner alongside an open gate means the check
  // leaked past it). Null at lobby/day/game_over is additionally enforced
  // by the night-scope table above (pendingRevenge is NIGHT_RESETS-scoped
  // and none of those phases skip it).
  if (game.pendingRevenge !== null) {
    if (game.phase !== "night" && game.phase !== "voting") {
      violations.push(`pending_revenge_phase:${game.phase}`);
    }
    if (game.votes.size > 0) violations.push("pending_revenge_votes_nonempty");
    if (game.voteTarget !== null) violations.push("pending_revenge_vote_target_set");
    if (game.winner !== null) violations.push("pending_revenge_winner_set");
  }

  // Invariant (M2 class): the TRACKED night-timer slot is empty outside
  // night — every transition out of night calls clearNightTimer. Honest
  // scope: armNightTimer's set-over-a-live-timer never cancels the displaced
  // timeout (pre-existing quirk, B4's concern), and a displaced timer is
  // invisible to the map — absence of UNTRACKED timers is not guaranteed
  // anywhere, so it is deliberately not asserted here.
  if (ctx.hasPendingNightTimer && game.phase !== "night") {
    violations.push(`pending_night_timer_outside_night:${game.phase}`);
  }

  if (violations.length > 0) {
    // Compact summary: the night-scope fields the invariants are about plus
    // phase/winner bookkeeping — full dumpGame (players, histories) is too
    // big for one log line.
    const nightState: Record<string, unknown> = {};
    for (const field of NIGHT_RESET_FIELDS) nightState[field] = snapshot[field];
    slog("invariant_violation", {
      code: game.code,
      at: ctx.at,
      violations,
      phase: game.phase,
      round: game.round,
      winner: game.winner,
      forceEnded: game.forceEnded,
      night: nightState,
    });
    if (invariantMode === "throw") {
      throw new Error(`Invariant violation [${game.code}] at ${ctx.at}: ${violations.join(", ")}`);
    }
  }
  return violations;
}

// ── B4b (audit D1): legal-edge table for the server's phase_change builds ──
//
// One row per from-phase; the sets are the `to` phases a phase_change
// broadcast site can legitimately produce TODAY (derived from the 12 sites
// broadcastPhaseChange in src/server.ts replaced — this documents reality,
// it does not arbitrate it). Two non-edges are structural, not omissions:
// "voting" is never a broadcast `to` (the wire enters voting via
// vote_called) and neither is "lobby" (lobby re-entry is a lobby_update).
const LEGAL_PHASE_EDGES: Record<Game["phase"], ReadonlySet<Game["phase"]>> = {
  lobby: new Set([
    "night",     // start_game (and restart_game from a lobby — fails <3 players, else dealt+night)
    "game_over", // end_game has NO lobby guard: an admin end_game in lobby force-ends (odd-but-real)
  ]),
  night: new Set([
    "day",       // force_dawn; night resolution (resolveNightAndTransition)
    "night",     // restart_game mid-night — no phase guard (M2's enabler, audit D1)
    "game_over", // night resolution hits a win; admin leaves; end_game
  ]),
  day: new Set([
    "day",       // abstain_vote: the admin abstains and the day re-announces itself (self-edge)
    "night",     // end_day; restart_game from day
    "game_over", // admin leaves; end_game
  ]),
  voting: new Set([
    "day",       // cancel_vote; spared vote (strictly->50% rule fails)
    "night",     // execution auto-night; restart_game mid-vote
    "game_over", // vote resolution hits a win; admin leaves; end_game
  ]),
  game_over: new Set([
    "night",     // restart_game
  ]),
};

/**
 * B4b (audit D1): assert a phase_change broadcast rides a legal edge.
 * Backs broadcastPhaseChange (src/server.ts) — the ONE phase_change assembly
 * point. Rides B2's invariant mode (one mode system, audit D4 risk note):
 * throw under bun test, log-and-continue in production — a thrown assert
 * would change failure modes for M1/M3/M10-class admin messages. The slog
 * line reuses the "invariant_violation" event so violation monitoring stays
 * a single channel.
 */
export function assertPhaseEdge(game: Game, from: Game["phase"], to: Game["phase"]): void {
  if (LEGAL_PHASE_EDGES[from].has(to)) return;
  slog("invariant_violation", {
    code: game.code,
    at: "phase_change_broadcast",
    violations: [`illegal_phase_edge:${from}->${to}`],
    phase: game.phase,
    round: game.round,
  });
  if (invariantMode === "throw") {
    throw new Error(`Illegal phase edge [${game.code}] illegal_phase_edge:${from}->${to}`);
  }
}

export function getGame(code: string): Game | undefined {
  return games.get(code);
}

export function removeGame(code: string): void {
  games.delete(code);
}

export function getAllGames(): Map<string, Game> {
  return games;
}

export function addPlayer(game: Game, userId: number, username: string): Player | null {
  if (game.phase !== "lobby") return null;
  if (game.players.size >= 20) return null;
  if (game.players.has(userId)) {
    const p = game.players.get(userId)!;
    p.connected = true;
    return p;
  }

  const player: Player = {
    id: userId,
    username,
    role: null,
    isAlive: true,
    isLover: false,
    loverId: null,
    isGodfather: false,
    connected: true,
    variant: 0,
    vigilanteBulletUsed: false,
  };

  game.players.set(userId, player);
  return player;
}

export function rejoinPlayer(game: Game, userId: number): Player | null {
  const player = game.players.get(userId);
  if (!player) return null;
  player.connected = true;
  return player;
}

export function removePlayer(game: Game, userId: number): void {
  game.players.delete(userId);
}

export function updateSettings(game: Game, settings: Partial<GameSettings>): void {
  Object.assign(game.settings, settings);
}

// Keys handled by sanitizeSettings, grouped by validation strategy.
const boolKeys = ["enableDoctor", "enableDetective", "enableJoker", "enableHunter", "enableVigilante", "enableLovers", "enableGodfather", "soundEnabled"] as const;
const modeKeys = ["doctorMode", "jokerMode"] as const;

// Compile-time exhaustiveness guard: if a key is added to GameSettings in
// types.ts but not handled in sanitizeSettings, the assignment below becomes
// a type error (true is not assignable to false).
type _Covered = "mafiaCount" | (typeof boolKeys)[number] | (typeof modeKeys)[number] | "narrationAccent" | "narratorGender";
// compile error here means a GameSettings key is missing from sanitizeSettings
const _exhaustive: Exclude<keyof GameSettings, _Covered> extends never ? true : false = true;
void _exhaustive;

/**
 * Whitelist + coerce untrusted settings input (M6). Unknown keys are dropped;
 * invalid values are dropped so callers fall back to existing/default values.
 * Used for both client update_settings payloads and persisted last_settings_json.
 */
export function sanitizeSettings(input: unknown): Partial<GameSettings> {
  const out: Partial<GameSettings> = {};
  if (typeof input !== "object" || input === null) return out;
  const raw = input as Record<string, unknown>;

  // mafiaCount: positive integer, clamped to 1-6 (matches lobby UI range)
  const mafiaCount = Number(raw.mafiaCount);
  if (Number.isFinite(mafiaCount)) {
    out.mafiaCount = Math.min(6, Math.max(1, Math.floor(mafiaCount)));
  }

  // Booleans: accept real booleans only
  for (const key of boolKeys) {
    const v = raw[key];
    if (typeof v === "boolean") out[key] = v;
  }

  // Rule modes: must be a known mode string
  for (const key of modeKeys) {
    const v = raw[key];
    if (v === "official" || v === "house") out[key] = v;
  }

  // Narration accent: accents are data-driven (narration.json), so validate
  // shape only — non-empty short string
  const accent = raw.narrationAccent;
  if (typeof accent === "string" && accent.length > 0 && accent.length <= 32) {
    out.narrationAccent = accent;
  }

  // Narrator gender: must be one of the two known values
  const gender = raw.narratorGender;
  if (gender === "male" || gender === "female") {
    out.narratorGender = gender;
  }

  return out;
}

export function getPlayerInfo(game: Game, includeRoles = false): PlayerInfo[] {
  return Array.from(game.players.values()).map((p) => ({
    id: p.id,
    username: p.username,
    isAlive: p.isAlive,
    isAdmin: p.id === game.adminId,
    ...(includeRoles ? { role: p.role ?? undefined, isLover: p.isLover, loverId: p.loverId ?? undefined, isGodfather: p.isGodfather } : {}),
  }));
}

// ── B5 (audit P6-lite): the two pure payload projections ────────────────
//
// Placement note: both live here (not a new module, not server.ts) because
// the engine itself needs toTargetInfo (getJokerHauntTargets) and the
// import direction only flows server → engine.

/**
 * The alive-target list entry — one projection for the literal that was
 * rebuilt inline 8x in server.ts (mafia/doctor/detective prompts, the
 * game_sync night reconstructions, the spectator mafia view) + 1x here.
 *
 * isAlive is HARDCODED true, deliberately: every call site filters to
 * alive players before mapping, and all nine literals pinned
 * `isAlive: true` rather than reading player.isAlive. Preserved as-is.
 */
export function toTargetInfo(player: Player, game: Game): PlayerInfo {
  return {
    id: player.id,
    username: player.username,
    isAlive: true,
    isAdmin: player.id === game.adminId,
  };
}

/**
 * The shared core of the four game_over emitters (audit R11 — L1/L3 drift
 * class): buildGameSync's gameOver branch, the vote-path and night-path
 * live broadcasts, and end_game. Covers SHARED fields only:
 *
 *   - `message` is an explicit param — the sites diverge on it BY DESIGN
 *     ("Citizens win!" canonical line in the sync reconstruction vs the
 *     narrator's last message in the live broadcasts; goldens pin both).
 *   - `forceEnded` stays per-site (sync always carries the boolean;
 *     end_game hardcodes true; the live win broadcasts omit it).
 *   - Three sites do NOT use this projection, in two classes:
 *       (a) lobby-leave and the 2-hour sweep force winner "town" on a game
 *           that may never have concluded (game.winner null in lobby and
 *           mid-game; the sweep can even reap a finished game whose winner
 *           is "joker"/"mafia") — the projection's game.winner read is
 *           unusable there, and the guard below would throw on the null
 *           cases.
 *       (b) active-leave's only divergence is the jokerJointWinner
 *           omission: forceEndGame has already set winner "town" at that
 *           site, so the projection's winner would be wire-identical — kept
 *           hand-assembled to pin the omission of jokerJointWinner, which
 *           official-joker mode can set mid-game.
 *     All three are pinned divergences, hand-assembled at their sites.
 */
export function projectGameOver(
  game: Game,
  message: string,
): { winner: "town" | "mafia" | "joker"; message: string; players: PlayerInfo[]; jokerJointWinner?: boolean } {
  if (game.winner === null) {
    throw new Error(
      `projectGameOver called on game ${game.code} with no winner set — ` +
      `unconcluded games must hand-assemble their game_over payload (see docstring class (a))`
    );
  }
  return {
    winner: game.winner,
    message,
    players: getPlayerInfo(game, true),
    ...(game.jokerJointWinner ? { jokerJointWinner: true } : {}),
  };
}

export function getAlivePlayers(game: Game): Player[] {
  return Array.from(game.players.values()).filter((p) => p.isAlive);
}

export function getAliveByRole(game: Game, role: Role): Player[] {
  return getAlivePlayers(game).filter((p) => p.role === role);
}

// ── Test-only fixed-deal seam (audit D6, pulled forward per P9) ─────────────
// When a FixedDeal is active, assignRoles() deals roles to players in JOIN
// ORDER from deal.roles, pins the mafia art variant to 0, and pairs lovers
// only as deal.lovers specifies (join-order indices). It is activated either
// by setFixedDeal() (in-process engine tests) or the MAFIA_FIXED_DEAL env var
// (JSON-encoded FixedDeal — for tests that spawn the server as a subprocess).
// Production never sets either, so the random path in assignRoles below runs
// unchanged when the seam is unused.
export interface FixedDeal {
  roles: Role[];             // role for the i-th player in join order
  lovers?: [number, number]; // join-order indices of the lover pair
  godfather?: number;        // join-order index of the mafioso to flag as Godfather
}

let fixedDeal: FixedDeal | null = process.env.MAFIA_FIXED_DEAL
  ? (JSON.parse(process.env.MAFIA_FIXED_DEAL) as FixedDeal)
  : null;

export function setFixedDeal(deal: FixedDeal | null): void {
  fixedDeal = deal;
}

function assignFixedRoles(game: Game, deal: FixedDeal): number {
  const playerIds = Array.from(game.players.keys()); // join order
  if (deal.roles.length !== playerIds.length) {
    throw new Error(
      `fixed deal has ${deal.roles.length} roles but game has ${playerIds.length} players`
    );
  }

  let mafiaCount = 0;
  for (let i = 0; i < playerIds.length; i++) {
    const p = game.players.get(playerIds[i])!;
    p.role = deal.roles[i];
    p.isGodfather = false; // fixed path never touches flags otherwise — reset before pinning
    if (deal.roles[i] === "mafia") mafiaCount++;
  }

  // Deterministically pin the Godfather by join-order index (test seam).
  if (deal.godfather != null) {
    const gf = game.players.get(playerIds[deal.godfather]);
    if (gf && gf.role === "mafia") gf.isGodfather = true;
  }

  // Same variant scheme as the random path, with mafiaVariant pinned to 0
  game.mafiaVariant = 0;
  let citizenVariantIdx = 0;
  for (const [, player] of game.players) {
    if (player.role === "mafia") {
      player.variant = game.mafiaVariant;
    } else if (player.role === "citizen") {
      player.variant = citizenVariantIdx % 8;
      citizenVariantIdx++;
    } else {
      player.variant = 0;
    }
  }

  if (deal.lovers) {
    const a = game.players.get(playerIds[deal.lovers[0]])!;
    const b = game.players.get(playerIds[deal.lovers[1]])!;
    a.isLover = true;
    a.loverId = b.id;
    b.isLover = true;
    b.loverId = a.id;
  }

  return mafiaCount;
}

function assignRoles(game: Game): number {
  if (fixedDeal) return assignFixedRoles(game, fixedDeal);

  const playerIds = shuffle(Array.from(game.players.keys()));
  const { settings } = game;
  const totalPlayers = playerIds.length;

  let mafiaCount = Math.min(settings.mafiaCount, Math.floor(totalPlayers / 3));
  if (!(mafiaCount >= 1)) mafiaCount = 1; // NaN-proof: also catches non-numeric settings

  let idx = 0;

  // Assign mafia
  for (let i = 0; i < mafiaCount && idx < totalPlayers; i++, idx++) {
    game.players.get(playerIds[idx])!.role = "mafia";
  }

  // Assign special town roles
  if (settings.enableDoctor && idx < totalPlayers) {
    game.players.get(playerIds[idx])!.role = "doctor";
    idx++;
  }

  if (settings.enableDetective && idx < totalPlayers) {
    game.players.get(playerIds[idx])!.role = "detective";
    idx++;
  }

  if (settings.enableJoker && idx < totalPlayers) {
    game.players.get(playerIds[idx])!.role = "joker";
    idx++;
  }

  if (settings.enableHunter && idx < totalPlayers) {
    game.players.get(playerIds[idx])!.role = "hunter";
    idx++;
  }

  if (settings.enableVigilante && idx < totalPlayers) {
    game.players.get(playerIds[idx])!.role = "vigilante";
    idx++;
  }

  // Rest are citizens
  while (idx < totalPlayers) {
    game.players.get(playerIds[idx])!.role = "citizen";
    idx++;
  }

  // Assign pixel art variants
  game.mafiaVariant = Math.floor(Math.random() * 4);
  let citizenVariantIdx = 0;
  for (const [, player] of game.players) {
    if (player.role === "mafia") {
      player.variant = game.mafiaVariant;
    } else if (player.role === "citizen") {
      player.variant = citizenVariantIdx % 8;
      citizenVariantIdx++;
    } else {
      player.variant = 0; // doctor, detective, joker, hunter, vigilante have single variant
    }
  }

  // Assign lovers if enabled
  if (settings.enableLovers && totalPlayers >= 2) {
    const allIds = shuffle(Array.from(game.players.keys()));
    const lover1 = allIds[0];
    const lover2 = allIds[1];
    const p1 = game.players.get(lover1)!;
    const p2 = game.players.get(lover2)!;
    p1.isLover = true;
    p1.loverId = lover2;
    p2.isLover = true;
    p2.loverId = lover1;
  }

  // Godfather: promote ONE random mafioso (replaces a mafia slot — count stays
  // constant). Only when 2+ effective mafia (at 1 mafia the Detective could
  // never find anyone). Reads INNOCENT to the Detective; mafia in all else.
  if (settings.enableGodfather && mafiaCount >= 2) {
    const mafias = Array.from(game.players.values()).filter((p) => p.role === "mafia");
    if (mafias.length >= 2) {
      mafias[Math.floor(Math.random() * mafias.length)].isGodfather = true;
    }
  }

  return mafiaCount;
}

export function startGame(game: Game): string[] | null {
  if (game.phase !== "lobby") return null;
  if (game.players.size < 3) return null;

  const actualMafiaCount = assignRoles(game);
  // Lobby state is always fresh (createGame or resetGameState), so beginNight's
  // round++ yields round 1 and the whole-game fields need no re-clearing here.
  const nightMessage = beginNight(game, "start_game");
  game.awaitingNarratorReady = true; // Begin Night gate: narrator confirms before night actions run

  const messages: string[] = [];
  if (actualMafiaCount < game.settings.mafiaCount) {
    messages.push(`Mafia count reduced from ${game.settings.mafiaCount} to ${actualMafiaCount} for balance (max 1/3 of players).`);
  }
  messages.push(nightMessage);
  game.pendingMessages = messages;
  return messages;
}

export function submitMafiaVote(
  game: Game, mafiaId: number, targetId: number, voteType: "lock" | "maybe" | "letsnot"
): { consensus: boolean; target: number | null } {
  if (game.phase !== "night") return { consensus: false, target: null };
  if (game.mafiaTarget !== null) return { consensus: false, target: null }; // already auto-killed

  const mafiaPlayer = game.players.get(mafiaId);
  if (!mafiaPlayer || mafiaPlayer.role !== "mafia" || !mafiaPlayer.isAlive) return { consensus: false, target: null };

  const target = game.players.get(targetId);
  if (!target || !target.isAlive || target.role === "mafia") return { consensus: false, target: null };

  // Object-blocking: if another alive mafia has "letsnot" on this target,
  // reject "maybe" and "lock" votes (self-objection is handled by mutual exclusion below)
  if (voteType === "maybe" || voteType === "lock") {
    const aliveMafia = getAliveByRole(game, "mafia");
    for (const m of aliveMafia) {
      if (m.id === mafiaId) continue; // skip self
      const theirVotes = game.mafiaVotes.get(m.id) || [];
      if (theirVotes.some(v => v.targetId === targetId && v.voteType === "letsnot")) {
        return { consensus: false, target: null };
      }
    }
  }

  let votes = game.mafiaVotes.get(mafiaId) || [];

  // Check if same voteType already exists for this target → toggle off
  const existingIdx = votes.findIndex(v => v.targetId === targetId && v.voteType === voteType);
  if (existingIdx !== -1) {
    // Toggle off: if toggling lock off, revert to maybe
    if (voteType === "lock") {
      votes[existingIdx] = { targetId, voteType: "maybe" };
    } else {
      votes.splice(existingIdx, 1);
    }
    game.mafiaVotes.set(mafiaId, votes);
    game.mafiaTarget = null;
    return checkMafiaConsensus(game);
  }

  if (voteType === "lock") {
    // Lock requires target to already be in "maybe" state for this mafia
    const maybeIdx = votes.findIndex(v => v.targetId === targetId && v.voteType === "maybe");
    if (maybeIdx === -1) return { consensus: false, target: null };
    // Only 1 lock allowed total
    const existingLock = votes.find(v => v.voteType === "lock");
    if (existingLock) return { consensus: false, target: null };
    // Upgrade maybe → lock
    votes[maybeIdx] = { targetId, voteType: "lock" };
  } else {
    // For maybe/letsnot: remove any existing vote on this target first (mutual exclusion)
    votes = votes.filter(v => v.targetId !== targetId);

    if (voteType === "maybe") {
      // Count maybe+lock slots (max 4)
      const maybeLockCount = votes.filter(v => v.voteType === "maybe" || v.voteType === "lock").length;
      if (maybeLockCount >= 4) return { consensus: false, target: null };
      votes.push({ targetId, voteType: "maybe" });
    } else if (voteType === "letsnot") {
      // Count letsnot slots (max 4, separate pool)
      const letsnotCount = votes.filter(v => v.voteType === "letsnot").length;
      if (letsnotCount >= 4) return { consensus: false, target: null };
      votes.push({ targetId, voteType: "letsnot" });
    }
  }

  game.mafiaVotes.set(mafiaId, votes);
  game.mafiaTarget = null;

  return checkMafiaConsensus(game);
}

export function removeMafiaVote(game: Game, mafiaId: number, targetId?: number): boolean {
  if (game.phase !== "night") return false;
  if (game.mafiaTarget !== null) return false; // already auto-killed

  const mafiaPlayer = game.players.get(mafiaId);
  if (!mafiaPlayer || mafiaPlayer.role !== "mafia" || !mafiaPlayer.isAlive) return false;

  const votes = game.mafiaVotes.get(mafiaId);
  if (!votes || votes.length === 0) return false;

  if (targetId !== undefined) {
    // Remove specific target vote
    const newVotes = votes.filter(v => v.targetId !== targetId);
    if (newVotes.length === votes.length) return false; // nothing removed
    game.mafiaVotes.set(mafiaId, newVotes);
  } else {
    // Remove all votes for this mafia member
    game.mafiaVotes.delete(mafiaId);
  }
  game.mafiaTarget = null;
  return true;
}

function checkMafiaConsensus(game: Game): { consensus: boolean; target: number | null } {
  const aliveMafia = getAliveByRole(game, "mafia");

  // All alive mafia must have exactly one "lock" vote
  const lockTargets: number[] = [];
  for (const m of aliveMafia) {
    const votes = game.mafiaVotes.get(m.id) || [];
    const lockVote = votes.find(v => v.voteType === "lock");
    if (!lockVote) return { consensus: false, target: null };
    lockTargets.push(lockVote.targetId);
  }

  // All locks must be on the same target
  const unanimous = lockTargets.every(t => t === lockTargets[0]);
  if (unanimous) {
    game.mafiaTarget = lockTargets[0];
    return { consensus: true, target: lockTargets[0] };
  }

  return { consensus: false, target: null };
}

export function submitDoctorSave(game: Game, doctorId: number, targetId: number): boolean {
  if (game.phase !== "night") return false;
  const doctor = game.players.get(doctorId);
  if (!doctor || doctor.role !== "doctor" || !doctor.isAlive) return false;
  const target = game.players.get(targetId);
  if (!target || !target.isAlive) return false;
  if (targetId === game.lastDoctorTarget) return false;

  game.doctorTarget = targetId;
  return true;
}

export function submitDetectiveInvestigation(game: Game, detectiveId: number, targetId: number): { isMafia: boolean; targetName: string } | null {
  if (game.phase !== "night") return null;
  const detective = game.players.get(detectiveId);
  if (!detective || detective.role !== "detective" || !detective.isAlive) return null;
  const target = game.players.get(targetId);
  if (!target || !target.isAlive) return null;

  game.detectiveTarget = targetId;
  // The Godfather (role stays "mafia") reads INNOCENT — the role's sole mechanic.
  const isMafia = target.role === "mafia" && !target.isGodfather;
  game.detectiveResult = { targetId, isMafia };
  game.detectiveHistory.push({ round: game.round, targetName: target.username, isMafia });
  return { isMafia, targetName: target.username };
}

export function submitJokerHaunt(game: Game, jokerId: number, targetId: number): boolean {
  if (game.phase !== "night") return false;
  if (game.nightSubPhase === "resolving") return false;
  const joker = game.players.get(jokerId);
  if (!joker || joker.role !== "joker") return false;
  // Joker must be dead (was lynched)
  if (joker.isAlive) return false;
  // Target must be in the haunt voters list and alive
  if (!game.jokerHauntVoters.includes(targetId)) return false;
  const target = game.players.get(targetId);
  if (!target || !target.isAlive) return false;

  game.jokerHauntTarget = targetId;
  return true;
}

/**
 * The Vigilante's one-shot night kill. `targetId === null` is a PASS (hold
 * fire — keep the bullet, advance the phase). A real shot commits the target
 * to game.vigilanteTarget (resolved at dawn by resolveNight) AND spends the
 * bullet at submit time — so choosing to shoot consumes the bullet even when
 * the Doctor blocks the kill (D1). Guards: alive vigilante, unused bullet,
 * alive non-self target (self-shot FORBIDDEN — D3; friendly fire on OTHER
 * town is allowed). Returns false (no state change) on any rejection.
 */
export function submitVigilanteShoot(game: Game, vigilanteId: number, targetId: number | null): boolean {
  if (game.phase !== "night" || game.nightSubPhase !== "vigilante") return false;
  const vig = game.players.get(vigilanteId);
  if (!vig || vig.role !== "vigilante" || !vig.isAlive) return false;
  if (vig.vigilanteBulletUsed) return false; // one bullet per game
  if (targetId === null) return true;        // PASS: keep the bullet, advance
  if (targetId === vigilanteId) return false; // D3: no self-shot
  const target = game.players.get(targetId);
  if (!target || !target.isAlive) return false;
  game.vigilanteTarget = targetId;
  vig.vigilanteBulletUsed = true; // consume at submit time (survives a doctor block)
  return true;
}

export function getJokerHauntTargets(game: Game): PlayerInfo[] {
  return game.jokerHauntVoters
    .map(id => game.players.get(id))
    .filter((p): p is Player => p !== undefined && p.isAlive)
    .map(p => toTargetInfo(p, game));
}

// ── B3 (audit P2): the death pipeline ───────────────────────────────────
//
// applyDeath is the SINGLE death funnel: the only place in the engine that
// flips `isAlive = false`. It performs the lover cascade itself (a cascade
// can never bypass the funnel's bookkeeping), derives the public event label
// from (source, cause) in exactly one place, pushes eventHistory, and hands
// every Death to notifyDeathTriggers — the one hook point death-triggered
// roles (Hunter, Program C) attach to.

/** The (source, cause) → public event label table. The ONLY derivation site. */
export function deriveDeathEventType(source: KillSource, cause: DeathCause): DeathEventType {
  if (cause === "lover_cascade") return "lover_death";
  switch (source) {
    case "mafia": return "kill";
    case "joker_haunt": return "joker_haunt";
    case "execution": return "execution";
    case "hunter_revenge": return "hunter_revenge";
    case "vigilante": return "vigilante_shot";
  }
}

// Test seam (pattern: setFixedDeal): lets engine tests observe every Death
// that flows through the funnel. Production never sets it.
let deathTriggerSpy: ((game: Game, death: Death) => void) | null = null;
export function setDeathTriggerSpy(fn: ((game: Game, death: Death) => void) | null): void {
  deathTriggerSpy = fn;
}

// ── C2a: the Hunter trigger queue (observe-and-queue, HUNTER-DESIGN §4) ──
//
// Keyed by Game IDENTITY, deliberately NOT a Game field:
//   - it must survive the caller's reset boundary — resetNightActions wipes
//     every NIGHT_RESETS field between applyDeath (where the trigger fires)
//     and concludeRound (where the gate is checked), the sequencing trap
//     documented at NIGHT_RESETS.pendingRevenge — and B1's exhaustiveness
//     guard means a Game field would have to live in SOME reset scope;
//   - a WeakMap entry dies with its Game (removeGame -> GC) and a different
//     Game object can never see another game's entry.
// Lifecycle: set by notifyDeathTriggers; consumed (or suppression-discarded,
// E11/E12) at the top of concludeRound — the first point past every reset
// boundary. The house-joker instant win discards at the win site (its
// resolveVote branch never reaches concludeRound); resetGameState and
// forceEndGame discard defensively so no entry can outlive a forced
// transition into a restarted/next game.
// D2 (night_timer precedent): every gate-lifecycle edge is slog'd as
// "hunter_gate" (opened / suppressed_no_target / suppressed_game_over /
// resolved / declined / discarded) — console only, never in WS payloads;
// discard sites stay silent unless an entry or open gate actually existed.
// Holds ONE hunter id per game (single-Hunter deal) — not a list of deaths.
const queuedHunterTrigger = new WeakMap<Game, number>();

/**
 * The single death-trigger hook point (audit P2); the Hunter revenge
 * trigger (C2a) hangs here. Called exactly once per Death — every source
 * (night kill, haunt, execution, revenge) and every cause (direct or lover
 * cascade) — from inside applyDeath.
 *
 * Re-entrancy contract: this hook fires INSIDE applyDeath's bookkeeping
 * loop — implementations must OBSERVE AND QUEUE; do NOT call applyDeath
 * re-entrantly. A re-entrant kill would (a) interleave the revenge events
 * between a direct death's and its cascade's eventHistory entries, and
 * (b) drop the revenge Deaths on the floor — they never reach the outer
 * caller's result.killed, so the victim would get no you_died and no
 * player_died broadcast. Revenge kills must enter the funnel via their
 * own intent/path after the triggering resolution completes.
 */
export function notifyDeathTriggers(game: Game, death: Death): void {
  deathTriggerSpy?.(game, death);
  // C2a — the Hunter trigger: OBSERVE AND QUEUE only (contract above). It
  // fires only for a DIRECT Hunter death (a mafia night kill, a daytime
  // lynch, a joker haunt) — NOT for a lover-cascade (heartbreak) death: a
  // Hunter who dies because their lover was killed takes no revenge shot.
  // No game-state mutation here: the gate itself is opened by concludeRound
  // past the caller's reset boundary, and the suppression conditions (E11
  // no-living-target, E12 already-game_over) are evaluated there, on the
  // settled post-resolution board.
  if (death.player.role === "hunter" && death.cause === "direct") {
    queuedHunterTrigger.set(game, death.player.id);
  }
}

/**
 * Kill `playerId` from `source` with the caller-supplied narration line,
 * cascading to a living lover (heartbreak). Returns the Death records in
 * kill order: direct death first, then the cascade. Returns [] if the
 * target is missing or already dead. Pushes one eventHistory entry (with
 * the additive wire cause/source) and fires notifyDeathTriggers per Death.
 */
export function applyDeath(game: Game, playerId: number, source: KillSource, message: string): Death[] {
  const player = game.players.get(playerId);
  if (!player || !player.isAlive) return [];

  player.isAlive = false;
  const deaths: Death[] = [{
    player, source, cause: "direct", message,
    eventType: deriveDeathEventType(source, "direct"),
  }];

  // Lover cascade — INSIDE the funnel, so heartbreak deaths get the same
  // bookkeeping (event, trigger) as every other death. Non-recursive: the
  // partner's own lover link points back at the already-dead player.
  if (player.isLover && player.loverId !== null) {
    const lover = game.players.get(player.loverId);
    if (lover && lover.isAlive) {
      lover.isAlive = false;
      deaths.push({
        player: lover, source, cause: "lover_cascade",
        message: Narrator.loverDeath(lover.username, player.username),
        eventType: deriveDeathEventType(source, "lover_cascade"),
      });
    }
  }

  for (const d of deaths) {
    game.eventHistory.push({
      round: game.round, type: d.eventType, playerName: d.player.username,
      cause: d.cause, source: d.source,
    });
    notifyDeathTriggers(game, d);
  }
  return deaths;
}

export function checkNightReady(game: Game): boolean {
  if (game.phase !== "night") return false;

  // Mafia must have unanimous lock (auto-confirmed via consensus)
  if (game.mafiaTarget === null) return false;

  // Doctor must act (if alive and enabled)
  if (game.settings.enableDoctor) {
    const aliveDoctor = getAliveByRole(game, "doctor");
    if (aliveDoctor.length > 0 && game.doctorTarget === null) return false;
  }

  // Detective must act (if alive and enabled)
  if (game.settings.enableDetective) {
    const aliveDetective = getAliveByRole(game, "detective");
    if (aliveDetective.length > 0 && game.detectiveTarget === null) return false;
  }

  // Joker haunt is optional — joker doesn't have to pick
  // (handled by time-based advancement in server)

  return true;
}

export interface SubPhaseAdvanceResult {
  nextPhase: NightSubPhase;
  isFake: boolean; // true = role is enabled but dead (needs fake delay with audio cues)
}

export function advanceNightSubPhase(game: Game): SubPhaseAdvanceResult {
  const current = game.nightSubPhase;
  const phases: NightSubPhase[] = ["mafia", "doctor", "detective", "vigilante", "resolving"];
  const currentIdx = current ? phases.indexOf(current) : -1;

  // Try each subsequent phase after current
  for (let i = currentIdx + 1; i < phases.length; i++) {
    const candidate = phases[i];

    if (candidate === "resolving") {
      game.nightSubPhase = "resolving";
      return { nextPhase: "resolving", isFake: false };
    }

    if (candidate === "doctor") {
      if (!game.settings.enableDoctor) continue; // disabled → skip entirely
      const alive = getAliveByRole(game, "doctor");
      if (alive.length === 0) {
        // enabled but dead → fake sub-phase
        game.nightSubPhase = "doctor";
        return { nextPhase: "doctor", isFake: true };
      }
      // alive + enabled → real sub-phase
      game.nightSubPhase = "doctor";
      return { nextPhase: "doctor", isFake: false };
    }

    if (candidate === "detective") {
      if (!game.settings.enableDetective) continue; // disabled → skip entirely
      const alive = getAliveByRole(game, "detective");
      if (alive.length === 0) {
        // enabled but dead → fake sub-phase
        game.nightSubPhase = "detective";
        return { nextPhase: "detective", isFake: true };
      }
      // alive + enabled → real sub-phase
      game.nightSubPhase = "detective";
      return { nextPhase: "detective", isFake: false };
    }

    if (candidate === "vigilante") {
      if (!game.settings.enableVigilante) continue; // disabled → skip entirely
      // Phantom whenever NOT actionable: the "open eyes" phase runs EVERY night
      // the role is enabled (even when the vigilante is dead or out of ammo) so
      // its state can't be inferred. Actionable = a living vigilante with an
      // unused bullet exists.
      const actionable = getAliveByRole(game, "vigilante").some((v) => !v.vigilanteBulletUsed);
      game.nightSubPhase = "vigilante";
      return { nextPhase: "vigilante", isFake: !actionable };
    }

}

  // Fallback (shouldn't happen, resolving always catches)
  game.nightSubPhase = "resolving";
  return { nextPhase: "resolving", isFake: false };
}

export interface NightResult {
  messages: string[];
  killed: Death[];
  saved: boolean;
  savedName: string | null;
  savedTargetId: number | null; // for official doctor mode: private notification
}

/** One pending kill for resolveNight's fold, in resolution order. */
export interface KillIntent {
  targetId: number;
  source: KillSource;
  /** Narration for a landed kill — called only when the kill actually lands. */
  deathMessage: (victim: Player) => string;
}

// DESIGN: Night actions resolve simultaneously. If mafia kills the doctor or detective,
// their submitted action still takes effect (doctor save, detective investigation).
// The detective receives their result even if killed the same night.
export function resolveNight(game: Game): NightResult {
  const result: NightResult = { messages: [], killed: [], saved: false, savedName: null, savedTargetId: null };

  // Build tonight's kill intents in resolution order. Order is observable
  // behavior: the mafia kill resolves before the joker haunt (golden #2).
  const intents: KillIntent[] = [];
  if (game.mafiaTarget !== null) {
    intents.push({
      targetId: game.mafiaTarget, source: "mafia",
      deathMessage: (v) => Narrator.diedInNight(v.username),
    });
  }
  // Vigilante shot resolves AFTER the mafia kill, BEFORE the joker haunt. A
  // doctor save on this target (and not the mafia's) blocks it (one save, one
  // source); the shooter may already be dead tonight — the field is read, not
  // the shooter's liveness (D2 simultaneity).
  if (game.vigilanteTarget !== null) {
    intents.push({
      targetId: game.vigilanteTarget, source: "vigilante",
      deathMessage: (v) => Narrator.diedInNight(v.username),
    });
  }
  if (game.jokerHauntTarget !== null) {
    // Official joker mode only: the haunt target is set exclusively by
    // resolveVote's official branch.
    intents.push({
      targetId: game.jokerHauntTarget, source: "joker_haunt",
      deathMessage: (v) => Narrator.diedInNight(v.username),
    });
  }
  if (intents.length === 0) return result;

  // Event presentation: the (house-mode) save event precedes tonight's kill
  // events in eventHistory regardless of which intent the save blocked —
  // even when a kill resolves chronologically first. Remember the insertion
  // point; applyDeath appends the kill events behind it.
  const eventsMark = game.eventHistory.length;

  // Fold the intents against the single doctor save. Semantics (pinned by
  // goldens #2/#6 and tests/death-pipeline.test.ts): ONE save blocks ONE
  // source — the first intent in order that targets the doctor's pick
  // consumes the save; a later intent on the same target kills anyway. A
  // target already dead from an earlier intent (or its cascade) is skipped.
  let saveUsed = false;
  // Names of everyone who actually died tonight (direct + cascade), in kill
  // order. Folded into ONE cause-neutral announcement after the loop.
  const nightDeadNames: string[] = [];
  for (const intent of intents) {
    const target = game.players.get(intent.targetId);
    if (!target) continue;

    if (!saveUsed && game.doctorTarget === intent.targetId) {
      saveUsed = true;
      if (target.isAlive) {
        result.saved = true;
        result.savedName = target.username;
        result.savedTargetId = intent.targetId;
        if (game.settings.doctorMode === "official") {
          // Official: anonymous narration, no public save event.
          result.messages.push(Narrator.doctorSaveOfficial());
        } else {
          result.messages.push(Narrator.doctorSave(target.username));
          game.eventHistory.splice(eventsMark, 0, { round: game.round, type: "save", playerName: target.username });
        }
      }
      // Save matched a target already dead this night (e.g. a lover cascade
      // victim): the save is spent with no effect — matches the pre-B3
      // haunt-block behavior. NB: spending the save on a corpse is
      // unobservable today — the haunt is always the LAST intent, so no
      // later intent exists for the spent save to miss — but it becomes a
      // real semantic choice (spent-on-corpse vs. still-armed) the moment
      // more intents join the fold (Program C).
    } else if (target.isAlive) {
      const deaths = applyDeath(game, intent.targetId, intent.source, intent.deathMessage(target));
      for (const d of deaths) {
        // Night cascade: strip the heartbreak/partner tell from the victim-
        // facing line too (you_died/player_died read d.message). The public
        // batch line is emitted once, below.
        if (d.cause === "lover_cascade") d.message = Narrator.diedInNight(d.player.username);
        nightDeadNames.push(d.player.username);
        result.killed.push(d); // killed[] unchanged: drives triggers/events/UI
      }
    }
    // already dead and not saved: no additional effect
  }

  // ONE cause-neutral announcement for the ENTIRE simultaneous night batch
  // (mafia + vigilante + joker haunt + their lover cascades). Names only WHO,
  // never HOW; joinNames() sorts so the kill ORDER can't out the target.
  // Hunter revenge is NOT folded in — it is gated/post-dawn (concludeRound
  // defers the dawn) and keeps its own separate announcement.
  if (nightDeadNames.length > 0) {
    result.messages.push(Narrator.nightDeaths(nightDeadNames));
  }

  if (result.killed.length === 0 && !result.saved) {
    result.messages.push(Narrator.noKill());
  }

  return result;
}

// ── B4a (audit P5): the single round epilogue ───────────────────────────
//
// concludeRound is the ONE win-check/auto-transition tail, formerly
// triplicated across transitionToDay and both resolveVote execution
// branches (the official-joker early-return re-implemented it). Contract:
//   - Callers run their own resets BEFORE calling (vote/night state is
//     already clean when the epilogue runs — HUNTER-DESIGN §4 relies on
//     exactly this ordering while the gate is open).
//   - `messages` receives any narrator line the epilogue emits (the win
//     line, or beginNight's night-falls line) — nothing else is touched.
//   - checkWinCondition has NO other call site in src/ (pinned by
//     tests/conclude-round.test.ts); the M8 joker-parity rule therefore
//     has exactly one place to live.
//   - Transition-log reasons are derived from the entry phase, preserving
//     the pre-B4a lines: from "night" this is a dawn resolution
//     ("night_resolved"), from anywhere else a vote resolution
//     ("vote_resolved" / "spared"); the auto-night logs "execution" via
//     beginNight as before.

/**
 * Win check + game-over/auto-night/day transition for a resolved round.
 * Its head is the Hunter machinery (C2a): first consume the trigger queue
 * (opening the gate unless suppressed), then the gate line — a pending
 * revenge defers BOTH the win check and the transition; submitHunterRevenge
 * clears the gate and resumes by re-calling this with
 * game.pendingRevenge.resume.
 *
 * SEQUENCING TRAP (implemented here — keep it this way): the trigger fires
 * inside applyDeath, and the caller's resetNightActions — which WIPES
 * pendingRevenge — runs between applyDeath and this gate check in all three
 * flows. That is WHY notifyDeathTriggers only queues (outside the Game
 * object) and the gate is opened HERE, past every caller's reset boundary;
 * a gate set inside the hook is wiped before this line sees it (regression
 * pinned in tests/hunter-engine.test.ts).
 */
export function concludeRound(game: Game, messages: string[], opts: ConcludeRoundOptions): void {
  // C2a: consume the queued Hunter death. Suppression (HUNTER-DESIGN §1,
  // edges E11/E12) evaluates on the settled post-resolution board: a game
  // already over, or no living player left to shoot, discards the queue and
  // resolution proceeds straight through — win check included.
  const queuedHunterId = queuedHunterTrigger.get(game);
  if (queuedHunterId !== undefined) {
    queuedHunterTrigger.delete(game);
    const suppressed =
      game.phase === "game_over" ? "suppressed_game_over"
      : getAlivePlayers(game).length === 0 ? "suppressed_no_target"
      : null;
    if (suppressed === null) {
      // Plain-data resume (decision #4): the exact options this call was
      // entered with, so the resume re-derives the same epilogue shape —
      // including the official-joker preserveHauntVoters carve-out.
      game.pendingRevenge = {
        hunterId: queuedHunterId,
        resume: {
          autoNight: opts.autoNight,
          ...(opts.preserveHauntVoters !== undefined ? { preserveHauntVoters: opts.preserveHauntVoters } : {}),
        },
        // Killed AT NIGHT (eyes closed) ⇒ wake the Hunter with open/close cues;
        // a daytime-lynch gate opens at "voting"/"day" with eyes already open.
        wakeHunter: game.phase === "night",
      };
    }
    slog("hunter_gate", {
      code: game.code, event: suppressed ?? "opened",
      hunterId: queuedHunterId, phase: game.phase, round: game.round,
    });
  }
  if (game.pendingRevenge) return; // the gate: submitHunterRevenge clears it and re-enters with `resume`

  const fromNight = game.phase === "night";

  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    logTransition(game, game.phase, "game_over", fromNight ? "night_resolved" : "vote_resolved");
    game.phase = "game_over";
    if (winner === "town") messages.push(Narrator.townWin());
    else if (winner === "mafia") messages.push(Narrator.mafiaWin());
  } else if (opts.autoNight) {
    // Auto-transition to night after an execution. beginNight re-runs the
    // per-night reset, so { preserveHauntVoters } MUST match the caller's
    // own resetNightActions flags (official-joker carve-out — a mismatch
    // would wipe the haunt voters; the haunt-parity test covers it).
    messages.push(beginNight(game, "execution", { preserveHauntVoters: opts.preserveHauntVoters }));
  } else {
    logTransition(game, game.phase, "day", fromNight ? "night_resolved" : "spared");
    game.phase = "day";
  }
}

// ── C2a (HUNTER-DESIGN §3.5): the one new public engine entry point ─────────

export interface HunterRevengeResult {
  ok: boolean;
  /** Revenge deaths in kill order (direct, then lover cascade); [] on decline or rejection. */
  deaths: Death[];
  /** Narrator lines in order: revenge/decline line(s), then any epilogue line concludeRound appends. */
  messages: string[];
}

/**
 * Resolve the open revenge gate. `targetId === null` declines — the admin
 * force-skip and the revenge timeout resolve through this exact path
 * (decision #2). A non-null target takes the unstoppable shot (§5: never
 * consults doctorTarget). One path, one branch (audit §P5): both arms clear
 * the gate and re-enter concludeRound with the stored resume options, so
 * the deferred win check runs ONLY there — after any revenge deaths (and
 * the target's lover cascade) are on the board. Validation failures return
 * { ok: false } with ZERO state change. The caller (server, task C3) owns
 * all broadcasting; deaths are keyed on Death.cause, never position.
 *
 * POST-CONDITION (C3, read this): game.pendingRevenge is NOT guaranteed
 * null after an { ok: true } return. Under today's single-Hunter deal it
 * always is — but a Hunter dying in the revenge cascade would queue a new
 * trigger, and the resume's concludeRound re-entry would consume it and
 * RE-OPEN the gate before this function returns. Re-check
 * game.pendingRevenge after the call rather than assuming null.
 */
export function submitHunterRevenge(game: Game, hunterId: number, targetId: number | null): HunterRevengeResult {
  const rejected: HunterRevengeResult = { ok: false, deaths: [], messages: [] };
  const gate = game.pendingRevenge;
  if (!gate) return rejected;
  if (hunterId !== gate.hunterId) return rejected;

  const messages: string[] = [];
  const deaths: Death[] = [];
  if (targetId === null) {
    messages.push(Narrator.hunterDecline());
  } else {
    const target = game.players.get(targetId);
    if (!target || !target.isAlive) return rejected;
    // Legal applyDeath site: we are OUTSIDE notifyDeathTriggers (the
    // triggering resolution completed when the gate opened), so the funnel
    // runs normally — eventHistory entries and the target's lover cascade
    // come free (HUNTER-DESIGN §8.1).
    for (const d of applyDeath(game, targetId, "hunter_revenge", Narrator.hunterRevengeKill(target.username))) {
      messages.push(d.message);
      deaths.push(d);
    }
  }

  game.pendingRevenge = null;
  // D2: logged BEFORE the resume re-enters concludeRound, so phase/round are
  // the gated values and a cascade-re-opened gate's "opened" line sorts after.
  slog("hunter_gate", {
    code: game.code, event: targetId === null ? "declined" : "resolved",
    hunterId: gate.hunterId, phase: game.phase, round: game.round,
  });
  concludeRound(game, messages, gate.resume);
  return { ok: true, deaths, messages };
}

export function transitionToDay(game: Game): NightResult {
  // Event tracking lives in the death pipeline now: applyDeath pushes the
  // kill/lover_death/joker_haunt events, resolveNight inserts the house-mode
  // save event ahead of them.
  const nightResult = resolveNight(game);

  // Reset night state — carve-out: capture tonight's save target BEFORE the
  // reset (the doctor may not repeat it tomorrow).
  game.lastDoctorTarget = game.doctorTarget;
  resetNightActions(game);

  // Win check + transition to day/game_over (the dawn epilogue shape).
  concludeRound(game, nightResult.messages, { autoNight: false });

  // STALE-BY-DESIGN when the revenge gate deferred this dawn:
  // submitHunterRevenge never appends, so post-revenge this lacks the
  // revenge/win lines. Deliberate — pendingMessages is read by no
  // production logic (ARCHITECTURE-AUDIT §3.2 item 1: messages flow via
  // return values; dumpGame's copy is only the exhaustive debug snapshot)
  // and is pointed for the §3.2 dead-code backlog, not for fixing here.
  game.pendingMessages = nightResult.messages;
  return nightResult;
}

export function callVote(game: Game, adminId: number, targetId: number): boolean {
  if (game.phase !== "day") return false;
  if (adminId !== game.adminId) return false;
  const target = game.players.get(targetId);
  if (!target || !target.isAlive) return false;

  game.voteTarget = targetId;
  game.votes.clear();
  logTransition(game, game.phase, "voting", "call_vote");
  game.phase = "voting";
  return true;
}

export function castVote(game: Game, voterId: number, approve: boolean): { allVoted: boolean } {
  if (game.phase !== "voting") return { allVoted: false };
  const voter = game.players.get(voterId);
  if (!voter || !voter.isAlive) return { allVoted: false };

  // Reject duplicate votes (e.g. from page refresh)
  if (game.votes.has(voterId)) return { allVoted: false };

  game.votes.set(voterId, approve);

  const alive = getAlivePlayers(game);
  const allVoted = alive.every((p) => game.votes.has(p.id));

  return { allVoted };
}

export interface VoteResult {
  executed: boolean;
  targetName: string;
  votesFor: number;
  votesAgainst: number;
  messages: string[];
  killed: Death[];
  jokerWin: boolean;
}

export function resolveVote(game: Game): VoteResult | null {
  if (game.phase !== "voting" || game.voteTarget === null) return null;

  const target = game.players.get(game.voteTarget)!;
  let votesFor = 0;
  let votesAgainst = 0;

  for (const [voterId, approve] of game.votes) {
    const voter = game.players.get(voterId)!;
    if (!voter.isAlive) continue; // skip dead players' votes
    if (approve) votesFor++;
    else votesAgainst++;
  }

  const totalVoters = votesFor + votesAgainst;
  const executed = votesFor > totalVoters / 2; // strictly >50%

  const result: VoteResult = {
    executed,
    targetName: target.username,
    votesFor,
    votesAgainst,
    messages: [],
    killed: [],
    jokerWin: false,
  };

  if (executed) {
    if (target.role === "joker") {
      result.jokerWin = true;
      result.messages.push(Narrator.jokerWin(target.username));

      if (game.settings.jokerMode === "official") {
        // Official: game continues, joker is joint winner
        game.jokerJointWinner = true;

        // Store voters who voted FOR the joker's execution (haunt targets)
        game.jokerHauntVoters = [];
        for (const [voterId, approve] of game.votes) {
          if (approve) game.jokerHauntVoters.push(voterId);
        }

        // jokerWin narration was already pushed to messages above; only the
        // cascade adds a public line here.
        for (const d of applyDeath(game, target.id, "execution", Narrator.jokerWin(target.username))) {
          if (d.cause === "lover_cascade") result.messages.push(d.message);
          result.killed.push(d);
        }

        // Reset vote+night state — carve-out: the FOR-voters captured above
        // must survive into the haunt night. NOTE: the { preserveHauntVoters }
        // flag MUST match the concludeRound options below — a mismatch would
        // wipe the haunt voters (the haunt-parity test covers it).
        resetNightActions(game, { preserveHauntVoters: true });

        // Win check + game_over/haunt-night transition (the official-joker
        // epilogue shape — same single epilogue, carve-out forwarded).
        concludeRound(game, result.messages, { autoNight: true, preserveHauntVoters: true });
        return result;
      } else {
        // House: instant game over, joker wins
        game.winner = "joker";
        logTransition(game, game.phase, "game_over", "joker_win");
        game.phase = "game_over";

        // jokerWin narration was already pushed to messages above; only the
        // cascade adds a public line here (mirrors the official branch).
        for (const d of applyDeath(game, target.id, "execution", Narrator.jokerWin(target.username))) {
          if (d.cause === "lover_cascade") result.messages.push(d.message);
          result.killed.push(d);
        }

        // C2a (E12): the instant win is already on the board when these
        // deaths apply, so a Hunter heartbreak-killed by this cascade gets
        // NO revenge — and since this branch never reaches concludeRound's
        // consume point, the queued trigger is discarded at the win site.
        const discardedHunterId = queuedHunterTrigger.get(game);
        queuedHunterTrigger.delete(game);
        if (discardedHunterId !== undefined) {
          slog("hunter_gate", {
            code: game.code, event: "discarded",
            hunterId: discardedHunterId, phase: game.phase, round: game.round,
          });
        }

        // Reset vote+night state (mirrors the official branch and the normal path)
        resetNightActions(game);
        return result;
      }
    }

    for (const d of applyDeath(game, target.id, "execution", Narrator.execution(target.username))) {
      result.messages.push(d.message);
      result.killed.push(d);
    }
  } else {
    result.messages.push(Narrator.executionSpared(target.username));
    game.eventHistory.push({ round: game.round, type: "spared", playerName: target.username });
  }

  // Reset vote+night state. NOTE: the default (no-preserve) flags MUST match
  // the concludeRound options below — see the official-joker branch above
  // for the flagged pair.
  resetNightActions(game);

  // Win check + game_over/auto-night/spared-day transition (the normal vote
  // epilogue shape: executed → auto-night, spared → stay in day).
  concludeRound(game, result.messages, { autoNight: result.executed });

  return result;
}

export function cancelVote(game: Game, adminId: number): boolean {
  if (game.phase !== "voting") return false;
  if (adminId !== game.adminId) return false;
  // ballot abort: phase guard means night fields are already clear — keeps
  // the single-reset-list rule
  resetNightActions(game);
  logTransition(game, game.phase, "day", "cancel_vote");
  game.phase = "day";
  return true;
}

export function forceDawn(game: Game): string[] {
  if (game.phase !== "night") return [];

  // Reset night state without resolving — deliberately NO lastDoctorTarget
  // capture here: the night never resolved, so the pending save is discarded.
  resetNightActions(game);
  logTransition(game, game.phase, "day", "force_dawn");
  game.phase = "day";

  const messages = ["The host has forced dawn. No one was killed tonight."];
  game.pendingMessages = messages;
  return messages;
}

export function endDay(game: Game): string[] {
  if (game.phase !== "day") return [];

  const messages = [beginNight(game, "end_day")];
  game.pendingMessages = messages;
  return messages;
}

export function checkWinCondition(game: Game): "town" | "mafia" | "joker" | null {
  const alive = getAlivePlayers(game);
  const aliveMafia = alive.filter((p) => p.role === "mafia");
  // M8: a living joker counts toward NEITHER team (README spec), so the
  // mafia-parity comparison excludes jokers from both sides.
  const aliveNonMafia = alive.filter((p) => p.role !== "mafia" && p.role !== "joker");

  if (aliveMafia.length === 0) return "town";
  if (aliveMafia.length >= aliveNonMafia.length) {
    // Doctor-suppresses-parity (project-owner approved): while ANY Doctor is
    // alive, hold off the Mafia parity-win so the night can resolve — the
    // Doctor may block tonight's kill — and the day can play out. The Mafia
    // win fires only once no Doctor remains. The Doctor's save is unlimited
    // (no per-game cap; submitDoctorSave only forbids the same target on
    // consecutive nights), so the gate is simply "an alive doctor". A lone
    // Doctor vs lone Mafia stalemate is acceptable: the admin can end the game.
    const aliveDoctor = alive.some((p) => p.role === "doctor");
    if (aliveDoctor) return null;
    return "mafia";
  }

  return null;
}

export function forceEndGame(game: Game): void {
  logTransition(game, game.phase, "game_over", "force_end");
  game.phase = "game_over";
  game.forceEnded = true;
  // L3: keep winner well-defined — consumers (buildGameSync, end_game
  // broadcast) dereference it with `!`; "town" matches the live broadcast.
  // The client's forceEnded branch shows a neutral end screen regardless.
  game.winner = "town";
  game.awaitingNarratorReady = false;
  // B4a: forceEndGame is the one forced transition NO reset table reaches
  // (it freezes in-flight state instead of resetting), so the revenge gate
  // is cleared by hand here, exactly like awaitingNarratorReady (the L2
  // pattern; HUNTER-DESIGN §6 lists end_game among the gate-clearing
  // transitions). C2a: the trigger queue is discarded for the same reason
  // (defense in depth — see resetGameState). D2: slog'd only when an entry
  // or open gate actually existed — a plain force-end stays silent.
  if (queuedHunterTrigger.has(game) || game.pendingRevenge) {
    slog("hunter_gate", {
      code: game.code, event: "discarded",
      hunterId: queuedHunterTrigger.get(game) ?? game.pendingRevenge!.hunterId,
      phase: game.phase, round: game.round,
    });
  }
  game.pendingRevenge = null;
  queuedHunterTrigger.delete(game);
}

export function returnToLobby(game: Game): boolean {
  if (game.phase !== "game_over") return false;

  // Reset players + game state back to the lobby, keeping settings
  resetGameState(game, "return_to_lobby");

  return true;
}

export function restartGame(game: Game): string[] | null {
  // Reset players + game state, then start fresh with the same settings
  game.createdAt = Date.now();
  resetGameState(game, "restart_game");

  return startGame(game);
}

export function getMafiaVoteStatus(game: Game): {
  voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>;
  lockedTarget: string | null;
  objectedTargets: Record<number, string[]>;
  aliveMafiaCount: number;
} {
  const voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>> = {};
  const objectedTargets: Record<number, string[]> = {};

  for (const [mafiaId, entries] of game.mafiaVotes) {
    const mafiaPlayer = game.players.get(mafiaId)!;
    voterTargets[mafiaPlayer.username] = entries.map(entry => {
      const target = game.players.get(entry.targetId)!;
      return { target: target.username, targetId: entry.targetId, voteType: entry.voteType };
    });

    // Collect objected targets
    for (const entry of entries) {
      if (entry.voteType === "letsnot") {
        if (!objectedTargets[entry.targetId]) objectedTargets[entry.targetId] = [];
        objectedTargets[entry.targetId].push(mafiaPlayer.username);
      }
    }
  }

  // Determine if consensus was reached (all alive mafia locked same target)
  let lockedTarget: string | null = null;
  if (game.mafiaTarget !== null) {
    const targetPlayer = game.players.get(game.mafiaTarget);
    if (targetPlayer) lockedTarget = targetPlayer.username;
  }

  const aliveMafiaCount = getAliveByRole(game, "mafia").length;

  return { voterTargets, lockedTarget, objectedTargets, aliveMafiaCount };
}
