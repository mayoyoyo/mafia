import { getDb, createUser, loginUser, getUserById, saveConfig, getConfigs, deleteConfig, getConfig } from "./db";
import {
  createGame, getGame, removeGame, addPlayer, removePlayer, rejoinPlayer, updateSettings,
  getPlayerInfo, startGame, submitMafiaVote, submitDoctorSave,
  submitDetectiveInvestigation, checkNightReady, transitionToDay,
  callVote, castVote, resolveVote, cancelVote, endDay, forceDawn, forceEndGame,
  getAlivePlayers, getAliveByRole, getMafiaVoteStatus, restartGame, getAllGames,
} from "./game-engine";
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

function sendNightActionPrompts(game: Game): void {
  // Send mafia their targets
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

  // Send doctor their targets
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

  // Send detective their targets
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
}

function sendNightActionPromptsForPlayer(game: Game, player: import("./types").Player): void {
  if (!player.isAlive || !player.role) return;

  if (player.role === "mafia") {
    const aliveNonMafia = getAlivePlayers(game).filter((p) => p.role !== "mafia");
    const targets = aliveNonMafia.map((p) => ({
      id: p.id,
      username: p.username,
      isAlive: true,
      isAdmin: p.id === game.adminId,
    }));
    sendToUser(player.id, { type: "mafia_targets", players: targets });
    // Also send current vote status
    const status = getMafiaVoteStatus(game);
    sendToUser(player.id, { type: "mafia_vote_update", voterTargets: status.voterTargets });
  }

  if (player.role === "doctor" && game.doctorTarget === null) {
    const allAlive = getAlivePlayers(game).map((p) => ({
      id: p.id,
      username: p.username,
      isAlive: true,
      isAdmin: p.id === game.adminId,
    }));
    sendToUser(player.id, { type: "doctor_targets", players: allAlive, lastDoctorTarget: game.lastDoctorTarget });
  }

  if (player.role === "detective" && game.detectiveTarget === null) {
    const targets = getAlivePlayers(game)
      .filter((p) => p.role !== "detective")
      .map((p) => ({
        id: p.id,
        username: p.username,
        isAlive: true,
        isAdmin: p.id === game.adminId,
      }));
    sendToUser(player.id, { type: "detective_targets", players: targets });
  }
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

        // If game is active (not lobby), send full state to bring player up to speed
        if (game.phase !== "lobby") {
          // Send player list so client can populate knownPlayers
          send(ws, { type: "player_list", players: getPlayerInfo(game) });

          // Send rejoin state (before game_started so client has data before resets)
          send(ws, {
            type: "rejoin_state",
            dayStartedAt: game.dayStartedAt,
            dayVoteCount: game.dayVoteCount,
            narratorHistory: game.narratorHistory,
            detectiveHistory: game.detectiveHistory,
            hasVoted: game.votes.has(client.userId),
            anonVoteChecked: game.voteAnonymous,
          });

          // Send role info
          send(ws, {
            type: "game_started",
            role: rejoined.role!,
            isLover: rejoined.isLover,
            variant: rejoined.variant,
          });

          // Send current phase
          send(ws, {
            type: "phase_change",
            phase: game.phase,
            round: game.round,
            messages: [],
            events: game.eventHistory,
          });

          // If night phase and player is alive, re-send action prompts
          if (game.phase === "night" && rejoined.isAlive) {
            sendNightActionPromptsForPlayer(game, rejoined);
          }

          // If voting in progress, re-send vote state
          if (game.phase === "voting" && game.voteTarget !== null) {
            const target = game.players.get(game.voteTarget)!;
            send(ws, {
              type: "vote_called",
              targetName: target.username,
              targetId: game.voteTarget,
              anonymous: game.voteAnonymous,
            });

            // Send current vote progress
            let votesFor = 0;
            let votesAgainst = 0;
            const voterNames: Record<string, boolean> = {};
            for (const [voterId, approve] of game.votes) {
              const voter = game.players.get(voterId)!;
              voterNames[voter.username] = approve;
              if (approve) votesFor++;
              else votesAgainst++;
            }
            send(ws, {
              type: "vote_update",
              votesFor,
              votesAgainst,
              total: getAlivePlayers(game).length,
              ...(game.voteAnonymous ? {} : { voterNames }),
            });
          }

          // If game is over, send game_over so client shows the right screen
          if (game.phase === "game_over") {
            send(ws, {
              type: "game_over",
              winner: game.winner!,
              message: game.forceEnded ? "Host has ended the game." : (game.winner === "town" ? "Citizens win!" : game.winner === "mafia" ? "Mafia wins!" : "Joker wins!"),
              forceEnded: game.forceEnded,
              players: getPlayerInfo(game, true),
            });
          }

          // If player is dead, notify
          if (!rejoined.isAlive) {
            send(ws, { type: "you_died", message: "You were killed." });
          }
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

      // Send each player their role
      for (const [playerId, player] of game.players) {
        sendToUser(playerId, {
          type: "game_started",
          role: player.role!,
          isLover: player.isLover,
          variant: player.variant,
        });
      }

      // Send night phase
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "night",
        round: game.round,
        messages,
      });

      // Sound cue
      broadcastToGame(game.code, { type: "sound_cue", sound: "night" });

      // Send night action prompts
      sendNightActionPrompts(game);
      break;
    }

    case "mafia_vote": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night") return;

      const result = submitMafiaVote(game, client.userId, msg.targetId);

      // Only broadcast if vote was actually recorded
      if (!game.mafiaVotes.has(client.userId)) break;

      // Broadcast vote status to all mafia
      const status = getMafiaVoteStatus(game);
      const aliveMafia = getAliveByRole(game, "mafia");
      for (const m of aliveMafia) {
        sendToUser(m.id, { type: "mafia_vote_update", voterTargets: status.voterTargets });
      }

      if (result.allVoted && result.target !== null) {
        // Mafia agreed - send confirm prompt (any mafia can confirm)
        const targetPlayer = game.players.get(result.target)!;
        for (const m of aliveMafia) {
          sendToUser(m.id, { type: "mafia_confirm_ready", targetName: targetPlayer.username });
        }
      } else if (result.allVoted && result.target === null) {
        // All voted but not unanimous - notify, let them change votes
        for (const m of aliveMafia) {
          sendToUser(m.id, { type: "night_action_done", message: "The Mafia could not agree. Change your vote." });
        }
      }
      break;
    }

    case "confirm_mafia_kill": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || game.phase !== "night") return;

      // Only mafia can confirm
      const confirmer = game.players.get(client.userId);
      if (!confirmer || confirmer.role !== "mafia" || !confirmer.isAlive) return;

      // Must have unanimous target and not already confirmed
      if (game.mafiaTarget === null || game.mafiaConfirmed) return;

      game.mafiaConfirmed = true;
      const aliveMafia = getAliveByRole(game, "mafia");
      for (const m of aliveMafia) {
        sendToUser(m.id, { type: "night_action_done", message: "The Mafia has chosen their victim." });
      }

      if (checkNightReady(game)) {
        resolveNightAndTransition(game);
      }
      break;
    }

    case "doctor_save": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game) return;

      const saved = submitDoctorSave(game, client.userId, msg.targetId);
      if (saved) {
        sendToUser(client.userId, { type: "night_action_done", message: "You have chosen to protect someone tonight." });
        if (checkNightReady(game)) {
          resolveNightAndTransition(game);
        }
      } else {
        send(ws, { type: "error", message: "You cannot protect the same player two nights in a row." });
      }
      break;
    }

    case "detective_investigate": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game) return;

      const result = submitDetectiveInvestigation(game, client.userId, msg.targetId);
      if (result) {
        sendToUser(client.userId, {
          type: "night_action_done",
          message: "You have chosen to investigate someone tonight. Results will be revealed at dawn.",
        });
        if (checkNightReady(game)) {
          resolveNightAndTransition(game);
        }
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
        votesFor,
        votesAgainst,
        total: getAlivePlayers(game).length,
        ...(game.voteAnonymous ? {} : { voterNames }),
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
            votesFor: voteResult.votesFor,
            votesAgainst: voteResult.votesAgainst,
            ...(isAnon ? {} : { voterNames: voteResult.voterNames }),
          });

          for (const k of voteResult.killed) {
            sendToUser(k.player.id, { type: "you_died", message: k.message });
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
            });
            broadcastToGame(game.code, {
              type: "game_over",
              winner: game.winner!,
              message: voteResult.messages[voteResult.messages.length - 1],
              players: getPlayerInfo(game, true),
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
            });
            broadcastToGame(game.code, { type: "sound_cue", sound: "night" });
            sendNightActionPrompts(game);
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
      broadcastToGame(game.code, { type: "sound_cue", sound: "night" });
      sendNightActionPrompts(game);
      break;
    }

    case "end_game": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

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

    case "close_room": {
      if (!client.gameCode || !client.userId) return;
      const game = getGame(client.gameCode);
      if (!game || client.userId !== game.adminId) return;

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

      // Send each player their new role
      for (const [playerId, player] of game.players) {
        sendToUser(playerId, {
          type: "game_started",
          role: player.role!,
          isLover: player.isLover,
          variant: player.variant,
        });
      }

      // Send night phase
      broadcastToGame(game.code, {
        type: "phase_change",
        phase: "night",
        round: game.round,
        messages,
      });

      // Sound cue
      broadcastToGame(game.code, { type: "sound_cue", sound: "night" });

      // Send night action prompts
      sendNightActionPrompts(game);
      break;
    }

    case "toggle_sound": {
      // Sound toggle is client-side only, but we acknowledge it
      break;
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

  // Notify killed players
  for (const k of nightResult.killed) {
    sendToUser(k.player.id, { type: "you_died", message: k.message });
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
  });

  if (game.phase === "game_over") {
    broadcastToGame(game.code, {
      type: "game_over",
      winner: game.winner!,
      message: nightResult.messages[nightResult.messages.length - 1],
      players: getPlayerInfo(game, true),
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
