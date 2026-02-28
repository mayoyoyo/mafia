import type { Game, GameSettings, Player, Role, PlayerInfo, GameEvent, DEFAULT_SETTINGS } from "./types";
import { Narrator } from "./narrator";

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

export function createGame(adminId: number, adminUsername: string): Game {
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
    settings: {
      mafiaCount: 1,
      enableDoctor: false,
      enableDetective: false,
      enableJoker: false,
      enableLovers: false,
      anonymousVoting: true,
      soundEnabled: false,
    },
    players: new Map([[adminId, admin]]),
    mafiaVotes: new Map(),
    mafiaTarget: null,
    doctorTarget: null,
    detectiveTarget: null,
    lastDoctorTarget: null,
    voteTarget: null,
    votes: new Map(),
    voteAnonymous: true,
    nightKill: null,
    doctorSaved: false,
    detectiveResult: null,
    winner: null,
    forceEnded: false,
    pendingMessages: [],
    eventHistory: [],
  };

  games.set(code, game);
  return game;
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

function assignRoles(game: Game): void {
  const playerIds = shuffle(Array.from(game.players.keys()));
  const { settings } = game;
  const totalPlayers = playerIds.length;

  let mafiaCount = Math.min(settings.mafiaCount, Math.floor(totalPlayers / 3));
  if (mafiaCount < 1) mafiaCount = 1;

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
}

export function startGame(game: Game): string[] | null {
  if (game.phase !== "lobby") return null;
  if (game.players.size < 3) return null;

  assignRoles(game);
  game.phase = "night";
  game.round = 1;

  const messages = [Narrator.nightFalls()];
  game.pendingMessages = messages;
  return messages;
}

export function submitMafiaVote(game: Game, mafiaId: number, targetId: number): { allVoted: boolean; target: number | null } {
  if (game.phase !== "night") return { allVoted: false, target: null };

  const mafiaPlayer = game.players.get(mafiaId);
  if (!mafiaPlayer || mafiaPlayer.role !== "mafia" || !mafiaPlayer.isAlive) return { allVoted: false, target: null };

  const target = game.players.get(targetId);
  if (!target || !target.isAlive || target.role === "mafia") return { allVoted: false, target: null };

  game.mafiaVotes.set(mafiaId, targetId);

  const aliveMafia = getAliveByRole(game, "mafia");
  const allVoted = aliveMafia.every((m) => game.mafiaVotes.has(m.id));

  if (!allVoted) return { allVoted: false, target: null };

  // Check if unanimous
  const targets = Array.from(game.mafiaVotes.values());
  const unanimous = targets.every((t) => t === targets[0]);

  if (unanimous) {
    game.mafiaTarget = targets[0];
    return { allVoted: true, target: targets[0] };
  }

  return { allVoted: true, target: null }; // All voted but not unanimous
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
  return { isMafia, targetName: target.username };
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

  // Mafia must have unanimous vote
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

  return true;
}

export interface NightResult {
  messages: string[];
  killed: Array<{ player: Player; message: string }>;
  saved: boolean;
  savedName: string | null;
}

export function resolveNight(game: Game): NightResult {
  const result: NightResult = { messages: [], killed: [], saved: false, savedName: null };

  if (game.mafiaTarget === null) return result;

  const targetId = game.mafiaTarget;

  // Check if doctor saved the target
  if (game.doctorTarget === targetId) {
    const savedPlayer = game.players.get(targetId)!;
    result.saved = true;
    result.savedName = savedPlayer.username;
    result.messages.push(Narrator.doctorSave(savedPlayer.username));
  } else if (game.mafiaTarget !== null) {
    // Kill the target
    const killResult = killPlayer(game, targetId);
    if (killResult) {
      const deathMsg = Narrator.nightKill(killResult.killed.username);
      result.messages.push(deathMsg);
      result.killed.push({ player: killResult.killed, message: deathMsg });

      if (killResult.loverKilled) {
        const loverMsg = Narrator.loverDeath(killResult.loverKilled.username, killResult.killed.username);
        result.messages.push(loverMsg);
        result.killed.push({ player: killResult.loverKilled, message: loverMsg });
      }
    }
  }

  if (result.killed.length === 0 && !result.saved) {
    result.messages.push(Narrator.noKill());
  }

  return result;
}

export function transitionToDay(game: Game): NightResult {
  const nightResult = resolveNight(game);

  // Track events
  if (nightResult.saved && nightResult.savedName) {
    game.eventHistory.push({ round: game.round, type: "save", playerName: nightResult.savedName });
  }
  for (const k of nightResult.killed) {
    const isLoverDeath = k.player.isLover && nightResult.killed.length > 1 && k !== nightResult.killed[0];
    game.eventHistory.push({
      round: game.round,
      type: isLoverDeath ? "lover_death" : "kill",
      playerName: k.player.username,
    });
  }

  // Reset night state
  game.lastDoctorTarget = game.doctorTarget;
  game.mafiaVotes.clear();
  game.mafiaTarget = null;
  game.doctorTarget = null;
  game.detectiveTarget = null;
  game.voteTarget = null;
  game.votes.clear();

  // Check win conditions
  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    game.phase = "game_over";
    if (winner === "town") nightResult.messages.push(Narrator.townWin());
    else if (winner === "mafia") nightResult.messages.push(Narrator.mafiaWin());
  } else {
    game.phase = "day";
  }

  game.pendingMessages = nightResult.messages;
  return nightResult;
}

export function callVote(game: Game, adminId: number, targetId: number, anonymous?: boolean): boolean {
  if (game.phase !== "day") return false;
  if (adminId !== game.adminId) return false;
  const target = game.players.get(targetId);
  if (!target || !target.isAlive) return false;

  game.voteTarget = targetId;
  game.votes.clear();
  game.phase = "voting";
  if (anonymous !== undefined) {
    game.voteAnonymous = anonymous;
  }
  return true;
}

export function castVote(game: Game, voterId: number, approve: boolean): { allVoted: boolean; earlyResolve: boolean } {
  if (game.phase !== "voting") return { allVoted: false, earlyResolve: false };
  const voter = game.players.get(voterId);
  if (!voter || !voter.isAlive) return { allVoted: false, earlyResolve: false };

  game.votes.set(voterId, approve);

  const alive = getAlivePlayers(game);
  const allVoted = alive.every((p) => game.votes.has(p.id));

  let earlyResolve = false;
  if (!game.voteAnonymous && !allVoted) {
    const totalAlive = alive.length;
    let votesFor = 0;
    let votesAgainst = 0;
    for (const [, v] of game.votes) {
      if (v) votesFor++;
      else votesAgainst++;
    }
    const remaining = totalAlive - votesFor - votesAgainst;
    // Majority already reached — execute early
    if (votesFor > totalAlive / 2) earlyResolve = true;
    // Impossible to reach majority — spare early
    if (votesFor + remaining <= totalAlive / 2) earlyResolve = true;
  }

  return { allVoted, earlyResolve };
}

export interface VoteResult {
  executed: boolean;
  targetName: string;
  votesFor: number;
  votesAgainst: number;
  voterNames: Record<string, boolean>;
  messages: string[];
  killed: Array<{ player: Player; message: string }>;
  jokerWin: boolean;
}

export function resolveVote(game: Game): VoteResult | null {
  if (game.phase !== "voting" || game.voteTarget === null) return null;

  const target = game.players.get(game.voteTarget)!;
  let votesFor = 0;
  let votesAgainst = 0;
  const voterNames: Record<string, boolean> = {};

  for (const [voterId, approve] of game.votes) {
    const voter = game.players.get(voterId)!;
    voterNames[voter.username] = approve;
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
    voterNames,
    messages: [],
    killed: [],
    jokerWin: false,
  };

  if (executed) {
    // Check for Joker
    if (target.role === "joker") {
      result.jokerWin = true;
      result.messages.push(Narrator.jokerWin(target.username));
      game.winner = "joker";
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
      return result;
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

  // Reset vote state
  game.voteTarget = null;
  game.votes.clear();

  // Check win condition
  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    game.phase = "game_over";
    if (winner === "town") result.messages.push(Narrator.townWin());
    else if (winner === "mafia") result.messages.push(Narrator.mafiaWin());
  } else if (result.executed) {
    // Auto-transition to night after execution
    game.phase = "night";
    game.round++;
    game.mafiaVotes.clear();
    game.mafiaTarget = null;
    game.doctorTarget = null;
    game.detectiveTarget = null;
    result.messages.push(Narrator.nightFalls());
  } else {
    // Spared — stay in day
    game.phase = "day";
  }

  return result;
}

export function cancelVote(game: Game, adminId: number): boolean {
  if (game.phase !== "voting") return false;
  if (adminId !== game.adminId) return false;
  game.voteTarget = null;
  game.votes.clear();
  game.phase = "day";
  return true;
}

export function endDay(game: Game): string[] {
  if (game.phase !== "day") return [];

  game.phase = "night";
  game.round++;
  game.mafiaVotes.clear();
  game.mafiaTarget = null;
  game.doctorTarget = null;
  game.detectiveTarget = null;

  const messages = [Narrator.nightFalls()];
  game.pendingMessages = messages;
  return messages;
}

export function checkWinCondition(game: Game): "town" | "mafia" | "joker" | null {
  const alive = getAlivePlayers(game);
  const aliveMafia = alive.filter((p) => p.role === "mafia");
  const aliveNonMafia = alive.filter((p) => p.role !== "mafia" && p.role !== "joker");
  const aliveJoker = alive.filter((p) => p.role === "joker");

  if (aliveMafia.length === 0) return "town";
  if (aliveMafia.length >= aliveNonMafia.length + aliveJoker.length) return "mafia";

  return null;
}

export function forceEndGame(game: Game): void {
  game.phase = "game_over";
  game.forceEnded = true;
}

export function restartGame(game: Game): string[] | null {
  // Reset all players
  for (const [, player] of game.players) {
    player.role = null;
    player.isAlive = true;
    player.isLover = false;
    player.loverId = null;
    player.variant = 0;
  }

  // Reset game state
  game.createdAt = Date.now();
  game.phase = "lobby";
  game.round = 0;
  game.mafiaVotes.clear();
  game.mafiaTarget = null;
  game.doctorTarget = null;
  game.detectiveTarget = null;
  game.voteTarget = null;
  game.votes.clear();
  game.voteAnonymous = game.settings.anonymousVoting;
  game.lastDoctorTarget = null;
  game.nightKill = null;
  game.doctorSaved = false;
  game.detectiveResult = null;
  game.winner = null;
  game.forceEnded = false;
  game.pendingMessages = [];
  game.eventHistory = [];

  // Start fresh game with same settings
  return startGame(game);
}

export function getMafiaVoteStatus(game: Game): { voterTargets: Record<string, string> } {
  const voterTargets: Record<string, string> = {};

  for (const [mafiaId, targetId] of game.mafiaVotes) {
    const mafiaPlayer = game.players.get(mafiaId)!;
    const target = game.players.get(targetId)!;
    voterTargets[mafiaPlayer.username] = target.username;
  }

  return { voterTargets };
}
