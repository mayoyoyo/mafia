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

// Helper functions
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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

function generateGameCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters
    let code = '';
    for (let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters[randomIndex];
    }
    return code;
}

// Export models and functions
export { ROLES, Player, GameSettings, shuffleArray, getRandomIndices, generateGameCode };