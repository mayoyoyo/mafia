import gameState from './gameState.js';
import firebaseService from './firebase.js';
import uiService from './ui.js';

// Main application entry point
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    uiService.init();
    
    // Check for saved host game state
    const savedHostState = localStorage.getItem('mafiaGameState');
    if (savedHostState) {
        try {
            const parsedState = JSON.parse(savedHostState);
            if (parsedState.isHost && parsedState.gameCode) {
                // Reconnect to Firebase game
                firebaseService.reconnectToGame(parsedState.gameCode, true)
                    .then(success => {
                        if (success) {
                            // Set up Firebase listeners
                            firebaseService.setupGameListeners({
                                onPlayersUpdate: () => uiService.updatePlayersList(),
                                onGameStart: () => uiService.showHostGameView()
                            });
                            
                            // Update UI
                            if (gameState.status === 'in_progress') {
                                uiService.showHostGameView();
                            } else {
                                uiService.showHostScreen();
                            }
                            
                            // Set up disconnect handler
                            firebaseService.setupDisconnectHandlers();
                        } else {
                            localStorage.removeItem('mafiaGameState');
                        }
                    })
                    .catch(error => {
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
                // Reconnect to Firebase game
                firebaseService.reconnectToGame(parsedState.gameCode, false, parsedState.playerId)
                    .then(success => {
                        if (success) {
                            // Set up Firebase listeners
                            firebaseService.setupGameListeners({
                                onPlayersUpdate: () => uiService.updateLobbyPlayersList(),
                                onGameStart: () => uiService.showGameScreen()
                            });
                            
                            // Update UI
                            if (gameState.status === 'in_progress') {
                                uiService.showGameScreen();
                            } else {
                                uiService.showPlayerLobby();
                            }
                            
                            // Set up disconnect handler
                            firebaseService.setupDisconnectHandlers();
                        } else {
                            localStorage.removeItem('mafiaPlayerState');
                        }
                    })
                    .catch(error => {
                        console.error('Error reconnecting to game:', error);
                        localStorage.removeItem('mafiaPlayerState');
                    });
            }
        } catch (e) {
            console.error('Error parsing saved player state:', e);
            localStorage.removeItem('mafiaPlayerState');
        }
    }
    
    // Set up disconnect handler when page is loaded
    window.addEventListener('beforeunload', () => {
        // This ensures players are properly removed when they close the browser
        firebaseService.setupDisconnectHandlers();
    });
});