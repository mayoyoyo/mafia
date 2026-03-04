import { getDb, createUser, loginUser, getUserById, saveConfig, getConfigs, deleteConfig, getConfig } from "./db";
import {
  createGame, getGame, removeGame, addPlayer, removePlayer, rejoinPlayer, updateSettings,
  getPlayerInfo, startGame, submitMafiaVote, removeMafiaVote, submitDoctorSave,
  submitDetectiveInvestigation, checkNightReady, transitionToDay, advanceNightSubPhase,
  callVote, castVote, resolveVote, cancelVote, endDay, forceDawn, forceEndGame,
  getAlivePlayers, getAliveByRole, getMafiaVoteStatus, restartGame, returnToLobby, getAllGames,
  submitJokerHaunt, getJokerHauntTargets,
} from "./game-engine";
import { Narrator } from "./narrator";
import type { ClientMessage, ServerMessage, WSClient, GameSettings, Game } from "./types";
import path from "path";
import fs from "fs";

// Initialize database
getDb();

const PORT = parseInt(process.env.PORT || "3000");
const PUBLIC_DIR = path.join(import.meta.dir, "..", "public");

// Track connected clients
const clients = new Map<any, WSClient>();

function send(ws: any, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch { /* client disconnected */ }
}

function broadcastToGame(gameCode: string, msg: ServerMessage, excludeUserId?: number): void {
  for (const [ws, client] of clients) {
    if (client.gameCode === gameCode && client.userId !== excludeUserId) {
      send(ws, msg);
    }
  }
}

function sendToUser(userId: number, msg: ServerMessage): void {
  for (const [ws, client] of clients) {
    if (client.userId === userId) {
      send(ws, msg);
    }
  }
}

function sendToDeadPlayers(game: Game, msg: ServerMessage): void {
  for (const [, player] of game.players) {
    if (!player.isAlive) {
      sendToUser(player.id, msg);
    }
  }
}

function broadcastLobbyUpdate(game: Game): void {
  const players = getPlayerInfo(game);
  const admin = game.players.get(game.adminId);
  broadcastToGame(game.code, {
    type: "lobby_update",
    players,
    settings: game.settings,
    adminName: admin?.username ?? "Unknown",
  });
}

function recordNarrator(game: Game, messages: string[]): void {
  for (const m of messages) game.narratorHistory.push(m);
}

// Night timer management for sequential sub-phases
const nightTimers = new Map<string, Timer>();

function clearNightTimer(gameCode: string): void {
  const timer = nightTimers.get(gameCode);
  if (timer) {
    clearTimeout(timer);
    nightTimers.delete(gameCode);
  }
}

function sendMafiaPrompts(game: Game): void {
  const aliveMafia = getAliveByRole(game, "mafia");
  const aliveNonMafia = getAlivePlayers(game).filter((p) => p.role !== "mafia");
  const mafiaTargets = aliveNonMafia.map((p) => ({
    id: p.id,
    username: p.username,
    isAlive: true,
    isAdmin: p.id === game.adminId,
  }));

  for (const m of aliveMafia) {
    sendToUser(m.id, { type: "mafia_targets", players: mafiaTargets });
  }

  // Send initial spectator view to dead players
  sendToDeadPlayers(game, {
    type: "spectator_mafia_update",
    voterTargets: {},
    lockedTarget: null,
    objectedTargets: {},
    aliveMafiaCount: aliveMafia.length,
    targets: mafiaTargets,
  });
}

function sendDoctorPrompts(game: Game): void {
  const aliveDoctor = getAliveByRole(game, "doctor");
  if (aliveDoctor.length > 0) {
    const allAlive = getAlivePlayers(game).map((p) => ({
      id: p.id,
      username: p.username,
      isAlive: true,
      isAdmin: p.id === game.adminId,
    }));
    for (const d of aliveDoctor) {
      sendToUser(d.id, { type: "doctor_targets", players: allAlive, lastDoctorTarget: game.lastDoctorTarget });
    }
  }
  // Notify dead players about doctor sub-phase
  sendToDeadPlayers(game, {
    type: "spectator_night_phase",
    subPhase: "doctor",
    isRoleAlive: aliveDoctor.length > 0,
  });
}

function sendDetectivePrompts(game: Game): void {
  const aliveDetective = getAliveByRole(game, "detective");
  if (aliveDetective.length > 0) {
    const allAliveExceptSelf = getAlivePlayers(game)
      .filter((p) => p.role !== "detective")
      .map((p) => ({
        id: p.id,
        username: p.username,
        isAlive: true,
        isAdmin: p.id === game.adminId,
      }));
    for (const d of aliveDetective) {
      sendToUser(d.id, { type: "detective_targets", players: allAliveExceptSelf });
    }
  }
  // Notify dead players about detective sub-phase
  sendToDeadPlayers(game, {
    type: "spectator_night_phase",
    subPhase: "detective",
    isRoleAlive: aliveDetective.length > 0,
  });
}

function sendJokerHauntPrompts(game: Game): void {
  // Find the dead joker
  const joker = Array.from(game.players.values()).find(p => p.role === "joker" && !p.isAlive);
  if (!joker) return;

  const targets = getJokerHauntTargets(game);
  if (targets.length === 0) return;

  sendToUser(joker.id, { type: "joker_haunt_targets", players: targets });
  // No spectator announcement, no sound cues — joker haunt is silent
}

function handleSubPhaseAdvance(game: Game): void {
  if (!getGame(game.code)) return; // game was removed

  // Send close cue for the current sub-phase
  const closingPhase = game.nightSubPhase;
  if (closingPhase && closingPhase !== "resolving") {
    broadcastToGame(game.code, { type: "sound_cue", sound: `${closingPhase}_close` as any });
  }

  const result = advanceNightSubPhase(game);

  if (result.nextPhase === "resolving") {
    // Small delay after last close cue before resolving
    const timer = setTimeout(() => {
      nightTimers.delete(game.code);
      if (!getGame(game.code)) return;
      resolveNightAndTransition(game);
    }, 1000);
    nightTimers.set(game.code, timer);
    return;
  }

  if (result.isFake) {
    // Fake sub-phase: enabled but dead role → open cue, random delay, close cue, then advance
    const delay = 1500; // pause after close cue before open
    const timer = setTimeout(() => {
      nightTimers.delete(game.code);
      if (!getGame(game.code)) return;
      broadcastToGame(game.code, { type: "sound_cue", sound: `${result.nextPhase}_open` as any });
      // Notify dead players that this role is dead
      if (result.nextPhase === "doctor" || result.nextPhase === "detective") {
        sendToDeadPlayers(game, {
          type: "spectator_night_phase",
          subPhase: result.nextPhase,
          isRoleAlive: false,
        });
      }

      // Normal-distribution fake delay centered at 10s, range ~5-15s
      const u1 = Math.random() || 0.0001;
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const fakeDelay = Math.max(5000, Math.min(15000, Math.round(10000 + z * 2000)));
      const fakeTimer = setTimeout(() => {
        nightTimers.delete(game.code);
        if (!getGame(game.code)) return;
        // Recurse to next sub-phase (sends close cue for this phase)
        handleSubPhaseAdvance(game);
      }, fakeDelay);
      nightTimers.set(game.code, fakeTimer);
    }, delay);
    nightTimers.set(game.code, timer);
    return;
  }

  // Real sub-phase: alive + enabled role → open cue + send prompts, wait for player action
  const delay = 1500; // pause after close cue before open
  const timer = setTimeout(() => {
    nightTimers.delete(game.code);
    if (!getGame(game.code)) return;

    if (result.nextPhase === "joker_haunt") {
      // Joker haunt is silent — no sound cues, no spectator announcements
      sendJokerHauntPrompts(game);
    } else {
      broadcastToGame(game.code, { type: "sound_cue", sound: `${result.nextPhase}_open` as any });

      if (result.nextPhase === "doctor") {
        sendDoctorPrompts(game);
      } else if (result.nextPhase === "detective") {
        sendDetectivePrompts(game);
      }
    }
  }, delay);
  nightTimers.set(game.code, timer);
}

/** Start the night sequence: sound cues + mafia prompts */
function startNightSequence(game: Game): void {
  broadcastToGame(game.code, { type: "sound_cue", sound: "night" });
  broadcastToGame(game.code, { type: "sound_cue", sound: "everyone_close" });
  broadcastToGame(game.code, { type: "sound_cue", sound: "mafia_open" });
  sendMafiaPrompts(game);
}

function buildGameSync(game: Game, client: WSClient, rejoined: import("./types").Player): ServerMessage {
  const userId = client.userId!;

  // Night action state (only if night + alive + has role with action + correct sub-phase)
  let nightAction: Extract<ServerMessage, { type: "game_sync" }>["nightAction"] = null;
  if (game.phase === "night" && !rejoined.isAlive) {
    // Dead player spectator view for all night sub-phases
    if (game.nightSubPhase === "mafia") {
      const aliveNonMafia = getAlivePlayers(game).filter(p => p.role !== "mafia");
      const spectatorTargets = aliveNonMafia.map(p => ({
        id: p.id, username: p.username, isAlive: true, isAdmin: p.id === game.adminId,
      }));
      const status = getMafiaVoteStatus(game);
      nightAction = {
        locked: false,
        targetName: null,
        targets: spectatorTargets,
        voterTargets: status.voterTargets,
        lockedTarget: status.lockedTarget,
        objectedTargets: status.objectedTargets,
        aliveMafiaCount: status.aliveMafiaCount,
        lastDoctorTarget: null,
        isSpectatorView: true,
      };
    } else if (game.nightSubPhase === "doctor" || game.nightSubPhase === "detective") {
      const isRoleAlive = game.nightSubPhase === "doctor"
        ? getAliveByRole(game, "doctor").length > 0
        : getAliveByRole(game, "detective").length > 0;
      nightAction = {
        locked: false,
        targetName: null,
        targets: [],
        voterTargets: {},
        lockedTarget: null,
        objectedTargets: {},
        aliveMafiaCount: 0,
        lastDoctorTarget: null,
        isSpectatorView: true,
        spectatorSubPhase: game.nightSubPhase,
        spectatorSubPhaseAlive: isRoleAlive,
      };
    } else if (game.nightSubPhase === "joker_haunt") {
      // Dead joker rejoining during haunt phase gets their haunt targets
      if (rejoined.role === "joker" && !rejoined.isAlive && game.jokerHauntTarget === null) {
        const targets = getJokerHauntTargets(game);
        nightAction = {
          locked: false,
          targetName: null,
          targets,
          voterTargets: {},
          lockedTarget: null,
          objectedTargets: {},
          aliveMafiaCount: 0,
          lastDoctorTarget: null,
          isSpectatorView: false,
        };
      } else {
        // Other dead players see resolving
        nightAction = {
          locked: false,
          targetName: null,
          targets: [],
          voterTargets: {},
          lockedTarget: null,
          objectedTargets: {},
          aliveMafiaCount: 0,
          lastDoctorTarget: null,
          isSpectatorView: true,
          spectatorSubPhase: "resolving",
          spectatorSubPhaseAlive: false,
        };
      }
    } else if (game.nightSubPhase === "resolving") {
      nightAction = {
        locked: false,
        targetName: null,
        targets: [],
        voterTargets: {},
        lockedTarget: null,
        objectedTargets: {},
        aliveMafiaCount: 0,
        lastDoctorTarget: null,
        isSpectatorView: true,
        spectatorSubPhase: "resolving",
        spectatorSubPhaseAlive: false,
      };
    }
  } else if (game.phase === "night" && !rejoined.isAlive && rejoined.role === "joker" && game.nightSubPhase === "joker_haunt" && game.jokerHauntTarget === null) {
    // Dead joker during haunt phase (special: not alive but gets action)
    const targets = getJokerHauntTargets(game);
    nightAction = {
      locked: false,
      targetName: null,
      targets,
      voterTargets: {},
      lockedTarget: null,
      objectedTargets: {},
      aliveMafiaCount: 0,
      lastDoctorTarget: null,
    };
  } else if (game.phase === "night" && rejoined.isAlive) {
    if (rejoined.role === "mafia" && game.nightSubPhase === "mafia") {
      const locked = game.mafiaTarget !== null;
      const targetName = locked ? (game.players.get(game.mafiaTarget!)?.username ?? null) : null;

      // Build targets list (non-mafia alive players)
      const targets = locked ? [] : getAlivePlayers(game)
        .filter(p => p.role !== "mafia")
        .map(p => ({ id: p.id, username: p.username, isAlive: true, isAdmin: p.id === game.adminId }));

      const status = getMafiaVoteStatus(game);

      nightAction = {
        locked,
        targetName,
        targets,
        voterTargets: status.voterTargets,
        lockedTarget: status.lockedTarget,
        objectedTargets: status.objectedTargets,
        aliveMafiaCount: status.aliveMafiaCount,
        lastDoctorTarget: null,
      };
    } else if (rejoined.role === "mafia" && game.nightSubPhase !== "mafia") {
      // Mafia sub-phase is done — show locked state
      const doneStatus = getMafiaVoteStatus(game);
      nightAction = {
        locked: true,
        targetName: game.mafiaTarget !== null ? (game.players.get(game.mafiaTarget)?.username ?? null) : null,
        targets: [],
        voterTargets: doneStatus.voterTargets,
        lockedTarget: null,
        objectedTargets: doneStatus.objectedTargets,
        aliveMafiaCount: doneStatus.aliveMafiaCount,
        lastDoctorTarget: null,
      };
    } else if (rejoined.role === "doctor" && game.nightSubPhase === "doctor") {
      const locked = game.doctorTarget !== null;
      const targetName = locked ? (game.players.get(game.doctorTarget!)?.username ?? null) : null;
      const targets = locked ? [] : getAlivePlayers(game)
        .map(p => ({ id: p.id, username: p.username, isAlive: true, isAdmin: p.id === game.adminId }));

      nightAction = {
        locked, targetName, targets,
        voterTargets: {}, lockedTarget: null,
        objectedTargets: {}, aliveMafiaCount: 0,
        lastDoctorTarget: game.lastDoctorTarget,
      };
    } else if (rejoined.role === "doctor" && game.nightSubPhase !== "doctor") {
      // Doctor sub-phase hasn't started or is done — show locked if acted, null otherwise
      if (game.doctorTarget !== null) {
        nightAction = {
          locked: true,
          targetName: game.players.get(game.doctorTarget!)?.username ?? null,
          targets: [],
          voterTargets: {}, lockedTarget: null,
          objectedTargets: {}, aliveMafiaCount: 0,
          lastDoctorTarget: game.lastDoctorTarget,
        };
      }
      // else nightAction stays null (waiting for their turn)
    } else if (rejoined.role === "detective" && game.nightSubPhase === "detective") {
      const locked = game.detectiveTarget !== null;
      const targetName = locked ? (game.players.get(game.detectiveTarget!)?.username ?? null) : null;
      const targets = locked ? [] : getAlivePlayers(game)
        .filter(p => p.role !== "detective")
        .map(p => ({ id: p.id, username: p.username, isAlive: true, isAdmin: p.id === game.adminId }));

      nightAction = {
        locked, targetName, targets,
        voterTargets: {}, lockedTarget: null,
        objectedTargets: {}, aliveMafiaCount: 0,
        lastDoctorTarget: null,
      };
    } else if (rejoined.role === "detective" && game.nightSubPhase !== "detective") {
      // Detective sub-phase hasn't started or is done — show locked if acted, null otherwise
      if (game.detectiveTarget !== null) {
        nightAction = {
          locked: true,
          targetName: game.players.get(game.detectiveTarget!)?.username ?? null,
          targets: [],
          voterTargets: {}, lockedTarget: null,
          objectedTargets: {}, aliveMafiaCount: 0,
          lastDoctorTarget: null,
        };
      }
      // else nightAction stays null (waiting for their turn)
    }
  }

  // Vote state (only if voting)
  let voteState: Extract<ServerMessage, { type: "game_sync" }>["voteState"] = null;
  if (game.phase === "voting" && game.voteTarget !== null) {
    const target = game.players.get(game.voteTarget)!;
    let votesFor = 0, votesAgainst = 0;
    const voterNames: Record<string, boolean> = {};
    for (const [voterId, approve] of game.votes) {
      const voter = game.players.get(voterId)!;
      voterNames[voter.username] = approve;
      if (approve) votesFor++; else votesAgainst++;
    }
    voteState = {
      targetName: target.username,
      targetId: game.voteTarget,
      anonymous: game.voteAnonymous,
      hasVoted: game.votes.has(userId),
      votesFor, votesAgainst,
      total: getAlivePlayers(game).length,
      voterNames: game.voteAnonymous ? null : voterNames,
    };
  }

  // Game over state
  let gameOver: Extract<ServerMessage, { type: "game_sync" }>["gameOver"] = null;
  if (game.phase === "game_over") {
    const winMessages: Record<string, string> = { town: "Citizens win!", mafia: "Mafia wins!", joker: "Joker wins!" };
    gameOver = {
      winner: game.winner!,
      message: game.forceEnded ? "Host has ended the game." : winMessages[game.winner!],
      forceEnded: game.forceEnded,
      revealPlayers: getPlayerInfo(game, true),
    };
  }

  return {
    type: "game_sync",
    code: game.code,
    isAdmin: userId === game.adminId,
    narrationAccent: game.settings.narrationAccent,
    players: getPlayerInfo(game),
    role: rejoined.role!,
    isLover: rejoined.isLover,
    variant: rejoined.variant,
    phase: game.phase,
    round: game.round,
    nightSubPhase: game.nightSubPhase,
    isDead: !rejoined.isAlive,
    dayStartedAt: game.dayStartedAt,
    dayVoteCount: game.dayVoteCount,
    narratorHistory: game.narratorHistory,
    detectiveHistory: game.detectiveHistory,
    eventHistory: game.eventHistory,
    anonVoteChecked: game.voteAnonymous,
    ...(rejoined.role === "mafia" ? {
      mafiaTeam: Array.from(game.players.values())
        .filter(p => p.role === "mafia")
        .map(p => p.username),
    } : {}),
    nightAction,
    voteState,
    gameOver,
  };
}

function handleMessage(ws: any, client: WSClient, msg: ClientMessage): void {
  switch (msg.type) {
    case "register": {
      if (!msg.username || msg.username.trim().length === 0) {
        send(ws, { type: "error", message: "Username is required" });
        return;
      }
      if (!msg.passcode || !/^\d{4}$/.test(msg.passcode)) {
        send(ws, { type: "error", message: "Passcode must be exactly 4 digits" });
        return;
      }
      const userId = createUser(msg.username.trim(), msg.passcode);
      if (userId === null) {
        send(ws, { type: "error", message: "Username already taken" });
        return;
      }
      client.userId = userId;
      send(ws, { type: "registered", userId, username: msg.username.trim() });
      break;
    }

    case "login": {
      const user = loginUser(msg.username, msg.passcode);
      if (!user) {
        send(ws, { type: "error", message: "Invalid username or passcode" });
        return;
      }
      client.userId = user.id;
      send(ws, { type: "logged_in", userId: user.id, username: user.username });
      break;
    }

    case "create_game": {
      if (!client.userId) {
        send(ws, { type: "error", message: "Not logged in" });
        return;
      }
      if (client.gameCode) {
        send(ws, { type: "error", message: "Already in a game" });
        return;
      }
      const game = createGame(client.userId, getUsernameFromClients(client.userId));
      client.gameCode = game.code;
      send(ws, { type: "game_created", code: game.code });
      broadcastLobbyUpdate(game);
      break;
    }

    case "join_game": {
      if (!client.userId) {
        send(ws, { type: "error", message: "Not logged in" });
        return;
      }
      if (client.gameCode) {
        send(ws, { type: "error", message: "Already in a game" });
        return;
      }
      const code = msg.code.toUpperCase();
      const game = getGame(code);
      if (!game) {
        send(ws, { type: "error", message: "Game not found" });
        return;
      }

      // Try rejoin first (player already exists in game)
      const rejoined = rejoinPlayer(game, client.userId);
      if (rejoined) {
        client.gameCode = code;
        send(ws, { type: "game_joined", code, isAdmin: client.userId === game.adminId });

        // If game is active (not lobby), send single atomic game_sync
        if (game.phase !== "lobby") {
          send(ws, buildGameSync(game, client, rejoined));
        } else {
          broadcastLobbyUpdate(game);
        }
        break;
      }

      // Normal join (lobby only)
      const username = getUsernameFromClients(client.userId);
      const player = addPlayer(game, client.userId, username);
      if (!player) {
        send(ws, { type: "error", message: "Cannot join: game full or already started" });
        return;
      }
      client.gameCode = code;
      send(ws, { type: "game_joined", code, isAdmin: client.userId === game.adminId });
      broadcastLobbyUpdate(game);
      break;
    }

    case "leave_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game) {
        client.gameCode = null;
        return;
      }

      if (game.phase === "game_over") {
        // During game_over, remove the player
        removePlayer(game, client.userId);
        // If admin leaves during game_over, destroy the room (nobody can restart)
        if (client.userId === game.adminId) {
          broadcastToGame(game.code, { type: "room_closed", message: "The host has left. Room closed." });
          const leftCode = game.code;
          removeGame(leftCode);
          for (const [, c] of clients) {
            if (c.gameCode === leftCode) {
              c.gameCode = null;
            }
          }
        }
        client.gameCode = null;
        return;
      }

      if (game.phase === "lobby") {
        if (client.userId === game.adminId) {
          // Admin leaves lobby = end game for everyone
          broadcastToGame(game.code, { type: "game_over", winner: "town", message: "The host has left the lobby.", forceEnded: true, players: getPlayerInfo(game, true) });
          removeGame(game.code);
          for (const [, c] of clients) {
            if (c.gameCode === client.gameCode) {
              c.gameCode = null;
            }
          }
        } else {
          removePlayer(game, client.userId);
          broadcastLobbyUpdate(game);
        }
      } else {
        // Active game (night/day/voting)
        if (client.userId === game.adminId) {
          // Admin leaves active game = force end (room persists at game_over)
          clearNightTimer(game.code);
          forceEndGame(game);
          broadcastToGame(game.code, {
            type: "phase_change",
            phase: "game_over",
            round: game.round,
            messages: ["The host has left the game."],
            events: game.eventHistory,
          });
          broadcastToGame(game.code, {
            type: "game_over",
            winner: "town",
            message: "The host has left the game.",
            forceEnded: true,
            players: getPlayerInfo(game, true),
          });
          // Remove the game since admin explicitly left (can't restart)
          removeGame(game.code);
          for (const [, c] of clients) {
            if (c.gameCode === client.gameCode) {
              c.gameCode = null;
            }
          }
        } else {
          // Non-admin leaves active game — just mark disconnected (they can rejoin)
          const player = game.players.get(client.userId);
          if (player) player.connected = false;
        }
      }
      client.gameCode = null;
      break;
    }

    case "update_settings": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;
      if (game.phase !== "lobby") return;
      updateSettings(game, msg.settings);
      send(ws, { type: "settings_updated", settings: game.settings });
      broadcastLobbyUpdate(game);
      break;
    }

    case "save_config": {
      if (!client.userId) return;
      const game = client.gameCode ? getGame(client.gameCode) : null;
      const settings = game ? game.settings : null;
      if (!settings) {
        send(ws, { type: "error", message: "No game settings to save" });
        return;
      }
      const configId = saveConfig(client.userId, msg.name, JSON.stringify(settings));
      send(ws, {
        type: "config_saved",
        config: { id: configId, adminId: client.userId, name: msg.name, settings },
      });
      break;
    }

    case "load_config": {
      if (!client.userId || !client.gameCode) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId || game.phase !== "lobby") return;
      const config = getConfig(msg.configId);
      if (!config || config.admin_id !== client.userId) {
        send(ws, { type: "error", message: "Config not found" });
        return;
      }
      const loadedSettings = JSON.parse(config.settings_json) as GameSettings;
      updateSettings(game, loadedSettings);
      send(ws, { type: "settings_updated", settings: game.settings });
      broadcastLobbyUpdate(game);
      break;
    }

    case "list_configs": {
      if (!client.userId) return;
      const configs = getConfigs(client.userId);
      send(ws, {
        type: "configs_list",
        configs: configs.map((c) => ({
          id: c.id,
          adminId: c.admin_id,
          name: c.name,
          settings: JSON.parse(c.settings_json),
        })),
      });
      break;
    }

    case "delete_config": {
      if (!client.userId) return;
      const deleted = deleteConfig(msg.configId, client.userId);
      if (deleted) {
        send(ws, { type: "config_deleted", configId: msg.configId });
      }
      break;
    }

    case "start_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) {
        send(ws, { type: "error", message: "Only the admin can start the game" });
        return;
      }
      const messages = startGame(game);
      if (!messages) {
        send(ws, { type: "error", message: "Need at least 3 players to start" });
        return;
      }
      recordNarrator(game, messages);

      // Build mafia team names
      const mafiaNames = Array.from(game.players.values())
        .filter(p => p.role === "mafia")
        .map(p => p.username);

      // Send each player their role
      for (const [playerId, player] of game.players) {
        sendToUser(playerId, {
          type: "game_started",
          role: player.role!,
          isLover: player.isLover,
          variant: player.variant,
          ...(player.role === "mafia" ? { mafiaTeam: mafiaNames } : {}),
        });
      }

      // Send night phase
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "night",
        round: game.round,
        messages,
      });

      // Start sequential night
      startNightSequence(game);
      break;
    }

    case "mafia_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase !== "mafia") return;

      const voteType = msg.voteType || "lock";
      const result = submitMafiaVote(game, client.userId, msg.targetId, voteType);

      broadcastMafiaStatus(game, result);
      break;
    }


    case "mafia_remove_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase !== "mafia") return;

      if (!removeMafiaVote(game, client.userId, msg.targetId)) break;

      broadcastMafiaStatus(game, { consensus: false, target: null });
      break;
    }

    case "confirm_mafia_kill": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night" || game.nightSubPhase !== "mafia") return;
      if (game.mafiaTarget === null) return;

      const aliveMafia = getAliveByRole(game, "mafia");
      for (const m of aliveMafia) {
        sendToUser(m.id, { type: "night_action_done", message: "The Mafia has chosen their victim." });
      }
      handleSubPhaseAdvance(game);
      break;
    }

    case "doctor_save": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.nightSubPhase !== "doctor") return;

      const saved = submitDoctorSave(game, client.userId, msg.targetId);
      if (saved) {
        sendToUser(client.userId, { type: "night_action_done", message: "You have chosen to protect someone tonight." });
        // Advance to next sub-phase (detective/resolving)
        handleSubPhaseAdvance(game);
      } else {
        send(ws, { type: "error", message: "You cannot protect the same player two nights in a row." });
      }
      break;
    }

    case "detective_investigate": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.nightSubPhase !== "detective") return;

      const result = submitDetectiveInvestigation(game, client.userId, msg.targetId);
      if (result) {
        sendToUser(client.userId, {
          type: "night_action_done",
          message: "You have chosen to investigate someone tonight. Results will be revealed at dawn.",
        });
        // Advance to resolving
        handleSubPhaseAdvance(game);
      }
      break;
    }

    case "joker_haunt": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.nightSubPhase !== "joker_haunt") return;

      const haunted = submitJokerHaunt(game, client.userId, msg.targetId);
      if (haunted) {
        sendToUser(client.userId, { type: "night_action_done", message: "You have chosen your victim. Revenge is sweet." });
        // Notify dead players (spectator chat) about the haunt choice
        const target = game.players.get(msg.targetId);
        if (target) {
          // Use spectator_kill_confirmed to show the haunt target to dead chat
          sendToDeadPlayers(game, {
            type: "spectator_kill_confirmed",
            targetName: target.username,
            doctorMessage: "Joker chose to haunt " + target.username,
          });
        }
        // Advance to resolving
        handleSubPhaseAdvance(game);
      }
      break;
    }

    case "call_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      if (callVote(game, client.userId, msg.targetId, msg.anonymous)) {
        game.dayVoteCount++;
        const target = game.players.get(msg.targetId)!;
        broadcastToGame(game.code, {
          type: "vote_called",
          targetName: target.username,
          targetId: msg.targetId,
          anonymous: game.voteAnonymous,
        });
      }
      break;
    }

    case "abstain_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;
      // Admin abstains - just stay in day phase, no vote happens
      recordNarrator(game, ["The admin has chosen to abstain from calling a vote today."]);
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "day",
        round: game.round,
        messages: ["The admin has chosen to abstain from calling a vote today."],
      });
      break;
    }

    case "cancel_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      if (cancelVote(game, client.userId)) {
        game.dayStartedAt = Date.now();
        recordNarrator(game, ["The vote has been cancelled by the admin."]);
        broadcastToGame(game.code, {
          type: "phase_change",
          phase: "day",
          round: game.round,
          messages: ["The vote has been cancelled by the admin."],
          events: game.eventHistory,
        });
      }
      break;
    }

    case "cast_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game) return;

      const result = castVote(game, client.userId, msg.approve);

      // Broadcast vote progress
      let votesFor = 0;
      let votesAgainst = 0;
      const voterNames: Record<string, boolean> = {};
      for (const [voterId, approve] of game.votes) {
        const voter = game.players.get(voterId)!;
        voterNames[voter.username] = approve;
        if (approve) votesFor++;
        else votesAgainst++;
      }

      broadcastToGame(game.code, {
        type: "vote_update",
        ...(game.voteAnonymous ? {} : { votesFor, votesAgainst, voterNames }),
        totalVotes: votesFor + votesAgainst,
        total: getAlivePlayers(game).length,
      });

      if (result.allVoted || result.earlyResolve) {
        const isAnon = game.voteAnonymous;
        const voteResult = resolveVote(game);
        if (voteResult) {
          recordNarrator(game, voteResult.messages);

          broadcastToGame(game.code, {
            type: "vote_result",
            targetName: voteResult.targetName,
            executed: voteResult.executed,
            ...(isAnon ? {} : { votesFor: voteResult.votesFor, votesAgainst: voteResult.votesAgainst, voterNames: voteResult.voterNames }),
          });

          // Send joker win overlay to all players (official mode: game continues)
          if (voteResult.jokerWin && game.settings.jokerMode === "official") {
            const jokerPlayer = voteResult.killed.find(k => k.player.role === "joker");
            if (jokerPlayer) {
              broadcastToGame(game.code, {
                type: "joker_win_overlay",
                jokerName: jokerPlayer.player.username,
              });
            }
          }

          let voteLoverDeathName: string | undefined;
          for (let i = 0; i < voteResult.killed.length; i++) {
            const k = voteResult.killed[i];
            const isLoverDeath = i > 0 && k.player.isLover;
            if (isLoverDeath) voteLoverDeathName = k.player.username;
            sendToUser(k.player.id, { type: "you_died", message: k.message, ...(isLoverDeath ? { isLoverDeath: true } : {}) });
            broadcastToGame(game.code, {
              type: "player_died",
              playerId: k.player.id,
              playerName: k.player.username,
              message: k.message,
            });
          }

          if (game.phase === "game_over") {
            game.dayStartedAt = null;
            broadcastToGame(game.code, {
              type: "phase_change",
              phase: game.phase,
              round: game.round,
              messages: voteResult.messages,
              events: game.eventHistory,
              ...(voteLoverDeathName ? { loverDeathName: voteLoverDeathName } : {}),
            });
            broadcastToGame(game.code, {
              type: "game_over",
              winner: game.winner!,
              message: voteResult.messages[voteResult.messages.length - 1],
              players: getPlayerInfo(game, true),
              ...(game.jokerJointWinner ? { jokerJointWinner: true } : {}),
            });
          } else if (game.phase === "night") {
            // Auto-transition to night after execution
            game.dayStartedAt = null;
            game.dayVoteCount = 0;
            broadcastToGame(game.code, {
              type: "phase_change",
              phase: "night",
              round: game.round,
              messages: voteResult.messages,
              events: game.eventHistory,
              ...(voteLoverDeathName ? { loverDeathName: voteLoverDeathName } : {}),
            });
            startNightSequence(game);
          } else {
            // Spared — stay in day
            game.dayStartedAt = Date.now();
            broadcastToGame(game.code, {
              type: "phase_change",
              phase: game.phase,
              round: game.round,
              messages: [],
              events: game.eventHistory,
            });
          }
        }
      }
      break;
    }

    case "force_dawn": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      clearNightTimer(game.code);
      const messages = forceDawn(game);
      if (messages.length === 0) return;
      game.dayStartedAt = Date.now();
      recordNarrator(game, messages);

      // Send detective result if investigation was submitted before force dawn
      if (game.detectiveResult) {
        const allDetectives = Array.from(game.players.values()).filter((p) => p.role === "detective");
        for (const d of allDetectives) {
          sendToUser(d.id, {
            type: "detective_result",
            targetName: game.players.get(game.detectiveResult.targetId)?.username ?? "Unknown",
            isMafia: game.detectiveResult.isMafia,
          });
        }
        game.detectiveResult = null;
      }

      broadcastToGame(game.code, { type: "sound_cue", sound: "day" });
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "day",
        round: game.round,
        messages,
        events: game.eventHistory,
      });
      break;
    }

    case "end_day": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      const messages = endDay(game);
      game.dayStartedAt = null;
      game.dayVoteCount = 0;
      recordNarrator(game, messages);
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "night",
        round: game.round,
        messages,
      });
      startNightSequence(game);
      break;
    }

    case "end_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      clearNightTimer(game.code);
      forceEndGame(game);
      recordNarrator(game, ["Host has ended the game."]);
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "game_over",
        round: game.round,
        messages: ["Host has ended the game."],
        events: game.eventHistory,
      });
      broadcastToGame(game.code, {
        type: "game_over",
        winner: "town",
        message: "Host has ended the game.",
        forceEnded: true,
        players: getPlayerInfo(game, true),
      });
      // Room persists — do NOT removeGame or clear gameCode refs
      break;
    }

    case "return_to_lobby": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) {
        send(ws, { type: "error", message: "Only the admin can return to lobby" });
        return;
      }
      if (!returnToLobby(game)) {
        send(ws, { type: "error", message: "Cannot return to lobby" });
        return;
      }
      broadcastLobbyUpdate(game);
      break;
    }

    case "close_room": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

      clearNightTimer(game.code);
      broadcastToGame(game.code, { type: "room_closed", message: "The host has closed the room." });
      const closedCode = game.code;
      removeGame(closedCode);
      // Clear all clients' gameCode refs
      for (const [, c] of clients) {
        if (c.gameCode === closedCode) {
          c.gameCode = null;
        }
      }
      break;
    }

    case "restart_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) {
        send(ws, { type: "error", message: "Only the admin can restart the game" });
        return;
      }
      const messages = restartGame(game);
      if (!messages) {
        send(ws, { type: "error", message: "Cannot restart game" });
        return;
      }
      recordNarrator(game, messages);

      // Build mafia team names
      const mafiaNames2 = Array.from(game.players.values())
        .filter(p => p.role === "mafia")
        .map(p => p.username);

      // Send each player their new role
      for (const [playerId, player] of game.players) {
        sendToUser(playerId, {
          type: "game_started",
          role: player.role!,
          isLover: player.isLover,
          variant: player.variant,
          ...(player.role === "mafia" ? { mafiaTeam: mafiaNames2 } : {}),
        });
      }

      // Send night phase
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "night",
        round: game.round,
        messages,
      });

      // Start sequential night
      startNightSequence(game);
      break;
    }

    case "toggle_sound": {
      // Sound toggle is client-side only, but we acknowledge it
      break;
    }
  }
}

function broadcastMafiaStatus(game: Game, result: { consensus: boolean; target: number | null }): void {
  const status = getMafiaVoteStatus(game);
  const aliveMafia = getAliveByRole(game, "mafia");
  for (const m of aliveMafia) {
    sendToUser(m.id, { type: "mafia_vote_update", voterTargets: status.voterTargets, lockedTarget: status.lockedTarget, objectedTargets: status.objectedTargets, aliveMafiaCount: status.aliveMafiaCount });
  }

  // Send spectator update to dead players
  const aliveNonMafia = getAlivePlayers(game).filter((p) => p.role !== "mafia");
  const spectatorTargets = aliveNonMafia.map((p) => ({
    id: p.id,
    username: p.username,
    isAlive: true,
    isAdmin: p.id === game.adminId,
  }));
  sendToDeadPlayers(game, {
    type: "spectator_mafia_update",
    voterTargets: status.voterTargets,
    lockedTarget: status.lockedTarget,
    objectedTargets: status.objectedTargets,
    aliveMafiaCount: status.aliveMafiaCount,
    targets: spectatorTargets,
  });

  // On consensus: send confirm-ready so mafia can slide to confirm the kill
  if (result.consensus && result.target !== null) {
    const target = game.players.get(result.target);
    const targetName = target ? target.username : "target";
    for (const m of aliveMafia) {
      sendToUser(m.id, { type: "mafia_confirm_ready", targetName, targetId: result.target });
    }
  }
}

function resolveNightAndTransition(game: Game): void {
  if (!getGame(game.code)) return; // game was removed (e.g., admin left)
  const nightResult = transitionToDay(game);
  recordNarrator(game, nightResult.messages);

  // Track dayStartedAt
  if (game.phase === "day") {
    game.dayStartedAt = Date.now();
  }

  // Send private doctor save message in official mode
  if (nightResult.saved && nightResult.savedTargetId !== null && game.settings.doctorMode === "official") {
    sendToUser(nightResult.savedTargetId, {
      type: "doctor_save_private",
      message: Narrator.doctorSaveVictim(),
    });
  }

  // Send detective result privately (even if detective died this night)
  if (game.detectiveResult) {
    const allDetectives = Array.from(game.players.values()).filter((p) => p.role === "detective");
    for (const d of allDetectives) {
      sendToUser(d.id, {
        type: "detective_result",
        targetName: game.players.get(game.detectiveResult.targetId)?.username ?? "Unknown",
        isMafia: game.detectiveResult.isMafia,
      });
    }
    game.detectiveResult = null;
  }

  // Send spectator kill result to dead players (before phase change clears their panel)
  if (nightResult.killed.length > 0 || nightResult.saved) {
    const targetName = nightResult.killed.length > 0
      ? nightResult.killed[0].player.username
      : nightResult.savedName!;
    let doctorMessage: string | null = null;
    if (game.settings.enableDoctor) {
      if (nightResult.saved && nightResult.savedName) {
        doctorMessage = `Doctor saved ${nightResult.savedName}`;
      } else {
        doctorMessage = `Doctor was not able to save ${targetName}`;
      }
    }
    sendToDeadPlayers(game, {
      type: "spectator_kill_confirmed",
      targetName,
      doctorMessage,
    });
  }

  // Notify killed players
  let nightLoverDeathName: string | undefined;
  for (let i = 0; i < nightResult.killed.length; i++) {
    const k = nightResult.killed[i];
    const isLoverDeath = i > 0 && k.player.isLover;
    if (isLoverDeath) nightLoverDeathName = k.player.username;
    sendToUser(k.player.id, { type: "you_died", message: k.message, ...(isLoverDeath ? { isLoverDeath: true } : {}) });
    broadcastToGame(game.code, {
      type: "player_died",
      playerId: k.player.id,
      playerName: k.player.username,
      message: k.message,
    });
  }

  // Sound cue for day
  broadcastToGame(game.code, { type: "sound_cue", sound: "day" });

  // Phase change
  broadcastToGame(game.code, {
    type: "phase_change",
    phase: game.phase,
    round: game.round,
    messages: nightResult.messages,
    events: game.eventHistory,
    ...(nightLoverDeathName ? { loverDeathName: nightLoverDeathName } : {}),
  });

  if (game.phase === "game_over") {
    broadcastToGame(game.code, {
      type: "game_over",
      winner: game.winner!,
      message: nightResult.messages[nightResult.messages.length - 1],
      players: getPlayerInfo(game, true),
      ...(game.jokerJointWinner ? { jokerJointWinner: true } : {}),
    });
  }
}

function getUsernameFromClients(userId: number): string {
  const user = getUserById(userId);
  return user?.username ?? `Player${userId}`;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".webmanifest": "application/manifest+json",
  };
  return types[ext] || "application/octet-stream";
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Serve static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = path.join(PUBLIC_DIR, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(PUBLIC_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const file = Bun.file(fullPath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": getMimeType(fullPath) },
        });
      }
    } catch { /* fall through */ }

    // SPA fallback
    const indexFile = Bun.file(path.join(PUBLIC_DIR, "index.html"));
    return new Response(indexFile, {
      headers: { "Content-Type": "text/html" },
    });
  },

  websocket: {
    open(ws) {
      clients.set(ws, { ws, userId: null, gameCode: null });
    },

    message(ws, message) {
      const client = clients.get(ws);
      if (!client) return;

      try {
        const msg = JSON.parse(String(message)) as ClientMessage;
        handleMessage(ws, client, msg);
      } catch (e) {
        send(ws, { type: "error", message: "Invalid message format" });
      }
    },

    close(ws) {
      const client = clients.get(ws);
      if (client) {
        if (client.gameCode && client.userId) {
          const game = getGame(client.gameCode);
          if (game) {
            const player = game.players.get(client.userId);
            if (player) {
              player.connected = false;
            }
            // All disconnects are non-destructive — player can rejoin via auto-rejoin
          }
        }
        clients.delete(ws);
      }
    },
  },
});

// Auto-kill games older than 2 hours
const TWO_HOURS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of getAllGames()) {
    if (now - game.createdAt > TWO_HOURS) {
      clearNightTimer(code);
      broadcastToGame(code, {
        type: "game_over",
        winner: "town",
        message: "Game ended: exceeded 2-hour time limit.",
        players: getPlayerInfo(game, true),
      });
      removeGame(code);
      for (const [, c] of clients) {
        if (c.gameCode === code) {
          c.gameCode = null;
        }
      }
    }
  }
}, 60_000);

console.log(`Mafia server running on http://localhost:${PORT}`);
