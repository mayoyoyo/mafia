import gameState from './gameState.js';
import firebaseService from './firebase.js';

// DOM Elements
const mainMenu = document.querySelector('.main-menu');
const hostScreen = document.getElementById('host-screen');
const joinScreen = document.getElementById('join-screen');
const playerLobbyScreen = document.getElementById('player-lobby');
const gameScreen = document.getElementById('game-screen');
const hostGameView = document.getElementById('host-game-view');

// Buttons
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const backToMainHostBtn = document.getElementById('back-to-main-host');
const backToMainJoinBtn = document.getElementById('back-to-main-join');
const joinGameBtn = document.getElementById('join-game-btn');
const startGameBtn = document.getElementById('start-game-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');
const endGameBtn = document.getElementById('end-game-btn');
const backToMainFromGameBtn = document.getElementById('back-to-main-from-game');

// Input and display elements
const gameCodeDisplay = document.getElementById('game-code');
const playerGameCodeDisplay = document.getElementById('player-game-code');
const hostGameCodeDisplay = document.getElementById('host-game-code-display');
const gameCodeInput = document.getElementById('game-code-input');
const playerNameInput = document.getElementById('player-name');
const playerNameDisplay = document.getElementById('player-name-display');
const connectedPlayersList = document.getElementById('connected-players');
const lobbyPlayersList = document.getElementById('lobby-players-list');
const gamePlayersList = document.getElementById('game-players-list');
const playersRolesList = document.getElementById('players-roles-list');
const playerRole = document.getElementById('player-role');
const roleDescription = document.getElementById('role-description');
const gamePlayerName = document.getElementById('game-player-name');

// Game settings elements
const mafiaCountInput = document.getElementById('mafia-count');
const mafiaMinusBtn = document.querySelector('.minus-btn');
const mafiaPlusBtn = document.querySelector('.plus-btn');
const enableDoctorToggle = document.getElementById('enable-doctor');
const enableInvestigatorToggle = document.getElementById('enable-investigator');
const enableJokerToggle = document.getElementById('enable-joker');
const enableLoversToggle = document.getElementById('enable-lovers');

// UI Service
const uiService = {
    // Initialize UI
    init() {
        // Add event listeners
        hostBtn.addEventListener('click', this.handleHostGame.bind(this));
        joinBtn.addEventListener('click', this.showJoinScreen.bind(this));
        backToMainHostBtn.addEventListener('click', this.handleBackToMain.bind(this));
        backToMainJoinBtn.addEventListener('click', this.handleBackToMain.bind(this));
        joinGameBtn.addEventListener('click', this.handleJoinGame.bind(this));
        leaveGameBtn.addEventListener('click', this.handleLeaveGame.bind(this));
        endGameBtn.addEventListener('click', this.handleEndGame.bind(this));
        backToMainFromGameBtn.addEventListener('click', this.handleBackToMainFromGame.bind(this));
        
        // Game settings event listeners
        mafiaMinusBtn.addEventListener('click', () => {
            if (mafiaCountInput.value > parseInt(mafiaCountInput.min)) {
                mafiaCountInput.value = parseInt(mafiaCountInput.value) - 1;
                this.updateGameSettings();
            }
        });
        
        mafiaPlusBtn.addEventListener('click', () => {
            if (mafiaCountInput.value < parseInt(mafiaCountInput.max)) {
                mafiaCountInput.value = parseInt(mafiaCountInput.value) + 1;
                this.updateGameSettings();
            }
        });
        
        mafiaCountInput.addEventListener('change', this.updateGameSettings.bind(this));
        enableDoctorToggle.addEventListener('change', this.updateGameSettings.bind(this));
        enableInvestigatorToggle.addEventListener('change', this.updateGameSettings.bind(this));
        enableJokerToggle.addEventListener('change', this.updateGameSettings.bind(this));
        enableLoversToggle.addEventListener('change', this.updateGameSettings.bind(this));
        
        // Add event listener to start game button
        startGameBtn.addEventListener('click', this.handleStartGame.bind(this));
    },
    
    // Show host screen
    showHostScreen() {
        mainMenu.classList.add('hidden');
        joinScreen.classList.add('hidden');
        playerLobbyScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        hostGameView.classList.add('hidden');
        hostScreen.classList.remove('hidden');
        
        // Update UI with game code
        gameCodeDisplay.textContent = gameState.gameCode;
        
        // Update settings UI
        this.updateSettingsUI();
    },
    
    // Show join screen
    showJoinScreen() {
        mainMenu.classList.add('hidden');
        hostScreen.classList.add('hidden');
        playerLobbyScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        hostGameView.classList.add('hidden');
        joinScreen.classList.remove('hidden');
    },
    
    // Show player lobby screen
    showPlayerLobby() {
        mainMenu.classList.add('hidden');
        joinScreen.classList.add('hidden');
        hostScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        hostGameView.classList.add('hidden');
        playerLobbyScreen.classList.remove('hidden');
        
        playerGameCodeDisplay.textContent = gameState.gameCode;
        playerNameDisplay.textContent = gameState.playerName;
    },
    
    // Show game screen with player's role
    showGameScreen() {
        mainMenu.classList.add('hidden');
        joinScreen.classList.add('hidden');
        hostScreen.classList.add('hidden');
        playerLobbyScreen.classList.add('hidden');
        hostGameView.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        // Get current player's role
        const role = gameState.getCurrentPlayerRole();
        console.log("Current player role:", role);
        
        if (!role) {
            console.error("No role found for current player");
            return;
        }
        
        // Display player name
        gamePlayerName.textContent = gameState.playerName;
        
        // Display player role
        playerRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        playerRole.className = 'role-display role-' + role;
        
        // Set role description
        this.setRoleDescription(role);
    },
    
    // Show host game view with all players and their roles
    showHostGameView() {
        if (!gameState.isHost) return;
        
        mainMenu.classList.add('hidden');
        joinScreen.classList.add('hidden');
        hostScreen.classList.add('hidden');
        playerLobbyScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        hostGameView.classList.remove('hidden');
        
        hostGameCodeDisplay.textContent = gameState.gameCode;
        
        // Display all players and their roles
        this.updatePlayersRolesList();
    },
    
    // Back to main menu
    backToMain() {
        hostScreen.classList.add('hidden');
        joinScreen.classList.add('hidden');
        playerLobbyScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        hostGameView.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    },
    
    // Update the list of connected players (for host)
    updatePlayersList() {
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
        startGameBtn.disabled = gameState.players.length < 3;
    },
    
    // Update the list of players in the lobby
    updateLobbyPlayersList() {
        lobbyPlayersList.innerHTML = '';
        
        gameState.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            if (player.isHost) {
                li.textContent += ' (Host)';
                li.classList.add('host');
            }
            lobbyPlayersList.appendChild(li);
        });
    },
    
    // Update the list of players and their roles in the host view
    updatePlayersRolesList() {
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
    },
    
    // Set role description based on role
    setRoleDescription(role) {
        switch(role) {
            case 'civilian':
                roleDescription.textContent = 'You are a Civilian. Try to identify the Mafia members and vote them out!';
                break;
            case 'mafia':
                roleDescription.textContent = 'You are a Mafia member. Eliminate the civilians without getting caught!';
                break;
            case 'doctor':
                roleDescription.textContent = 'You are the Doctor. You can save one person each night from being eliminated!';
                break;
            case 'investigator':
                roleDescription.textContent = 'You are the Investigator. You can investigate one player each night to learn their role!';
                break;
            case 'joker':
                roleDescription.textContent = 'You are the Joker. Your goal is to get voted out by the other players!';
                break;
            case 'lover':
                roleDescription.textContent = 'You are the Lover. You will be able to choose another player to be your lover. If either of you dies, both die!';
                break;
            default:
                roleDescription.textContent = 'Role description not available.';
        }
    },
    
    // Update game settings from UI
    updateGameSettings() {
        if (!gameState.isHost) return;
        
        gameState.settings.mafiaCount = parseInt(mafiaCountInput.value);
        gameState.settings.enableDoctor = enableDoctorToggle.checked;
        gameState.settings.enableInvestigator = enableInvestigatorToggle.checked;
        gameState.settings.enableJoker = enableJokerToggle.checked;
        gameState.settings.enableLovers = enableLoversToggle.checked;
        
        firebaseService.updateSettings();
    },
    
    // Update settings UI from game state
    updateSettingsUI() {
        mafiaCountInput.value = gameState.settings.mafiaCount;
        enableDoctorToggle.checked = gameState.settings.enableDoctor;
        enableInvestigatorToggle.checked = gameState.settings.enableInvestigator;
        enableJokerToggle.checked = gameState.settings.enableJoker;
        enableLoversToggle.checked = gameState.settings.enableLovers;
    },
    
    // Event Handlers
    handleHostGame() {
        firebaseService.createGame()
            .then(() => {
                this.showHostScreen();
                
                // Set up Firebase listeners
                firebaseService.setupGameListeners({
                    onPlayersUpdate: () => this.updatePlayersList(),
                    onGameStart: () => this.showHostGameView()
                });
                
                // Set up disconnect handler
                firebaseService.setupDisconnectHandlers();
            })
            .catch(error => {
                console.error('Error creating game:', error);
                alert('Error creating game. Please try again.');
            });
    },
    
    handleJoinGame() {
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
        
        firebaseService.joinGame(gameCode, playerName)
            .then(() => {
                this.showPlayerLobby();
                
                // Set up Firebase listeners
                firebaseService.setupGameListeners({
                    onPlayersUpdate: () => this.updateLobbyPlayersList(),
                    onGameStart: () => this.showGameScreen()
                });
                
                // Set up disconnect handler
                firebaseService.setupDisconnectHandlers();
            })
            .catch(error => {
                alert(error.message);
            });
    },
    
    handleStartGame() {
        firebaseService.startGame()
            .then(() => {
                console.log('Game started successfully');
            })
            .catch(error => {
                alert(error.message);
            });
    },
    
    handleLeaveGame() {
        firebaseService.leaveGame()
            .then(() => {
                this.backToMain();
            })
            .catch(error => {
                console.error('Error leaving game:', error);
                alert('Error leaving game. Please try again.');
            });
    },
    
    handleEndGame() {
        firebaseService.endGame()
            .then(() => {
                this.backToMain();
            })
            .catch(error => {
                console.error('Error ending game:', error);
                alert('Error ending game. Please try again.');
            });
    },
    
    handleBackToMain() {
        firebaseService.cleanup();
        this.backToMain();
    },
    
    handleBackToMainFromGame() {
        firebaseService.cleanup();
        localStorage.removeItem('mafiaGameState');
        this.backToMain();
    }
};

export default uiService;