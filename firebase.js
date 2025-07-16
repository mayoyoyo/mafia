import gameState from './gameState.js';
import { Player, generateGameCode } from './models.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyB7ePeEyVMddntT7LOhfSiGELco6I4cScI",
    authDomain: "mafia-5df57.firebaseapp.com",
    databaseURL: "https://mafia-5df57-default-rtdb.firebaseio.com",
    projectId: "mafia-5df57",
    storageBucket: "mafia-5df57.firebasestorage.app",
    messagingSenderId: "97012755934",
    appId: "1:97012755934:web:ace6908e6080a07c6f014f",
    measurementId: "G-BMDXKW0JYR"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Reference to the current game in Firebase
let gameRef = null;

// Firebase Service
const firebaseService = {
    // Create a new game as host
    createGame() {
        const gameCode = generateGameCode();
        gameState.setAsHost(gameCode);
        
        // Create a new game in Firebase
        gameRef = database.ref('games/' + gameCode);
        
        // Set initial game data
        return gameRef.set({
            gameCode: gameCode,
            host: 'Host',
            status: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {},
            settings: gameState.settings
        }).then(() => {
            // Save game state locally as backup
            localStorage.setItem('mafiaGameState', JSON.stringify(gameState.getHostData()));
            return gameCode;
        });
    },
    
    // Join an existing game as player
    joinGame(gameCode, playerName) {
        return new Promise((resolve, reject) => {
            // Check if game exists in Firebase
            const ref = database.ref('games/' + gameCode);
            
            ref.once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        // Game exists, join it
                        const gameData = snapshot.val();
                        
                        if (gameData.status === 'in_progress') {
                            reject(new Error('This game has already started. You cannot join.'));
                            return;
                        }
                        
                        // Create player object
                        const playerId = 'player_' + Date.now();
                        const player = new Player(playerId, playerName);
                        const playerData = player.toJSON();
                        playerData.joinTime = firebase.database.ServerValue.TIMESTAMP;
                        
                        // Add player to the game
                        gameRef = ref;
                        return gameRef.child('players/' + playerId).set(playerData)
                            .then(() => {
                                // Set local game state
                                gameState.setAsPlayer(gameCode, playerName, playerId);
                                localStorage.setItem('mafiaPlayerState', JSON.stringify(gameState.getPlayerData()));
                                resolve(playerId);
                            });
                    } else {
                        reject(new Error(`Game with code ${gameCode} does not exist!`));
                    }
                })
                .catch((error) => {
                    console.error('Error joining game:', error);
                    reject(new Error('Error joining game. Please try again.'));
                });
        });
    },
    
    // Start the game
    startGame() {
        if (!gameRef || !gameState.isHost) return Promise.reject(new Error('Not authorized to start game'));
        
        if (gameState.players.length < 3) {
            return Promise.reject(new Error('You need at least 3 players to start the game.'));
        }
        
        // Assign roles based on game settings
        gameState.assignRoles();
        
        // Update game status and player data in Firebase
        return gameRef.update({
            status: 'in_progress',
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            players: gameState.getPlayersObject()
        });
    },
    
    // End the game
    endGame() {
        if (!gameRef || !gameState.isHost) return Promise.reject(new Error('Not authorized to end game'));
        
        return gameRef.update({
            status: 'ended',
            endedAt: firebase.database.ServerValue.TIMESTAMP
        });
    },
    
    // Update game settings
    updateSettings() {
        if (!gameRef || !gameState.isHost) return Promise.reject(new Error('Not authorized to update settings'));
        
        return gameRef.child('settings').set(gameState.settings);
    },
    
    // Leave the game (for players)
    leaveGame() {
        if (!gameRef) return Promise.resolve();
        
        if (gameState.isHost) {
            // For host: Remove the game
            return gameRef.remove().then(() => {
                this.cleanup();
                localStorage.removeItem('mafiaGameState');
            });
        } else if (gameState.playerId) {
            // For player: Remove the player from the game
            return gameRef.child('players/' + gameState.playerId).remove().then(() => {
                this.cleanup();
                localStorage.removeItem('mafiaPlayerState');
            });
        }
        
        return Promise.resolve();
    },
    
    // Set up listeners for game updates
    setupGameListeners(callbacks) {
        if (!gameRef) return;
        
        // Listen for player joins/updates
        gameRef.child('players').on('value', (snapshot) => {
            if (snapshot.exists()) {
                const playersData = snapshot.val();
                gameState.updatePlayers(Object.values(playersData));
                
                if (callbacks.onPlayersUpdate) {
                    callbacks.onPlayersUpdate(gameState.players);
                }
            }
        });
        
        // Listen for game status changes
        gameRef.child('status').on('value', (snapshot) => {
            if (snapshot.exists()) {
                const status = snapshot.val();
                gameState.status = status;
                
                if (status === 'in_progress' && callbacks.onGameStart) {
                    callbacks.onGameStart();
                } else if (status === 'ended' && callbacks.onGameEnd) {
                    callbacks.onGameEnd();
                }
            }
        });
        
        // Listen for settings changes (for players)
        if (!gameState.isHost) {
            gameRef.child('settings').on('value', (snapshot) => {
                if (snapshot.exists()) {
                    const settings = snapshot.val();
                    gameState.updateSettings(settings);
                    
                    if (callbacks.onSettingsUpdate) {
                        callbacks.onSettingsUpdate(settings);
                    }
                }
            });
        }
    },
    
    // Handle player disconnection
    setupDisconnectHandlers() {
        if (!gameRef) return;
        
        // For host: Remove the game when disconnected
        if (gameState.isHost) {
            gameRef.onDisconnect().remove();
        }
        // For player: Remove the player from the game when disconnected
        else if (gameState.playerId) {
            gameRef.child('players/' + gameState.playerId).onDisconnect().remove();
        }
    },
    
    // Clean up Firebase listeners
    cleanup() {
        if (gameRef) {
            // Cancel all listeners
            gameRef.off();
            
            // Cancel onDisconnect operations
            gameRef.onDisconnect().cancel();
            
            gameRef = null;
        }
    },
    
    // Reconnect to an existing game
    reconnectToGame(gameCode, isHost, playerId = null) {
        gameRef = database.ref('games/' + gameCode);
        
        return gameRef.once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const gameData = snapshot.val();
                    
                    if (isHost) {
                        // Reconnect as host
                        gameState.setAsHost(gameCode);
                        gameState.updatePlayers(Object.values(gameData.players || {}));
                        gameState.updateSettings(gameData.settings);
                        gameState.status = gameData.status;
                        return true;
                    } else if (playerId) {
                        // Reconnect as player
                        const playerData = gameData.players && gameData.players[playerId];
                        if (playerData) {
                            gameState.setAsPlayer(gameCode, playerData.name, playerId);
                            gameState.status = gameData.status;
                            return true;
                        }
                    }
                }
                
                return false;
            });
    }
};

export default firebaseService;