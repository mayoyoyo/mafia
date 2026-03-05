export type Role = "citizen" | "mafia" | "doctor" | "detective" | "joker";

export interface Player {
  id: number;
  username: string;
  role: Role | null;
  isAlive: boolean;
  isLover: boolean;
  loverId: number | null; // the other lover's player id
  connected: boolean;
  variant: number; // pixel art variant index
}

export type RuleMode = "official" | "house";

export interface GameSettings {
  mafiaCount: number;
  enableDoctor: boolean;
  enableDetective: boolean;
  enableJoker: boolean;
  enableLovers: boolean;
  soundEnabled: boolean;
  narrationAccent: string;
  doctorMode: RuleMode;
  jokerMode: RuleMode;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mafiaCount: 1,
  enableDoctor: false,
  enableDetective: false,
  enableJoker: false,
  enableLovers: false,
  soundEnabled: false,
  narrationAccent: "classic",
  doctorMode: "official",
  jokerMode: "official",
};

export type GamePhase = "lobby" | "night" | "day" | "voting" | "game_over";

export type NightSubPhase = "mafia" | "doctor" | "detective" | "resolving";

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
  | { type: "game_started"; role: Role; isLover: boolean; variant: number; mafiaTeam?: string[] }
  | { type: "phase_change"; phase: GamePhase; round: number; messages: string[]; events?: GameEvent[]; loverDeathName?: string }
  | { type: "mafia_vote_update"; voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>; lockedTarget: string | null; objectedTargets: Record<number, string[]>; aliveMafiaCount: number }
  | { type: "mafia_confirm_ready"; targetName: string }
  | { type: "mafia_targets"; players: PlayerInfo[] }
  | { type: "doctor_targets"; players: PlayerInfo[]; lastDoctorTarget?: number | null }
  | { type: "detective_targets"; players: PlayerInfo[] }
  | { type: "detective_result"; targetName: string; isMafia: boolean }
  | { type: "joker_haunt_targets"; players: PlayerInfo[] }
  | { type: "joker_win_overlay"; jokerName: string }
  | { type: "doctor_save_private"; message: string }
  | { type: "vote_called"; targetName: string; targetId: number }
  | { type: "vote_update"; totalVotes: number; total: number }
  | { type: "vote_result"; targetName: string; executed: boolean; votesFor: number; votesAgainst: number }
  | { type: "player_died"; playerId: number; playerName: string; message: string }
  | { type: "you_died"; message: string; isLoverDeath?: boolean }
  | { type: "game_over"; winner: "town" | "mafia" | "joker"; message: string; forceEnded?: boolean; players?: PlayerInfo[]; jokerJointWinner?: boolean }
  | { type: "lobby_update"; players: PlayerInfo[]; settings: GameSettings; adminName: string }
  | { type: "sound_cue"; sound: "night" | "day" | "everyone_close" | "mafia_open" | "mafia_close" | "doctor_open" | "doctor_close" | "detective_open" | "detective_close" }
  | { type: "awaiting_ready" }
  | { type: "night_action_done"; message: string }
  | { type: "spectator_mafia_update"; voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>; lockedTarget: string | null; objectedTargets: Record<number, string[]>; aliveMafiaCount: number; targets: PlayerInfo[] }
  | { type: "spectator_kill_confirmed"; targetName: string; doctorMessage: string | null; kills?: Array<{ name: string; source: "mafia" | "joker_haunt" }> }
  | { type: "spectator_night_phase"; subPhase: "doctor" | "detective" | "resolving"; isRoleAlive: boolean }
  | { type: "spectator_night_complete"; phase: string; targetName: string | null; alive: boolean }
  | { type: "player_prefs"; hide_mafia_tag: boolean; player_color: string | null }
  | { type: "room_closed"; message: string }
  | { type: "game_sync";
      // Identity
      code: string;
      isAdmin: boolean;
      narrationAccent: string;
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
      // Detective
      detectiveHistory: Array<{ round: number; targetName: string; isMafia: boolean }>;
      // Events
      eventHistory: GameEvent[];
      // Mafia team (only for mafia players)
      mafiaTeam?: string[];
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
}

export interface GameEvent {
  round: number;
  type: "kill" | "save" | "execution" | "lover_death" | "spared" | "joker_haunt";
  playerName: string;
  detail?: string;
}

export interface WSClient {
  ws: any;
  userId: number | null;
  gameCode: string | null;
}
