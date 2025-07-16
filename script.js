// Firebase Configuration - Replace with your own config
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

// DOM Elements
const mainMenu = document.querySelector('.main-menu');
const hostScreen = document.getElementById('host-screen');
const joinScreen = document.getElementById('join-screen');
const playerLobbyScreen = document.getElementById('player-lobby');
const gameScreen = document.getElementById('game-screen');
const hostGameView = document.getElementById('host-game-view');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const backToMainHostBtn = document.getElementById('back-to-main-host');
const backToMainJoinBtn = document.getElementById('back-to-main-join');
const gameCodeDisplay = document.getElementById('game-code');
const playerGameCodeDisplay = document.getElementById('player-game-code');
const hostGameCodeDisplay = document.getElementById('host-game-code-display');
const gameCodeInput = document.getElementById('game-code-input');
const playerNameInput = document.getElementById('player-name');
const playerNameDisplay = document.getElementById('player-name-display');
const joinGameBtn = document.getElementById('join-game-btn');
const startGameBtn = document.getElementById('start-game-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');
const endGameBtn = document.getElementById('end-game-btn');
const backToMainFromGameBtn = document.getElementById('back-to-main-from-game');
const connectedPlayersList = document.getElementById('connected-players');
const lobbyPlayersList = document.getElementById('lobby-players-list');
const gamePlayersList = document.getElementById('game-players-list');
const playersRolesList = document.getElementById('players-roles-list');
const playerRole = document.getElementById('player-role');
const roleDescription = document.getElementById('role-description');

// Game settings elements
const mafiaCountInput = document.getElementById('mafia-count');
const mafiaMinusBtn = document.querySelector('.minus-btn');
const mafiaPlusBtn = document.querySelector('.plus-btn');
const enableDoctorToggle = document.getElementById('enable-doctor');
const enableInvestigatorToggle = document.getElementById('enable-investigator');
const enableJokerToggle = document.getElementById('enable-joker');
const enableLoversToggle = document.getElementById('enable-lovers');

// Game roles
const ROLES = {
    CIVILIAN: 'civilian',
    MAFIA: 'mafia',
    DOCTOR: 'doctor',
    INVESTIGATOR: 'investigator',
    JOKER: 'joker',
    LOVER: 'lover'
};

// Player model
class Player {
    constructor(id, name, isHost = false) {
        this.id = id;
        this.name = name;
        this.isHost = isHost;
        this.role = null;
        this.isAlive = true;
        this.joinTime = Date.now();
    }

    assignRole(role) {
        this.role = role;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            isHost: this.isHost,
            role: this.role,
            isAlive: this.isAlive,
            joinTime: this.joinTime
        };
    }
}

// Game settings model
class GameSettings {
    constructor() {
        this.mafiaCount = 1;
        this.enableDoctor = true;
        this.enableInvestigator = true;
        this.enableJoker = false;
        this.enableLovers = false;
    }

    toJSON() {
        return {
            mafiaCount: this.mafiaCount,
            enableDoctor: this.enableDoctor,
            enableInvestigator: this.enableInvestigator,
            enableJoker: this.enableJoker,
            enableLovers: this.enableLovers
        };
    }
}

// Game state
let gameState = {
    isHost: false,
    gameCode: '',
    playerName: '',
    players: [],
    gameId: null,
    settings: new GameSettings()
};

// Reference to the current game in Firebase
let gameRef = null;

// Initialize
function init() {
    // Add event listeners
    hostBtn.addEventListener('click', hostGame);
    joinBtn.addEventListener('click', showJoinScreen);
    backToMainHostBtn.addEventListener('click', backToMain);
    backToMainJoinBtn.addEventListener('click', backToMain);
    joinGameBtn.addEventListener('click', joinGame);
    leaveGameBtn.addEventListener('click', leaveGame);
    endGameBtn.addEventListener('click', endGame);
    backToMainFromGameBtn.addEventListener('click', () => {
        cleanupGame();
        localStorage.removeItem('mafiaGameState');
        backToMain();
    });
    
    // Game settings event listeners
    mafiaMinusBtn.addEventListener('click', () => {
        if (mafiaCountInput.value > parseInt(mafiaCountInput.min)) {
            mafiaCountInput.value = parseInt(mafiaCountInput.value) - 1;
            updateGameSettings();
        }
    });
    
    mafiaPlusBtn.addEventListener('click', () => {
        if (mafiaCountInput.value < parseInt(mafiaCountInput.max)) {
            mafiaCountInput.value = parseInt(mafiaCountInput.value) + 1;
            updateGameSettings();
        }
    });
    
    mafiaCountInput.addEventListener('change', updateGameSettings);
    enableDoctorToggle.addEventListener('change', updateGameSettings);
    enableInvestigatorToggle.addEventListener('change', updateGameSettings);
    enableJokerToggle.addEventListener('change', updateGameSettings);
    enableLoversToggle.addEventListener('change', updateGameSettings);
    
    // Check for saved host game state
    const savedHostState = localStorage.getItem('mafiaGameState');
    if (savedHostState) {
        try {
            const parsedState = JSON.parse(savedHostState);
            if (parsedState.isHost && parsedState.gameCode) {
                // Reconnect to Firebase game
                const gameCode = parsedState.gameCode;
                gameRef = database.ref('games/' + gameCode);
                
                // Check if game still exists
                gameRef.once('value')
                    .then((snapshot) => {
                        if (snapshot.exists()) {
                            const gameData = snapshot.val();
                            
                            // Restore game state
                            gameState = {
                                isHost: true,
                                gameCode: gameCode,
                                playerName: 'Host',
                                players: Object.values(gameData.players || {})
                            };
                            
                            // Listen for player joins
                            gameRef.child('players').on('value', (snapshot) => {
                                if (snapshot.exists()) {
                                    const playersData = snapshot.val();
                                    gameState.players = Object.values(playersData);
                                    updatePlayersList();
                                }
                            });
                            
                            // Listen for game status changes
                            gameRef.child('status').on('value', (snapshot) => {
                                if (snapshot.exists()) {
                                    const status = snapshot.val();
                                    if (status === 'in_progress') {
                                        // Game has started, show host game view
                                        showHostGameView();
                                    }
                                }
                            });
                            
                            // Update UI
                            showHostScreen();
                            gameCodeDisplay.textContent = gameCode;
                            updatePlayersList();
                        } else {
                            // Game no longer exists
                            localStorage.removeItem('mafiaGameState');
                        }
                    })
                    .catch((error) => {
                        console.error('Error reconnecting to game:', error);
                        localStorage.removeItem('mafiaGameState');
                    });
            }
        } catch (e) {
            console.error('Error parsing saved game state:', e);
            localStorage.removeItem('mafiaGameState');
        }
    }
    
    // Check for saved player game state
    const savedPlayerState = localStorage.getItem('mafiaPlayerState');
    if (savedPlayerState) {
        try {
            const parsedState = JSON.parse(savedPlayerState);
            if (!parsedState.isHost && parsedState.gameCode && parsedState.playerId) {
                // Could reconnect player here if needed
                // For now, we'll just clear it to avoid stale connections
                localStorage.removeItem('mafiaPlayerState');
            }
        } catch (e) {
            console.error('Error parsing saved player state:', e);
            localStorage.removeItem('mafiaPlayerState');
        }
    }
}

// Generate a random 4-digit alphanumeric code
function generateGameCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters
    let code = '';
    for (let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters[randomIndex];
    }
    return code;
}

// Host a new game
function hostGame() {
    const gameCode = generateGameCode();
    
    gameState = {
        isHost: true,
        gameCode: gameCode,
        playerName: 'Host',
        players: [],
        settings: new GameSettings()
    };
    
    // Create a new game in Firebase
    gameRef = database.ref('games/' + gameCode);
    
    // Set initial game data
    gameRef.set({
        gameCode: gameCode,
        host: 'Host',
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {},
        settings: gameState.settings
    });
    
    // Update settings in Firebase when changed
    updateGameSettings();
    
    // Listen for player joins
    gameRef.child('players').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const playersData = snapshot.val();
            gameState.players = Object.values(playersData);
            updatePlayersList();
        }
    });
    
    // Save game state locally as backup
    localStorage.setItem('mafiaGameState', JSON.stringify({
        isHost: true,
        gameCode: gameCode
    }));
    
    // Update UI
    showHostScreen();
    gameCodeDisplay.textContent = gameCode;
}

// Show host screen
function showHostScreen() {
    mainMenu.classList.add('hidden');
    joinScreen.classList.add('hidden');
    hostScreen.classList.remove('hidden');
}

// Show join screen
function showJoinScreen() {
    mainMenu.classList.add('hidden');
    hostScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
}

// Back to main menu
function backToMain() {
    hostScreen.classList.add('hidden');
    joinScreen.classList.add('hidden');
    playerLobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    hostGameView.classList.add('hidden');
    mainMenu.classList.remove('hidden');
}

// Join a game
function joinGame() {
    const playerName = playerNameInput.value.trim();
    const gameCode = gameCodeInput.value.trim().toUpperCase();
    
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    if (!gameCode || gameCode.length !== 4) {
        alert('Please enter a valid 4-digit game code');
        return;
    }
    
    // Check if game exists in Firebase
    const gameRef = database.ref('games/' + gameCode);
    
    gameRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                // Game exists, join it
                const gameData = snapshot.val();
                
                if (gameData.status === 'in_progress') {
                    alert('This game has already started. You cannot join.');
                    return;
                }
                
                // Create player object
                const playerId = 'player_' + Date.now();
                const player = new Player(playerId, playerName);
                const playerData = player.toJSON();
                playerData.joinTime = firebase.database.ServerValue.TIMESTAMP;
                
                // Add player to the game
                gameRef.child('players/' + playerId).set(playerData);
                
                // Set local game state
                gameState = {
                    isHost: false,
                    gameCode: gameCode,
                    playerName: playerName,
                    playerId: playerId
                };
                
                localStorage.setItem('mafiaPlayerState', JSON.stringify(gameState));
                
                // Show the player lobby screen
                showPlayerLobby(gameCode, playerName);
                
                // Listen for game status changes
                gameRef.child('status').on('value', (snapshot) => {
                    if (snapshot.exists()) {
                        const status = snapshot.val();
                        if (status === 'in_progress') {
                            // Game has started, get player role and show game screen
                            gameRef.child('players/' + playerId).once('value', (playerSnapshot) => {
                                if (playerSnapshot.exists()) {
                                    const playerData = playerSnapshot.val();
                                    showGameScreen(playerData.role);
                                }
                            });
                        }
                    }
                });
                
                // Listen for player updates in the lobby
                gameRef.child('players').on('value', (snapshot) => {
                    if (snapshot.exists()) {
                        const playersData = snapshot.val();
                        updateLobbyPlayersList(Object.values(playersData));
                    }
                });
            } else {
                alert(`Game with code ${gameCode} does not exist!`);
            }
        })
        .catch((error) => {
            console.error('Error joining game:', error);
            alert('Error joining game. Please try again.');
        });
}

// Update the list of connected players (for host)
function updatePlayersList() {
    connectedPlayersList.innerHTML = '';
    
    if (!gameState.players || gameState.players.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Waiting for players to join...';
        connectedPlayersList.appendChild(li);
        return;
    }
    
    gameState.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        if (player.isHost) {
            li.textContent += ' (Host)';
            li.classList.add('host');
        }
        connectedPlayersList.appendChild(li);
    });
    
    // Enable start game button if enough players have joined
    if (gameState.players.length >= 3) {
        startGameBtn.disabled = false;
    } else {
        startGameBtn.disabled = true;
    }
    
    // Add event listener to start game button if it's not already added
    if (gameState.isHost && !startGameBtn.hasStartGameListener) {
        startGameBtn.addEventListener('click', startGame);
        startGameBtn.hasStartGameListener = true;
    }
}

// Start the game
function startGame() {
    if (gameState.players.length < 3) {
        alert('You need at least 3 players to start the game.');
        return;
    }
    
    // Assign roles based on game settings
    assignRoles();
    
    // Update game status and player data in Firebase
    const playersObj = {};
    gameState.players.forEach(player => {
        playersObj[player.id] = player;
    });
    
    gameRef.update({
        status: 'in_progress',
        startedAt: firebase.database.ServerValue.TIMESTAMP,
        players: playersObj
    });
    
    // Show host game view
    showHostGameView();
}

// Show host game view with all players and their roles
function showHostGameView() {
    if (!gameState.isHost) return;
    
    hostScreen.classList.add('hidden');
    mainMenu.classList.add('hidden');
    joinScreen.classList.add('hidden');
    playerLobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    hostGameView.classList.remove('hidden');
    
    hostGameCodeDisplay.textContent = gameState.gameCode;
    
    // Display all players and their roles
    updatePlayersRolesList();
}

// Update the list of players and their roles in the host view
function updatePlayersRolesList() {
    playersRolesList.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerRoleItem = document.createElement('div');
        playerRoleItem.className = 'player-role-item';
        
        const playerName = document.createElement('div');
        playerName.className = 'player-name';
        playerName.textContent = player.name;
        
        const playerRoleElement = document.createElement('div');
        playerRoleElement.className = 'player-role role-' + player.role;
        playerRoleElement.textContent = player.role.charAt(0).toUpperCase() + player.role.slice(1);
        
        playerRoleItem.appendChild(playerName);
        playerRoleItem.appendChild(playerRoleElement);
        playersRolesList.appendChild(playerRoleItem);
    });
}

// End the game
function endGame() {
    if (!gameState.isHost || !gameRef) return;
    
    gameRef.update({
        status: 'ended',
        endedAt: firebase.database.ServerValue.TIMESTAMP
    });
    
    alert('Game ended!');
    backToMain();
}

// Function to update game settings in Firebase
function updateGameSettings() {
    if (!gameState.isHost || !gameRef) return;
    
    gameState.settings.mafiaCount = parseInt(mafiaCountInput.value);
    gameState.settings.enableDoctor = enableDoctorToggle.checked;
    gameState.settings.enableInvestigator = enableInvestigatorToggle.checked;
    gameState.settings.enableJoker = enableJokerToggle.checked;
    gameState.settings.enableLovers = enableLoversToggle.checked;
    
    gameRef.child('settings').set(gameState.settings);
}

// Show player lobby screen
function showPlayerLobby(gameCode, playerName) {
    mainMenu.classList.add('hidden');
    joinScreen.classList.add('hidden');
    hostScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    playerLobbyScreen.classList.remove('hidden');
    
    playerGameCodeDisplay.textContent = gameCode;
    playerNameDisplay.textContent = playerName;
}

// Update the list of players in the lobby
function updateLobbyPlayersList(players) {
    lobbyPlayersList.innerHTML = '';
    
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        if (player.isHost) {
            li.textContent += ' (Host)';
            li.classList.add('host');
        }
        lobbyPlayersList.appendChild(li);
    });
}

// Show game screen with player's role
function showGameScreen(role) {
    mainMenu.classList.add('hidden');
    joinScreen.classList.add('hidden');
    hostScreen.classList.add('hidden');
    playerLobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    playerRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    playerRole.className = 'role-display role-' + role;
    
    // Set role description
    switch(role) {
        case ROLES.CIVILIAN:
            roleDescription.textContent = 'You are a Civilian. Try to identify the Mafia members and vote them out!';
            break;
        case ROLES.MAFIA:
            roleDescription.textContent = 'You are a Mafia member. Eliminate the civilians without getting caught!';
            break;
        case ROLES.DOCTOR:
            roleDescription.textContent = 'You are the Doctor. You can save one person each night from being eliminated!';
            break;
        case ROLES.INVESTIGATOR:
            roleDescription.textContent = 'You are the Investigator. You can investigate one player each night to learn their role!';
            break;
        case ROLES.JOKER:
            roleDescription.textContent = 'You are the Joker. Your goal is to get voted out by the other players!';
            break;
        case ROLES.LOVER:
            roleDescription.textContent = 'You are the Lover. You will be able to choose another player to be your lover. If either of you dies, both die!';
            break;
    }
}

// Leave the game
function leaveGame() {
    if (gameState.playerId && gameRef) {
        gameRef.child('players/' + gameState.playerId).remove();
        gameRef.off(); // Remove all listeners
        localStorage.removeItem('mafiaPlayerState');
    }
    
    backToMain();
}

// Assign roles to players
function assignRoles() {
    const players = gameState.players;
    const settings = gameState.settings;
    const roles = [];
    
    // Add mafia roles
    for (let i = 0; i < settings.mafiaCount; i++) {
        roles.push(ROLES.MAFIA);
    }
    
    // Add special roles if enabled
    if (settings.enableDoctor) roles.push(ROLES.DOCTOR);
    if (settings.enableInvestigator) roles.push(ROLES.INVESTIGATOR);
    if (settings.enableJoker) roles.push(ROLES.JOKER);
    if (settings.enableLovers) roles.push(ROLES.LOVER); // Only one lover role
    
    // Fill remaining slots with civilians
    while (roles.length < players.length) {
        roles.push(ROLES.CIVILIAN);
    }
    
    // Shuffle roles
    shuffleArray(roles);
    
    // Assign roles to players
    for (let i = 0; i < players.length; i++) {
        players[i].role = roles[i];
    }
}

// Get random indices from an array
function getRandomIndices(max, count) {
    const indices = [];
    while (indices.length < count) {
        const index = Math.floor(Math.random() * max);
        if (!indices.includes(index)) {
            indices.push(index);
        }
    }
    return indices;
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Handle player disconnection
function handleDisconnection() {
    // If player is in a game, set up a disconnect handler
    if (gameRef) {
        // For host: Remove the game when disconnected
        if (gameState.isHost) {
            gameRef.onDisconnect().remove();
        }
        // For player: Remove the player from the game when disconnected
        else if (gameState.playerId) {
            gameRef.child('players/' + gameState.playerId).onDisconnect().remove();
        }
    }
}

// Clean up Firebase listeners when leaving a game
function cleanupGame() {
    if (gameRef) {
        // Cancel all listeners
        gameRef.off();
        
        // Cancel onDisconnect operations
        gameRef.onDisconnect().cancel();
        
        gameRef = null;
    }
}

// Add cleanup to back button
backToMainHostBtn.addEventListener('click', () => {
    cleanupGame();
    localStorage.removeItem('mafiaGameState');
    backToMain();
});

// Initialize the app
document.addEventListener('DOMContentLoaded', init);

// Set up disconnect handler when page is loaded
window.addEventListener('beforeunload', () => {
    // This ensures players are properly removed when they close the browser
    handleDisconnection();
});