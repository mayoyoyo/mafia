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
  doctorMode: "house",
  jokerMode: "house",
};

export type GamePhase = "lobby" | "night" | "day" | "voting" | "game_over";

export type NightSubPhase = "mafia" | "doctor" | "detective" | "joker_haunt" | "resolving";

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
  voteAnonymous: boolean; // per-vote anonymous toggle
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
}

export interface SavedConfig {
  id: number;
  adminId: number;
  name: string;
  settings: GameSettings;
}

// WebSocket message types
export type ClientMessage =
  | { type: "register"; username: string; passcode: string }
  | { type: "login"; username: string; passcode: string }
  | { type: "create_game" }
  | { type: "join_game"; code: string }
  | { type: "leave_game" }
  | { type: "update_settings"; settings: Partial<GameSettings> }
  | { type: "save_config"; name: string }
  | { type: "load_config"; configId: number }
  | { type: "list_configs" }
  | { type: "delete_config"; configId: number }
  | { type: "start_game" }
  | { type: "mafia_vote"; targetId: number; voteType: "lock" | "maybe" | "letsnot" }
  | { type: "mafia_remove_vote"; targetId?: number }
  | { type: "confirm_mafia_kill" }
  | { type: "doctor_save"; targetId: number }
  | { type: "detective_investigate"; targetId: number }
  | { type: "joker_haunt"; targetId: number }
  | { type: "call_vote"; targetId: number; anonymous?: boolean }
  | { type: "abstain_vote" }
  | { type: "cancel_vote" }
  | { type: "cast_vote"; approve: boolean }
  | { type: "end_day" }
  | { type: "force_dawn" }
  | { type: "end_game" }
  | { type: "toggle_sound" }
  | { type: "restart_game" }
  | { type: "return_to_lobby" }
  | { type: "close_room" };

export type ServerMessage =
  | { type: "error"; message: string }
  | { type: "registered"; userId: number; username: string }
  | { type: "logged_in"; userId: number; username: string }
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
  | { type: "vote_called"; targetName: string; targetId: number; anonymous: boolean }
  | { type: "vote_update"; votesFor?: number; votesAgainst?: number; totalVotes: number; total: number; voterNames?: Record<string, boolean> }
  | { type: "vote_result"; targetName: string; executed: boolean; votesFor?: number; votesAgainst?: number; voterNames?: Record<string, boolean> }
  | { type: "player_died"; playerId: number; playerName: string; message: string }
  | { type: "you_died"; message: string; isLoverDeath?: boolean }
  | { type: "game_over"; winner: "town" | "mafia" | "joker"; message: string; forceEnded?: boolean; players?: PlayerInfo[]; jokerJointWinner?: boolean }
  | { type: "configs_list"; configs: SavedConfig[] }
  | { type: "config_saved"; config: SavedConfig }
  | { type: "config_deleted"; configId: number }
  | { type: "lobby_update"; players: PlayerInfo[]; settings: GameSettings; adminName: string }
  | { type: "sound_cue"; sound: "night" | "day" | "everyone_close" | "mafia_open" | "mafia_close" | "doctor_open" | "doctor_close" | "detective_open" | "detective_close" }
  | { type: "night_action_done"; message: string }
  | { type: "spectator_mafia_update"; voterTargets: Record<string, Array<{ target: string; targetId: number; voteType: MafiaVoteType }>>; lockedTarget: string | null; objectedTargets: Record<number, string[]>; aliveMafiaCount: number; targets: PlayerInfo[] }
  | { type: "spectator_kill_confirmed"; targetName: string; doctorMessage: string | null }
  | { type: "spectator_night_phase"; subPhase: "doctor" | "detective" | "resolving"; isRoleAlive: boolean }
  | { type: "room_closed"; message: string }
  | { type: "game_sync";
      // Identity
      code: string;
      isAdmin: boolean;
      narrationAccent: string;
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
      // Anonymous vote default
      anonVoteChecked: boolean;
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
      } | null;
      // Vote state (null if not in voting)
      voteState: {
        targetName: string;
        targetId: number;
        anonymous: boolean;
        hasVoted: boolean;
        votesFor: number;
        votesAgainst: number;
        total: number;
        voterNames: Record<string, boolean> | null;
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
