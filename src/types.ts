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

export interface GameSettings {
  mafiaCount: number;
  enableDoctor: boolean;
  enableDetective: boolean;
  enableJoker: boolean;
  enableLovers: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mafiaCount: 1,
  enableDoctor: false,
  enableDetective: false,
  enableJoker: false,
  enableLovers: false,
  soundEnabled: false,
};

export type GamePhase = "lobby" | "night" | "day" | "voting" | "game_over";

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
  mafiaVotes: Map<number, number>; // mafiaPlayerId -> targetId
  mafiaTarget: number | null;
  mafiaConfirmed: boolean;
  doctorTarget: number | null;
  detectiveTarget: number | null;
  lastDoctorTarget: number | null;
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
  | { type: "mafia_vote"; targetId: number }
  | { type: "confirm_mafia_kill" }
  | { type: "doctor_save"; targetId: number }
  | { type: "detective_investigate"; targetId: number }
  | { type: "call_vote"; targetId: number; anonymous?: boolean }
  | { type: "abstain_vote" }
  | { type: "cancel_vote" }
  | { type: "cast_vote"; approve: boolean }
  | { type: "end_day" }
  | { type: "force_dawn" }
  | { type: "end_game" }
  | { type: "toggle_sound" }
  | { type: "restart_game" }
  | { type: "close_room" };

export type ServerMessage =
  | { type: "error"; message: string }
  | { type: "registered"; userId: number; username: string }
  | { type: "logged_in"; userId: number; username: string }
  | { type: "game_created"; code: string }
  | { type: "game_joined"; code: string; isAdmin: boolean }
  | { type: "player_list"; players: PlayerInfo[] }
  | { type: "settings_updated"; settings: GameSettings }
  | { type: "game_started"; role: Role; isLover: boolean; variant: number }
  | { type: "phase_change"; phase: GamePhase; round: number; messages: string[]; events?: GameEvent[] }
  | { type: "mafia_vote_update"; voterTargets: Record<string, string> }
  | { type: "mafia_confirm_ready"; targetName: string }
  | { type: "mafia_targets"; players: PlayerInfo[] }
  | { type: "doctor_targets"; players: PlayerInfo[]; lastDoctorTarget?: number | null }
  | { type: "detective_targets"; players: PlayerInfo[] }
  | { type: "detective_result"; targetName: string; isMafia: boolean }
  | { type: "vote_called"; targetName: string; targetId: number; anonymous: boolean }
  | { type: "vote_update"; votesFor: number; votesAgainst: number; total: number; voterNames?: Record<string, boolean> }
  | { type: "vote_result"; targetName: string; executed: boolean; votesFor: number; votesAgainst: number; voterNames?: Record<string, boolean> }
  | { type: "player_died"; playerId: number; playerName: string; message: string }
  | { type: "you_died"; message: string }
  | { type: "game_over"; winner: "town" | "mafia" | "joker"; message: string; forceEnded?: boolean; players?: PlayerInfo[] }
  | { type: "configs_list"; configs: SavedConfig[] }
  | { type: "config_saved"; config: SavedConfig }
  | { type: "config_deleted"; configId: number }
  | { type: "lobby_update"; players: PlayerInfo[]; settings: GameSettings; adminName: string }
  | { type: "sound_cue"; sound: "night" | "day" }
  | { type: "night_action_done"; message: string }
  | { type: "room_closed"; message: string }
  | { type: "rejoin_state"; dayStartedAt: number | null; dayVoteCount: number;
      narratorHistory: string[];
      detectiveHistory: Array<{ round: number; targetName: string; isMafia: boolean }>;
      hasVoted: boolean; anonVoteChecked: boolean;
      nightActionLocked: boolean; nightActionTargetName: string | null };

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
  type: "kill" | "save" | "execution" | "lover_death" | "spared";
  playerName: string;
  detail?: string;
}

export interface WSClient {
  ws: any;
  userId: number | null;
  gameCode: string | null;
}
