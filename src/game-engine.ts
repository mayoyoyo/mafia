import type { Game, GameSettings, Player, Role, PlayerInfo, GameEvent, MafiaVoteType, MafiaVoteEntry, NightSubPhase } from "./types";
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
    connected: true,
    variant: 0,
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
  jokerHauntTarget: (g: Game) => { g.jokerHauntTarget = null; },
  jokerHauntVoters: (g: Game) => { g.jokerHauntVoters = []; },
  nightSubPhase: (g: Game) => { g.nightSubPhase = null; },
  voteTarget: (g: Game) => { g.voteTarget = null; },
  votes: (g: Game) => { g.votes.clear(); },
  awaitingNarratorReady: (g: Game) => { g.awaitingNarratorReady = false; },
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
 * Callers log their own transition (different reasons) BEFORE calling this.
 */
export function resetGameState(game: Game): void {
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
  //   voting    — voteTarget/votes ARE the live ballot (callVote/castVote);
  //   game_over — jokerHauntVoters stay populated when the official-joker
  //               execution itself ends the game (resolveVote captures them
  //               under { preserveHauntVoters } and no later reset boundary
  //               runs; pinned in tests/reset-seam.test.ts);
  //             — a force-ended game (forceEndGame) freezes ALL in-flight
  //               night/vote state where it stood: its only night-scope
  //               guarantee is awaitingNarratorReady=false (the L2 fix), so
  //               that is the only field still checked when forceEnded.
  if (game.phase !== "night") {
    const resting = nightRestingSnapshot(game);
    const skip = new Set<keyof Game>();
    if (game.phase === "voting") {
      skip.add("voteTarget");
      skip.add("votes");
    }
    if (game.phase === "game_over") {
      skip.add("jokerHauntVoters");
      if (game.forceEnded) {
        for (const field of NIGHT_RESET_FIELDS) {
          if (field !== "awaitingNarratorReady") skip.add(field);
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
    connected: true,
    variant: 0,
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
const boolKeys = ["enableDoctor", "enableDetective", "enableJoker", "enableLovers", "soundEnabled"] as const;
const modeKeys = ["doctorMode", "jokerMode"] as const;

// Compile-time exhaustiveness guard: if a key is added to GameSettings in
// types.ts but not handled in sanitizeSettings, the assignment below becomes
// a type error (true is not assignable to false).
type _Covered = "mafiaCount" | (typeof boolKeys)[number] | (typeof modeKeys)[number] | "narrationAccent";
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

  return out;
}

export function getPlayerInfo(game: Game, includeRoles = false): PlayerInfo[] {
  return Array.from(game.players.values()).map((p) => ({
    id: p.id,
    username: p.username,
    isAlive: p.isAlive,
    isAdmin: p.id === game.adminId,
    ...(includeRoles ? { role: p.role ?? undefined, isLover: p.isLover, loverId: p.loverId ?? undefined } : {}),
  }));
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
    game.players.get(playerIds[i])!.role = deal.roles[i];
    if (deal.roles[i] === "mafia") mafiaCount++;
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
      player.variant = 0; // doctor, detective, joker have single variant
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
  const isMafia = target.role === "mafia";
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

export function getJokerHauntTargets(game: Game): PlayerInfo[] {
  return game.jokerHauntVoters
    .map(id => game.players.get(id))
    .filter((p): p is Player => p !== undefined && p.isAlive)
    .map(p => ({
      id: p.id,
      username: p.username,
      isAlive: true,
      isAdmin: p.id === game.adminId,
    }));
}

function killPlayer(game: Game, playerId: number): { killed: Player; loverKilled: Player | null } | null {
  const player = game.players.get(playerId);
  if (!player || !player.isAlive) return null;

  player.isAlive = false;
  let loverKilled: Player | null = null;

  // Check lover
  if (player.isLover && player.loverId !== null) {
    const lover = game.players.get(player.loverId);
    if (lover && lover.isAlive) {
      lover.isAlive = false;
      loverKilled = lover;
    }
  }

  return { killed: player, loverKilled };
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
  const phases: NightSubPhase[] = ["mafia", "doctor", "detective", "resolving"];
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

}

  // Fallback (shouldn't happen, resolving always catches)
  game.nightSubPhase = "resolving";
  return { nextPhase: "resolving", isFake: false };
}

export interface NightResult {
  messages: string[];
  killed: Array<{ player: Player; message: string; source: "mafia" | "joker_haunt" }>;
  saved: boolean;
  savedName: string | null;
  savedTargetId: number | null; // for official doctor mode: private notification
}

// DESIGN: Night actions resolve simultaneously. If mafia kills the doctor or detective,
// their submitted action still takes effect (doctor save, detective investigation).
// The detective receives their result even if killed the same night.
export function resolveNight(game: Game): NightResult {
  const result: NightResult = { messages: [], killed: [], saved: false, savedName: null, savedTargetId: null };

  if (game.mafiaTarget === null && game.jokerHauntTarget === null) return result;

  // Resolve mafia kill
  if (game.mafiaTarget !== null) {
    const targetId = game.mafiaTarget;

    // Check if doctor saved the mafia target
    if (game.doctorTarget === targetId) {
      const savedPlayer = game.players.get(targetId)!;
      result.saved = true;
      result.savedName = savedPlayer.username;
      result.savedTargetId = targetId;
      if (game.settings.doctorMode === "official") {
        result.messages.push(Narrator.doctorSaveOfficial());
      } else {
        result.messages.push(Narrator.doctorSave(savedPlayer.username));
      }
    } else {
      const killResult = killPlayer(game, targetId);
      if (killResult) {
        const deathMsg = Narrator.nightKill(killResult.killed.username);
        result.messages.push(deathMsg);
        result.killed.push({ player: killResult.killed, message: deathMsg, source: "mafia" });

        if (killResult.loverKilled) {
          const loverMsg = Narrator.loverDeath(killResult.loverKilled.username, killResult.killed.username);
          result.messages.push(loverMsg);
          result.killed.push({ player: killResult.loverKilled, message: loverMsg, source: "mafia" });
        }
      }
    }
  }

  // Resolve joker haunt kill (official joker mode)
  if (game.jokerHauntTarget !== null) {
    const hauntTargetId = game.jokerHauntTarget;
    const hauntTarget = game.players.get(hauntTargetId);

    if (hauntTarget) {
      // Doctor save only blocks one source. If mafia also targeted this player
      // and the doctor saved them from mafia, the joker haunt still kills.
      const doctorSavedFromMafia = game.doctorTarget === hauntTargetId && game.mafiaTarget === hauntTargetId;
      const doctorSavedFromHaunt = game.doctorTarget === hauntTargetId && game.mafiaTarget !== hauntTargetId;

      if (doctorSavedFromHaunt) {
        // Doctor blocks the haunt (mafia targeted someone else or nobody)
        if (hauntTarget.isAlive) {
          result.saved = true;
          result.savedName = hauntTarget.username;
          result.savedTargetId = hauntTargetId;
          if (game.settings.doctorMode === "official") {
            if (game.mafiaTarget === null || game.doctorTarget !== game.mafiaTarget) {
              result.messages.push(Narrator.doctorSaveOfficial());
            }
          } else {
            if (game.mafiaTarget === null || game.doctorTarget !== game.mafiaTarget) {
              result.messages.push(Narrator.doctorSave(hauntTarget.username));
            }
          }
        }
      } else {
        // No doctor save for haunt (either doctor saved from mafia, or doctor targeted elsewhere)
        // Kill if still alive
        if (hauntTarget.isAlive) {
          const killResult = killPlayer(game, hauntTargetId);
          if (killResult) {
            const deathMsg = Narrator.jokerHauntKill(killResult.killed.username);
            result.messages.push(deathMsg);
            result.killed.push({ player: killResult.killed, message: deathMsg, source: "joker_haunt" });

            if (killResult.loverKilled) {
              const loverMsg = Narrator.loverDeath(killResult.loverKilled.username, killResult.killed.username);
              result.messages.push(loverMsg);
              result.killed.push({ player: killResult.loverKilled, message: loverMsg, source: "joker_haunt" });
            }
          }
        }
        // If target already dead (killed by mafia above), haunt has no additional effect
      }
    }
  }

  if (result.killed.length === 0 && !result.saved) {
    result.messages.push(Narrator.noKill());
  }

  return result;
}

// Classify a night death entry by its kill source, not array position.
// resolveNight pushes the primary victim first, then their heartbroken lover,
// both tagged with the same source ("mafia" or "joker_haunt"). At most one
// mafia kill and one haunt kill resolve per night, so any entry preceded by
// another entry with the same source is a lover-cascade death.
export function classifyNightDeath(
  killed: NightResult["killed"],
  index: number
): "kill" | "joker_haunt" | "lover_death" {
  const entry = killed[index];
  for (let i = 0; i < index; i++) {
    if (killed[i].source === entry.source) return "lover_death";
  }
  return entry.source === "joker_haunt" ? "joker_haunt" : "kill";
}

export function transitionToDay(game: Game): NightResult {
  const nightResult = resolveNight(game);

  // Track events
  // In official doctor mode the save is anonymous; only push a named save event in house mode.
  if (nightResult.saved && nightResult.savedName && game.settings.doctorMode === "house") {
    game.eventHistory.push({ round: game.round, type: "save", playerName: nightResult.savedName });
  }
  for (let i = 0; i < nightResult.killed.length; i++) {
    game.eventHistory.push({
      round: game.round,
      type: classifyNightDeath(nightResult.killed, i),
      playerName: nightResult.killed[i].player.username,
    });
  }

  // Reset night state — carve-out: capture tonight's save target BEFORE the
  // reset (the doctor may not repeat it tomorrow).
  game.lastDoctorTarget = game.doctorTarget;
  resetNightActions(game);

  // Check win conditions
  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    logTransition(game, game.phase, "game_over", "night_resolved");
    game.phase = "game_over";
    if (winner === "town") nightResult.messages.push(Narrator.townWin());
    else if (winner === "mafia") nightResult.messages.push(Narrator.mafiaWin());
  } else {
    logTransition(game, game.phase, "day", "night_resolved");
    game.phase = "day";
  }

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
  killed: Array<{ player: Player; message: string }>;
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

        const killResult = killPlayer(game, target.id);
        if (killResult) {
          game.eventHistory.push({ round: game.round, type: "execution", playerName: killResult.killed.username });
          result.killed.push({ player: killResult.killed, message: Narrator.jokerWin(target.username) });

          if (killResult.loverKilled) {
            const loverMsg = Narrator.loverDeath(killResult.loverKilled.username, killResult.killed.username);
            result.messages.push(loverMsg);
            result.killed.push({ player: killResult.loverKilled, message: loverMsg });
            game.eventHistory.push({ round: game.round, type: "lover_death", playerName: killResult.loverKilled.username });
          }
        }

        // Reset vote+night state — carve-out: the FOR-voters captured above
        // must survive into the haunt night. NOTE: the { preserveHauntVoters }
        // flag MUST match the beginNight call below — a mismatch would wipe
        // the haunt voters (the haunt-parity test covers it).
        resetNightActions(game, { preserveHauntVoters: true });

        // Check win condition after joker death (+ possible lover death)
        const winner = checkWinCondition(game);
        if (winner) {
          game.winner = winner;
          logTransition(game, game.phase, "game_over", "vote_resolved");
          game.phase = "game_over";
          if (winner === "town") result.messages.push(Narrator.townWin());
          else if (winner === "mafia") result.messages.push(Narrator.mafiaWin());
        } else {
          // Auto-transition to the haunt night after execution. NOTE: the
          // { preserveHauntVoters } flag MUST match the resetNightActions
          // call above (see the comment there).
          result.messages.push(beginNight(game, "execution", { preserveHauntVoters: true }));
        }
        return result;
      } else {
        // House: instant game over, joker wins
        game.winner = "joker";
        logTransition(game, game.phase, "game_over", "joker_win");
        game.phase = "game_over";

        const killResult = killPlayer(game, target.id);
        if (killResult) {
          game.eventHistory.push({ round: game.round, type: "execution", playerName: killResult.killed.username });
          result.killed.push({ player: killResult.killed, message: Narrator.jokerWin(target.username) });

          if (killResult.loverKilled) {
            const loverMsg = Narrator.loverDeath(killResult.loverKilled.username, killResult.killed.username);
            result.messages.push(loverMsg);
            result.killed.push({ player: killResult.loverKilled, message: loverMsg });
            game.eventHistory.push({ round: game.round, type: "lover_death", playerName: killResult.loverKilled.username });
          }
        }

        // Reset vote+night state (mirrors the official branch and the normal path)
        resetNightActions(game);
        return result;
      }
    }

    const killResult = killPlayer(game, target.id);
    if (killResult) {
      const execMsg = Narrator.execution(killResult.killed.username);
      result.messages.push(execMsg);
      result.killed.push({ player: killResult.killed, message: execMsg });
      game.eventHistory.push({ round: game.round, type: "execution", playerName: killResult.killed.username });

      if (killResult.loverKilled) {
        const loverMsg = Narrator.loverDeath(killResult.loverKilled.username, killResult.killed.username);
        result.messages.push(loverMsg);
        result.killed.push({ player: killResult.loverKilled, message: loverMsg });
        game.eventHistory.push({ round: game.round, type: "lover_death", playerName: killResult.loverKilled.username });
      }
    }
  } else {
    result.messages.push(Narrator.executionSpared(target.username));
    game.eventHistory.push({ round: game.round, type: "spared", playerName: target.username });
  }

  // Reset vote+night state. NOTE: the default (no-preserve) flags MUST match
  // the beginNight call below — see the official-joker branch above for the
  // flagged pair.
  resetNightActions(game);

  // Check win condition
  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    logTransition(game, game.phase, "game_over", "vote_resolved");
    game.phase = "game_over";
    if (winner === "town") result.messages.push(Narrator.townWin());
    else if (winner === "mafia") result.messages.push(Narrator.mafiaWin());
  } else if (result.executed) {
    // Auto-transition to night after execution. NOTE: the default
    // (no-preserve) flags MUST match the resetNightActions call above.
    result.messages.push(beginNight(game, "execution"));
  } else {
    // Spared — stay in day
    logTransition(game, game.phase, "day", "spared");
    game.phase = "day";
  }

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
  if (aliveMafia.length >= aliveNonMafia.length) return "mafia";

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
}

export function returnToLobby(game: Game): boolean {
  if (game.phase !== "game_over") return false;

  // Reset players + game state back to the lobby, keeping settings
  logTransition(game, game.phase, "lobby", "return_to_lobby");
  resetGameState(game);

  return true;
}

export function restartGame(game: Game): string[] | null {
  // Reset players + game state, then start fresh with the same settings
  game.createdAt = Date.now();
  logTransition(game, game.phase, "lobby", "restart_game");
  resetGameState(game);

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
