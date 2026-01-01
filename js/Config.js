
export const GAME_VERSION = "v0.8.0 (ALPHA)";
export const CONFIG = {
    PLAYER_SPEED: 0.20,
    PIG_SPEED: 0.12,
    BROADCAST_RATE: 50
};

export const BOUNDS = { 
    xMin: -150, xMax: 150, zMin: -150, zMax: 150 
    // Avant : -100, 100. Cela correspond maintenant à MAP_SIZE = 300
};

export const UNIT_CONFIG = {
    MERCENARY: {
        COST: 15,
        HP: 80,
        DAMAGE: 10,
        SPEED: 0.50,      // Un peu moins vite que le joueur
        ATTACK_RANGE: 2.0,
        ATTACK_COOLDOWN: 800
    }
};

export const RESOURCE_CONFIG = {
    TREE_HP: 50,
    ROCK_HP: 50,
    PIG_HP: 100,
    REWARD_WOOD: 5,
    REWARD_STONE: 3,
    REWARD_FOOD: 15,
    // --- NOUVEAU : XP ---
    XP_TREE: 5,  // XP par coup sur un arbre
    XP_ROCK: 10,  // XP par coup sur un rocher
    XP_PIG: 10,   // XP par coup sur un cochon (ou kill)
    XP_KILL_PIG: 20, // XP bonus si on tue le cochon
    XP_KILL_PLAYER: 100
};

export const PLAYER_STATS = {
    MAX_HP: 100,
    REGEN_DELAY: 5000,   // 5 secondes sans dégâts avant de soigner
    REGEN_SPEED: 0.2,    // PV rendus par tick serveur (50ms). 0.2 * 20 ticks = 4 PV/seconde
    SWORD_DAMAGE: 20,
    ATTACK_RANGE: 3.5,
    ATTACK_COOLDOWN: 500, 
    KNOCKBACK_FORCE: 1.5,
    // --- SYSTEME DE LEVEL ---
    BASE_XP_TO_LEVEL: 200, // XP requis pour passer niveau 2
    HP_PER_LEVEL: 20,      // +20 PV Max par niveau
    DMG_PER_LEVEL: 5       // +5 Dégâts par niveau
    
};

export const BUILDINGS = {
    WALL: {
        id: 'WALL', name: 'Mur de Bois', cost: { wood: 10, stone: 0 },
        hp: 100, width: 2, height: 2, depth: 0.5, color: 0x8B4513
    },
    WALL_STONE: {
        id: 'WALL_STONE', name: 'Mur de Pierre', cost: { wood: 0, stone: 15 },
        hp: 300, width: 2, height: 2, depth: 0.5, color: 0x7f8c8d 
    },
    DOOR: {
        id: 'DOOR', name: 'Porte', cost: { wood: 15, stone: 0 },
        hp: 150, width: 2, height: 2, depth: 0.2, color: 0x3E2723
    },
    // --- AJOUT ---
    GOLD_TOWER: {
        id: 'GOLD_TOWER', name: 'Tour à Or', cost: { wood: 40, stone: 40 },
        hp: 600, width: 2.5, height: 5, depth: 2.5, color: 0xFFD700, // Or
        minDistance: 4 // <-- AJOUTEZ CECI (Distance minimale entre deux tours)
    }
};
