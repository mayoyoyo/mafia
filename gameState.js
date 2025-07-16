import { ROLES, Player, GameSettings, shuffleArray } from './models.js';

// Game state singleton
class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.isHost = false;
        this.gameCode = '';
        this.playerName = '';
        this.playerId = null;
        this.players = [];
        this.settings = new GameSettings();
        this.status = 'waiting'; // waiting, in_progress, ended
    }

    setAsHost(gameCode) {
        this.isHost = true;
        this.gameCode = gameCode;
        this.playerName = 'Host';
        this.players = [];
    }

    setAsPlayer(gameCode, playerName, playerId) {
        this.isHost = false;
        this.gameCode = gameCode;
        this.playerName = playerName;
        this.playerId = playerId;
    }

    updatePlayers(playersData) {
        if (Array.isArray(playersData)) {
            this.players = playersData;
        } else if (playersData && typeof playersData === 'object') {
            this.players = Object.values(playersData);
        } else {
            this.players = [];
        }
    }

    updateSettings(settings) {
        if (settings) {
            this.settings = settings;
        }
    }

    getHostData() {
        return {
            isHost: true,
            gameCode: this.gameCode
        };
    }

    getPlayerData() {
        return {
            isHost: false,
            gameCode: this.gameCode,
            playerName: this.playerName,
            playerId: this.playerId
        };
    }

    // Assign roles to players based on game settings
    assignRoles() {
        if (!this.players || this.players.length === 0) return;
        
        const roles = [];
        
        // Add mafia roles
        for (let i = 0; i < this.settings.mafiaCount; i++) {
            roles.push(ROLES.MAFIA);
        }
        
        // Add special roles if enabled
        if (this.settings.enableDoctor) roles.push(ROLES.DOCTOR);
        if (this.settings.enableInvestigator) roles.push(ROLES.INVESTIGATOR);
        if (this.settings.enableJoker) roles.push(ROLES.JOKER);
        if (this.settings.enableLovers) roles.push(ROLES.LOVER); // Only one lover role
        
        // Fill remaining slots with civilians
        while (roles.length < this.players.length) {
            roles.push(ROLES.CIVILIAN);
        }
        
        // Shuffle roles
        shuffleArray(roles);
        
        // Assign roles to players
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].role = roles[i];
        }

        return this.players;
    }

    // Get current player's role
    getCurrentPlayerRole() {
        if (this.isHost) return null;
        
        const currentPlayer = this.players.find(player => player.id === this.playerId);
        return currentPlayer ? currentPlayer.role : null;
    }

    // Convert players to object format for Firebase
    getPlayersObject() {
        const playersObj = {};
        this.players.forEach(player => {
            playersObj[player.id] = player;
        });
        return playersObj;
    }
}

// Create and export singleton instance
const gameState = new GameState();
export default gameState;