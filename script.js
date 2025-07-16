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
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const backToMainHostBtn = document.getElementById('back-to-main-host');
const backToMainJoinBtn = document.getElementById('back-to-main-join');
const gameCodeDisplay = document.getElementById('game-code');
const gameCodeInput = document.getElementById('game-code-input');
const playerNameInput = document.getElementById('player-name');
const joinGameBtn = document.getElementById('join-game-btn');
const startGameBtn = document.getElementById('start-game-btn');
const connectedPlayersList = document.getElementById('connected-players');

// Game state
let gameState = {
    isHost: false,
    gameCode: '',
    playerName: '',
    players: [],
    gameId: null
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
        players: [{
            id: 'host',
            name: 'Host',
            isHost: true,
            joinTime: Date.now()
        }]
    };
    
    // Create a new game in Firebase
    gameRef = database.ref('games/' + gameCode);
    
    // Set initial game data
    gameRef.set({
        gameCode: gameCode,
        host: 'Host',
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: gameState.players
    });
    
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
                const playerData = {
                    id: playerId,
                    name: playerName,
                    isHost: false,
                    joinTime: firebase.database.ServerValue.TIMESTAMP
                };
                
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
                
                alert(`Joined game ${gameCode} as ${playerName}!`);
                
                // In a real implementation, we would redirect to a waiting screen
                // For now, we'll just go back to the main menu
                backToMain();
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
    
    // Update game status in Firebase
    gameRef.update({
        status: 'in_progress',
        startedAt: firebase.database.ServerValue.TIMESTAMP
    });
    
    // In a real implementation, we would assign roles and redirect to the game screen
    alert('Game started! In a complete implementation, roles would be assigned here.');
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