export type Role = "citizen" | "mafia" | "doctor" | "detective" | "joker" | "hunter";

export interface Player {
  id: number;
  username: string;
  role: Role | null;
  isAlive: boolean;
  isLover: boolean;
  loverId: number | null; // the other lover's player id
  isGodfather: boolean; // mafia-aligned; reads INNOCENT to the Detective (role stays "mafia")
  connected: boolean;
  variant: number; // pixel art variant index
}

export type RuleMode = "official" | "house";

export interface GameSettings {
  mafiaCount: number;
  enableDoctor: boolean;
  enableDetective: boolean;
  enableJoker: boolean;
  enableHunter: boolean;
  enableLovers: boolean;
  enableGodfather: boolean;
  soundEnabled: boolean;
  narrationAccent: string;
  narratorGender: "male" | "female";
  doctorMode: RuleMode;
  jokerMode: RuleMode;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mafiaCount: 1,
  enableDoctor: false,
  enableDetective: false,
  enableJoker: false,
  enableHunter: false,
  enableLovers: false,
  enableGodfather: false,
  soundEnabled: false,
  narrationAccent: "classic",
  narratorGender: "male",
  doctorMode: "official",
  jokerMode: "official",
};

export type GamePhase = "lobby" | "night" | "day" | "voting" | "game_over";

// ── B3 (audit P2): source-carrying death records ────────────────────────
// Every death in the game flows through the applyDeath funnel as one of
// these; (source, cause) is the single derivation input for the public
// event label (deriveDeathEventType in game-engine.ts).
// "hunter_revenge" (C2a): the Hunter's dying shot — applied by
// submitHunterRevenge AFTER the triggering resolution, never inside it.
export type KillSource = "mafia" | "joker_haunt" | "execution" | "hunter_revenge";
export type DeathCause = "direct" | "lover_cascade";
export type DeathEventType = "kill" | "joker_haunt" | "execution" | "lover_death" | "hunter_revenge";

export interface Death {
  player: Player;
  source: KillSource;
  cause: DeathCause;
  message: string;
  /** Derived from (source, cause) in exactly one place (deriveDeathEventType). */
  eventType: DeathEventType;
}

export type NightSubPhase = "mafia" | "doctor" | "detective" | "resolving";

// ── B7 (audit P8): sound-cue typing — derived, not hand-synced ──────────
/** The night sub-phases that emit open/close narration cues — "resolving" is silent. */
export type CueSubPhase = Exclude<NightSubPhase, "resolving">;

/**
 * Every cue the server can send. The per-sub-phase open/close pairs are
 * DERIVED from NightSubPhase via template literals, so a new cue-emitting
 * sub-phase extends the union automatically; the three standalone cues
 * ("night"/"day"/"everyone_close") have no sub-phase and stay enumerated.
 */
export type SoundCue =
  | "night"
  | "day"
  | "everyone_close"
  | `${CueSubPhase}_open`
  | `${CueSubPhase}_close`;

/**
 * Typed producer for the per-sub-phase cues — replaces the three `as any`
 * casts at the server's cue-send sites (audit P8), so a misspelled cue or
 * a non-cue sub-phase ("resolving") is a compile error, not a cue the
 * client silently skips.
 */
export function subPhaseCue(phase: CueSubPhase, edge: "open" | "close"): SoundCue {
  return `${phase}_${edge}`;
}

// ── B4a (audit P5): the round epilogue + Hunter revenge gate ────────────
/**
 * Options for concludeRound (game-engine.ts), the single win-check/
 * auto-transition epilogue. Doubles as the resume payload stored on
 * PendingRevenge — when the Hunter gate defers an epilogue, these are the
 * exact options the resume re-enters concludeRound with (HUNTER-DESIGN §3.1).
 */
export interface ConcludeRoundOptions {
  /** true when the flow is an execution → night auto-transition (resolveVote). */
  autoNight: boolean;
  /** Official-joker-lynch carve-out only: the haunt night must keep the captured voters. */
  preserveHauntVoters?: boolean;
}

/**
 * The Hunter revenge gate (HUNTER-DESIGN §3.1) — PLAIN DATA, never a
 * server-held closure (closure-held gate state is un-rejoinable; audit D3).
 * Opened by concludeRound's trigger-queue consume when a Hunter died this
 * resolution (C2a — notifyDeathTriggers only QUEUES; the gate is set past
 * the caller's reset boundary); submitHunterRevenge clears it and resumes
 * concludeRound with `resume`. assertInvariants pins the §4 phase scoping.
 */
export interface PendingRevenge {
  hunterId: number;
  resume: ConcludeRoundOptions;
}

export type MafiaVoteType = "lock" | "maybe" | "letsnot";

export interface MafiaVoteEntry {
  targetId: number;
  voteType: MafiaVoteType;
}

export interface Game {
  code: string;
  adminId: number;
  createdAt: number;
  phase: GamePhase;
  round: number;
  settings: GameSettings;
  players: Map<number, Player>;
  mafiaVariant: number; // shared pixel art variant for all mafia
  // Night actions
  mafiaVotes: Map<number, MafiaVoteEntry[]>; // mafiaPlayerId -> array of vote entries
  mafiaTarget: number | null;
  doctorTarget: number | null;
  detectiveTarget: number | null;
  lastDoctorTarget: number | null;
  // Joker haunt (official mode)
  jokerHauntTarget: number | null;
  jokerHauntVoters: number[]; // player IDs who voted to lynch the joker
  jokerJointWinner: boolean; // true if joker achieved a joint win (official mode)
  // Day voting
  voteTarget: number | null; // who is being voted on
  votes: Map<number, boolean>; // playerId -> thumbsUp(true)/thumbsDown(false)
  // Results
  nightKill: number | null; // who was killed at night (after doctor check)
  doctorSaved: boolean;
  detectiveResult: { targetId: number; isMafia: boolean } | null;
  winner: "town" | "mafia" | "joker" | null;
  forceEnded: boolean;
  // Narrator
  pendingMessages: string[];
  // Event history
  eventHistory: GameEvent[];
  // Rejoin state tracking
  dayStartedAt: number | null;
  dayVoteCount: number;
  narratorHistory: string[];
  detectiveHistory: Array<{ round: number; targetName: string; isMafia: boolean }>;
  // Sequential night sub-phase
  nightSubPhase: NightSubPhase | null;
  // Begin Night gate (game start / restart only)
  awaitingNarratorReady: boolean;
  // Hunter revenge gate (B4a pre-plumbing): ALWAYS null in Program B.
  pendingRevenge: PendingRevenge | null;
}

// WebSocket message types
export type ClientMessage =
  | { type: "register"; username: string; passcode: string }
  | { type: "login"; username: string; passcode: string }
  | { type: "create_game" }
  | { type: "join_game"; code: string }
  | { type: "leave_game" }
  | { type: "update_settings"; settings: Partial<GameSettings> }
  | { type: "start_game" }
  | { type: "mafia_vote"; targetId: number; voteType: "lock" | "maybe" | "letsnot" }
  | { type: "mafia_remove_vote"; targetId?: number }
  | { type: "confirm_mafia_kill" }
  | { type: "doctor_save"; targetId: number }
  | { type: "detective_investigate"; targetId: number }
  | { type: "joker_haunt"; targetId: number }
  // C3a (HUNTER-DESIGN §3.2): revenge resolution — hunter only; null = decline
  | { type: "hunter_revenge"; targetId: number | null }
  // C3a: admin only (rights retained dead or alive); resolves as decline
  | { type: "force_skip_revenge" }
  | { type: "call_vote"; targetId: number }
  | { type: "abstain_vote" }
  | { type: "cancel_vote" }
  | { type: "cast_vote"; approve: boolean }
  | { type: "end_day" }
  | { type: "force_dawn" }
  | { type: "end_game" }
  | { type: "toggle_sound" }
  | { type: "restart_game" }
  | { type: "return_to_lobby" }
  | { type: "close_room" }
  | { type: "update_player_pref"; key: "hide_mafia_tag" | "player_color"; value: any }
  | { type: "narrator_ready" }
  | { type: "player_return_to_lobby" };

export type ServerMessage =
  | { type: "error"; message: string }
  | { type: "registered"; userId: number; username: string; hide_mafia_tag: boolean; player_color: string | null }
  | { type: "logged_in"; userId: number; username: string; hide_mafia_tag: boolean; player_color: string | null }
  | { type: "game_created"; code: string }
  | { type: "game_joined"; code: string; isAdmin: boolean }
  | { type: "player_list"; players: PlayerInfo[] }
  | { type: "settings_updated"; settings: GameSettings }
  | { type: "game_started"; role: Role; isLover: boolean; variant: number; mafiaTeam?: string[]; isGodfather?: boolean; godfatherName?: string }
  | { type: "phase_change"; phase: GamePhase; round: number; messages: string[]; events?: GameEvent[]; loverDeathName?: string; saved?: boolean }
  | { type: "mafia_vote_update"; voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>; lockedTarget: string | null; objectedTargets: Record<number, string[]>; aliveMafiaCount: number }
  | { type: "mafia_confirm_ready"; targetName: string; targetId: number }
  | { type: "mafia_targets"; players: PlayerInfo[] }
  | { type: "doctor_targets"; players: PlayerInfo[]; lastDoctorTarget?: number | null }
  | { type: "detective_targets"; players: PlayerInfo[] }
  | { type: "detective_result"; targetName: string; isMafia: boolean }
  | { type: "joker_haunt_targets"; players: PlayerInfo[] }
  // C3a (HUNTER-DESIGN §3.3): to the hunter when the gate opens (re-sent on rejoin — C4)
  | { type: "hunter_revenge_targets"; players: PlayerInfo[] }
  // C3a: broadcast to the whole room when the gate opens — this IS the public reveal
  | { type: "hunter_revenge_pending"; hunterName: string }
  | { type: "joker_win_overlay"; jokerName: string }
  | { type: "doctor_save_private"; message: string }
  | { type: "vote_called"; targetName: string; targetId: number }
  | { type: "vote_update"; totalVotes: number; total: number }
  | { type: "vote_result"; targetName: string; executed: boolean }
  | { type: "player_died"; playerId: number; playerName: string; message: string }
  | { type: "you_died"; message: string; isLoverDeath?: boolean }
  | { type: "game_over"; winner: "town" | "mafia" | "joker"; message: string; forceEnded?: boolean; players?: PlayerInfo[]; jokerJointWinner?: boolean }
  | { type: "lobby_update"; players: PlayerInfo[]; settings: GameSettings; adminName: string }
  | { type: "sound_cue"; sound: SoundCue }
  | { type: "awaiting_ready" }
  | { type: "night_action_done"; message: string }
  | { type: "spectator_mafia_update"; voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>; lockedTarget: string | null; objectedTargets: Record<number, string[]>; aliveMafiaCount: number; targets: PlayerInfo[] }
  | { type: "spectator_kill_confirmed"; targetName: string; doctorMessage: string | null; kills?: Array<{ name: string; source: KillSource }> }
  | { type: "spectator_night_phase"; subPhase: "doctor" | "detective" | "resolving"; isRoleAlive: boolean }
  | { type: "spectator_night_complete"; phase: string; targetName: string | null; alive: boolean }
  | { type: "spectator_joker_deliberating" }
  | { type: "spectator_joker_resolved"; targetName: string }
  | { type: "player_prefs"; hide_mafia_tag: boolean; player_color: string | null }
  | { type: "room_closed"; message: string }
  | { type: "game_sync";
      // Identity
      code: string;
      isAdmin: boolean;
      narrationAccent: string;
      narratorGender: "male" | "female";
      hide_mafia_tag: boolean;
      // Players
      players: PlayerInfo[];
      // Role
      role: Role;
      isLover: boolean;
      variant: number;
      // Phase
      phase: GamePhase;
      round: number;
      nightSubPhase: NightSubPhase | null;
      awaitingNarratorReady: boolean;
      // Alive
      isDead: boolean;
      // Day timer
      dayStartedAt: number | null;
      dayVoteCount: number;
      // Narrator
      narratorHistory: string[];
      // Detective (only present when the rejoining player is the detective)
      detectiveHistory?: Array<{ round: number; targetName: string; isMafia: boolean }>;
      // Events
      eventHistory: GameEvent[];
      // Mafia team (only for mafia players)
      mafiaTeam?: string[];
      // Godfather plumbing: isGodfather on the godfather's own sync; godfatherName on every mafia sync
      isGodfather?: boolean;
      godfatherName?: string;
      // Night action (null if not in night or dead or no action needed)
      nightAction: {
        locked: boolean;
        targetName: string | null;
        targets: PlayerInfo[];
        voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>;
        lockedTarget: string | null;
        objectedTargets: Record<number, string[]>;
        aliveMafiaCount: number;
        lastDoctorTarget: number | null;
        isSpectatorView?: boolean;
        spectatorSubPhase?: NightSubPhase;
        spectatorSubPhaseAlive?: boolean;
        spectatorLog?: Array<{ phase: string; targetName: string | null; alive: boolean }>;
        jokerHauntPending?: boolean;
        jokerDeliberating?: boolean;
        jokerResolvedTarget?: string;
      } | null;
      // Vote state (null if not in voting)
      voteState: {
        targetName: string;
        targetId: number;
        hasVoted: boolean;
        totalVotes: number;
        total: number;
      } | null;
      // Game over (null if game not over)
      gameOver: {
        winner: "town" | "mafia" | "joker";
        message: string;
        forceEnded: boolean;
        revealPlayers: PlayerInfo[];
        jokerJointWinner?: boolean;
      } | null;
      // Revenge gate (C4, HUNTER-DESIGN §3.4 — the H4 lesson): present
      // whenever the gate is open, for EVERY rejoiner (the reveal is
      // public); the key is OMITTED entirely while the gate is closed
      // (the detectiveHistory/mafiaTeam optional-only absence pattern —
      // keeps the gate-closed payload byte-identical to pre-Hunter
      // syncs). isYou is true when the rejoiner IS the hunter: their
      // private target list never rides game_sync — it is re-sent as a
      // separate hunter_revenge_targets message right after the sync.
      pendingRevenge?: {
        hunterName: string;
        isYou: boolean;
      };
    };

export interface PlayerInfo {
  id: number;
  username: string;
  isAlive: boolean;
  isAdmin: boolean;
  color?: string | null;
  role?: Role;
  isLover?: boolean;
  loverId?: number;
  isGodfather?: boolean;
}

export interface GameEvent {
  round: number;
  // Structurally DeathEventType plus the two non-death labels — the death
  // labels are reused, not re-listed (compile-time identical union).
  type: DeathEventType | "save" | "spared";
  playerName: string;
  detail?: string;
  // B3 (audit P2): additive wire fields, present on death events only. The
  // client's label maps can collapse onto these later (deferred graft) —
  // until then they are ignored by the client and by the golden summarizer.
  cause?: DeathCause;
  source?: KillSource;
}

export interface WSClient {
  ws: any;
  userId: number | null;
  gameCode: string | null;
}
