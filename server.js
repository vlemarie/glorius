import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { RESOURCE_CONFIG, PLAYER_STATS, BUILDINGS, UNIT_CONFIG } from './js/Config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const round2 = (num) => Math.round(num * 100) / 100;

// CONFIGURATION STATS BASE
const P_BASE_MAX_HP = PLAYER_STATS?.MAX_HP || 100;
const P_BASE_DMG = PLAYER_STATS?.SWORD_DAMAGE || 20;
const P_KNOCKBACK = PLAYER_STATS?.KNOCKBACK_FORCE || 1.5;

const TREE_HP = RESOURCE_CONFIG?.TREE_HP || 50;
const ROCK_HP = RESOURCE_CONFIG?.ROCK_HP || 50;
const PIG_HP = RESOURCE_CONFIG?.PIG_HP || 100;
const REWARD_FOOD = RESOURCE_CONFIG?.REWARD_FOOD || 15;

const PIG_SPEED = 0.12; 
const MAX_MOVE_DIST = 2.0; 

// --- VARIABLES GLOBALES ---
const resources = [];
const buildings = []; 
const mobs = []; 
const mercenaries = []; 

let mercIdCounter = 0;
let buildingIdCounter = 0; 
let globalResourceIdCounter = 0; 
let globalMobIdCounter = 0;

const MAP_SIZE = 300;

class GameRoom {
    constructor(roomId) {
        this.id = roomId;
        this.players = {};
        this.lastNetworkUpdate = 0;
    }
}
const games = new Map();

// --- CHECK COLLISION (MODIFIÉ POUR LES PORTES) ---
// Ajout du paramètre ignoreOwnerId
function checkServerCollision(x, z, customRadius = null, ignoreOwnerId = null) {
    const entityRadius = customRadius || 0.5; 

    for (const b of buildings) {
        // 1. Si la porte est ouverte, tout le monde passe
        if (b.isOpen) continue;

        // 2. Si c'est une PORTE et qu'elle appartient à l'entité qui se déplace, on passe
        if (ignoreOwnerId && b.type === 'DOOR' && b.ownerId === ignoreOwnerId) continue;

        let w = b.radius * 2; 
        let d = b.radius * 2;
        const conf = BUILDINGS[b.type];
        if (conf) {
            w = conf.width; d = conf.depth;
            // Rotation 90°
            if (Math.abs(b.angle - Math.PI/2) < 0.1 || Math.abs(b.angle + Math.PI/2) < 0.1) {
                w = conf.depth; d = conf.width;
            }
        }
        
        // Marge de sécurité (+0.2)
        if (Math.abs(x - b.x) < (w/2 + entityRadius + 0.2) && Math.abs(z - b.z) < (d/2 + entityRadius + 0.2)) {
            return true; 
        }
    }

    for (const r of resources) {
        const dx = x - r.x;
        const dz = z - r.z;
        if (dx*dx + dz*dz < (entityRadius + r.radius + 0.2)**2) {
            return true; 
        }
    }
    
    return false;
}

// --- FONCTION DE SÉCURITÉ : TROUVER UNE POSITION LIBRE ---
function findValidPosition(requiredRadius = 1.0) {
    let attempts = 0;
    const maxAttempts = 50; 

    while (attempts < maxAttempts) {
        attempts++;
        // --- NOUVEAU : GÉNÉRATION CIRCULAIRE ---
        // 1. On tire un rayon au hasard (max 140 pour garder une marge avec l'eau)
        const radius = Math.sqrt(Math.random()) * 140;
        // 2. On tire un angle au hasard
        const angle = Math.random() * Math.PI * 2;

        // 3. On convertit en X et Z
        const x = round2(Math.cos(angle) * radius);
        const z = round2(Math.sin(angle) * radius);
        // ---------------------------------------

        // (On garde le reste des vérifications de collision inchangées)
        if (checkServerCollision(x, z, requiredRadius)) continue;

        let tooCloseToPlayer = false;
        games.forEach(room => {
            for (const pid in room.players) {
                const p = room.players[pid];
                const dist = Math.sqrt((x - p.x)**2 + (z - p.z)**2);
                if (dist < 8.0) { 
                    tooCloseToPlayer = true;
                    break;
                }
            }
        });
        if (tooCloseToPlayer) continue;

        let tooCloseToMob = false;
        for (const m of mobs) {
             const dist = Math.sqrt((x - m.x)**2 + (z - m.z)**2);
             if (dist < 2.0) { tooCloseToMob = true; break; }
        }
        if (tooCloseToMob) continue;

        return { x, z }; 
    }
    return null; 
}

// --- FONCTIONS DE SPAWN ---
function spawnResource(type) {
    let scale = 1;
    let hp = 10;
    let radius = 1;

    if (type === 'tree') {
        scale = 0.8 + Math.random() * 0.4;
        hp = TREE_HP;
        radius = 0.4 * scale;
    } else if (type === 'rock') {
        scale = 1.2 + Math.random() * 2.5;
        hp = ROCK_HP;
        radius = 0.8 * scale;
    }

    const pos = findValidPosition(radius);
    if (pos) {
        const newRes = { 
            id: `res_${globalResourceIdCounter++}`, 
            type: type, 
            x: pos.x, z: pos.z, 
            scale: scale, hp: hp, maxHp: hp,
            radius: radius 
        };
        resources.push(newRes);
        io.emit('objectSpawned', { type: 'RESOURCE', data: newRes });
    }
}

function spawnMob(type) {
    if (type === 'pig') {
        const pos = findValidPosition(0.8);
        if (pos) {
            const newMob = { 
                id: `mob_pig_${globalMobIdCounter++}`, 
                type: 'pig', 
                x: pos.x, z: pos.z, 
                angle: Math.random() * Math.PI * 2,
                hp: PIG_HP, maxHp: PIG_HP,
                scale: 0.8 + Math.random() * 0.3, radius: 0.8,
                state: 'IDLE', fleeTimer: 0, moveTimer: 0
            };
            mobs.push(newMob);
        }
    }
}

// --- GÉNÉRATION INITIALE ---
console.log("Génération du monde...");
for(let i=0; i<40; i++) spawnResource('tree');
for(let i=0; i<20; i++) spawnResource('rock');
for(let i=0; i<15; i++) spawnMob('pig');
console.log("Monde généré !");

// --- FONCTION LEVEL UP ---
function addXp(player, amount, socket) {
    player.xp += amount;
    const xpNeeded = PLAYER_STATS.BASE_XP_TO_LEVEL * player.level;
    
    let leveledUp = false;
    while (player.xp >= xpNeeded) {
        player.xp -= xpNeeded;
        player.level++;
        leveledUp = true;
        player.maxHp = P_BASE_MAX_HP + (player.level - 1) * PLAYER_STATS.HP_PER_LEVEL;
        player.hp = player.maxHp; 
    }
    
    socket.emit('updateXp', {
        xp: player.xp,
        maxXp: PLAYER_STATS.BASE_XP_TO_LEVEL * player.level,
        level: player.level
    });

    if (leveledUp) {
        io.to(socket.roomName).emit('floatingText', { x: player.x, z: player.z, text: "LEVEL UP!", type: 'gold' });
        io.to(socket.roomName).emit('systemMessage', { text: `${player.name} est passé niveau ${player.level} !` });
        io.to(socket.roomName).emit('updatePlayerHp', { id: player.id, hp: player.hp, maxHp: player.maxHp });
    }
}

// --- BOUCLE PRINCIPALE (GAME LOOP) ---
setInterval(() => {
    const now = Date.now();

    // 1. IA DES MOBS
    mobs.forEach(mob => {
        if (mob.state === 'FLEE') {
            mob.fleeTimer -= 50;
            mob.x += Math.sin(mob.angle) * PIG_SPEED * 3; 
            mob.z += Math.cos(mob.angle) * PIG_SPEED * 3;
            if (mob.fleeTimer <= 0) mob.state = 'IDLE';
        } else {
            mob.moveTimer -= 50;
            if (mob.moveTimer <= 0) {
                mob.angle = Math.random() * Math.PI * 2;
                mob.moveTimer = 2000 + Math.random() * 3000; 
            }
            mob.x += Math.sin(mob.angle) * (PIG_SPEED * 0.2); 
            mob.z += Math.cos(mob.angle) * (PIG_SPEED * 0.2);
        }
        const dist = Math.sqrt(mob.x * mob.x + mob.z * mob.z);
        const maxDist = 145; // Rayon max autorisé pour les mobs

        if (dist > maxDist) {
            // Si le cochon va trop loin, on le ramène au bord du cercle
            const ratio = maxDist / dist;
            mob.x *= ratio;
            mob.z *= ratio;
            
            // Petit bonus : on le fait se retourner vers le centre
            mob.angle += Math.PI; 
        }
        // -----------------------------------
    });

    // 2. IA DES MERCENAIRES
    for (let i = mercenaries.length - 1; i >= 0; i--) {
        const merc = mercenaries[i];
        const room = games.get(merc.roomName);
        if (!room) continue; 
        
        const owner = room.players[merc.ownerId];

        if (!owner || owner.hp <= 0) {
            mercenaries.splice(i, 1);
            io.to(merc.roomName).emit('mercDestroyed', { id: merc.id });
            continue;
        }

        let target = null;
        if (owner.lastTargetId && (now - owner.lastTargetTime < 5000)) {
            if (room.players[owner.lastTargetId]) target = room.players[owner.lastTargetId];
            else {
                const mobT = mobs.find(m => m.id === owner.lastTargetId);
                if (mobT) target = mobT;
                else {
                    const resT = resources.find(r => r.id === owner.lastTargetId);
                    if (resT) target = resT;
                }
            }
        }

        let destX = owner.x;
        let destZ = owner.z;
        let targetRadius = 0.5;

        if (target && target.hp > 0) {
            destX = target.x;
            destZ = target.z;
            if (target.radius) targetRadius = target.radius; 
            const stopDist = targetRadius + 0.8; 
            const dist = Math.sqrt((merc.x - target.x)**2 + (merc.z - target.z)**2);
            const effectiveAttackRange = UNIT_CONFIG.MERCENARY.ATTACK_RANGE + targetRadius;

            if (dist <= effectiveAttackRange) {
                if (now - merc.lastAttackTime > UNIT_CONFIG.MERCENARY.ATTACK_COOLDOWN) {
                    merc.lastAttackTime = now;
                    io.to(merc.roomName).emit('mercAttack', { id: merc.id });
                    io.to(merc.roomName).emit('hitEffect', { x: target.x, z: target.z, id: target.id });
                    
                    if (target.type === 'tree' || target.type === 'rock') {
                        target.hp -= 1; 
                        let gain = 1;
                        let typeRes = (target.type === 'tree') ? 'wood' : 'stone'; 
                        if (target.type === 'tree') owner.inventory.wood += gain;
                        else owner.inventory.stone += gain;
                        if(io.sockets.sockets.get(owner.id)) io.sockets.sockets.get(owner.id).emit('updateInventory', owner.inventory);
                        io.to(merc.roomName).emit('floatingText', { x: target.x, z: target.z, text: `+${gain}`, type: typeRes });

                        if (target.hp <= 0) {
                            const idx = resources.indexOf(target);
                            const typeToRespawn = target.type; 
                            if (idx !== -1) resources.splice(idx, 1);
                            io.to(merc.roomName).emit('resourceDestroyed', { id: target.id });
                            spawnResource(typeToRespawn); 
                        }
                    }
                    else if (target.id.startsWith('mob_')) {
                        target.hp -= UNIT_CONFIG.MERCENARY.DAMAGE;
                        target.state = 'FLEE'; target.fleeTimer = 2000;
                        if (target.hp <= 0) {
                             owner.inventory.food += RESOURCE_CONFIG.REWARD_FOOD;
                             if(io.sockets.sockets.get(owner.id)) io.sockets.sockets.get(owner.id).emit('updateInventory', owner.inventory);
                             io.to(merc.roomName).emit('floatingText', { x: target.x, z: target.z, text: `+${RESOURCE_CONFIG.REWARD_FOOD}`, type: 'food' });
                             const idx = mobs.indexOf(target);
                             if (idx !== -1) mobs.splice(idx, 1);
                             io.to(merc.roomName).emit('mobDestroyed', { id: target.id });
                             spawnMob('pig');
                        }
                    } 
                    // ... (dans la boucle setInterval, partie Mercenaires) ...

                    else if (target.hp !== undefined && target.id !== owner.id) { 
                        target.hp -= UNIT_CONFIG.MERCENARY.DAMAGE;
                        // On utilise merc.roomName au lieu de socket.roomName
                        io.to(merc.roomName).emit('updatePlayerHp', { id: target.id, hp: target.hp, maxHp: target.maxHp });
                        
                        if (target.hp <= 0) {
                            // CORRECTION ICI : Utiliser merc.roomName
                            io.to(merc.roomName).emit('systemMessage', { text: `☠️ ${target.name} tué par le mercenaire de ${owner.name}` });
                            
                            // Mort des mercenaires de la victime
                            for (let i = mercenaries.length - 1; i >= 0; i--) {
                                if (mercenaries[i].ownerId === target.id) {
                                    // CORRECTION ICI : Utiliser merc.roomName ou socket.roomName n'est pas dispo
                                    io.to(merc.roomName).emit('mercDestroyed', { id: mercenaries[i].id });
                                    mercenaries.splice(i, 1);
                                }
                            }
                            
                            target.xp = 0; target.level = 1; target.maxHp = P_BASE_MAX_HP; target.hp = target.maxHp;     
                            target.x = (Math.random()-0.5)*50; target.z = (Math.random()-0.5)*50;
                            
                            // Respawn de la victime
                            const targetSocket = io.sockets.sockets.get(target.id);
                            if (targetSocket) {
                                targetSocket.emit('respawn', { x: target.x, z: target.z, hp: target.hp });
                                targetSocket.emit('updateXp', { xp: 0, maxXp: PLAYER_STATS.BASE_XP_TO_LEVEL, level: 1 });
                            }
                            
                            io.to(merc.roomName).emit('updatePlayerHp', { id: target.id, hp: target.hp, maxHp: target.maxHp });
                            
                            // CORRECTION XP : On doit récupérer le socket du propriétaire (owner) pour addXp
                            // car 'attacker' n'est pas défini ici (c'est 'owner') et 'socket' n'existe pas.
                            const ownerSocket = io.sockets.sockets.get(owner.id);
                            if (ownerSocket) {
                                addXp(owner, RESOURCE_CONFIG.XP_KILL_PLAYER, ownerSocket);
                            }
                        }
                    }
                }
            }
            
            const dx = destX - merc.x;
            const dz = destZ - merc.z;
            const distToDest = Math.sqrt(dx*dx + dz*dz);

            if (distToDest > stopDist) {
                merc.angle = Math.atan2(dx, dz);
                const moveStep = UNIT_CONFIG.MERCENARY.SPEED;
                const nextX = merc.x + Math.sin(merc.angle) * moveStep;
                const nextZ = merc.z + Math.cos(merc.angle) * moveStep;

                // --- MODIF : On passe l'ownerId pour traverser les portes ---
                if (!checkServerCollision(nextX, nextZ, null, merc.ownerId)) {
                    merc.x = nextX; merc.z = nextZ;
                } else {
                    if (!checkServerCollision(nextX, merc.z, null, merc.ownerId)) merc.x = nextX; 
                    else if (!checkServerCollision(merc.x, nextZ, null, merc.ownerId)) merc.z = nextZ; 
                }
            }
        } else {
            // Follow logic
             const dx = destX - merc.x;
            const dz = destZ - merc.z;
            const distToDest = Math.sqrt(dx*dx + dz*dz);
             if (distToDest > 2.5) {
                merc.angle = Math.atan2(dx, dz);
                const moveStep = UNIT_CONFIG.MERCENARY.SPEED;
                const nextX = merc.x + Math.sin(merc.angle) * moveStep;
                const nextZ = merc.z + Math.cos(merc.angle) * moveStep;
                
                // --- MODIF ICI AUSSI ---
                if (!checkServerCollision(nextX, nextZ, null, merc.ownerId)) { merc.x = nextX; merc.z = nextZ; }
                else {
                    if (!checkServerCollision(nextX, merc.z, null, merc.ownerId)) merc.x = nextX; 
                    else if (!checkServerCollision(merc.x, nextZ, null, merc.ownerId)) merc.z = nextZ; 
                }
            }
        }
        
        // Répulsion
        for (const other of mercenaries) {
            if (other.id === merc.id) continue; 
            const distX = merc.x - other.x;
            const distZ = merc.z - other.z;
            const distSq = distX*distX + distZ*distZ;
            if (distSq < 2.64 && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const pushX = distX / dist;
                const pushZ = distZ / dist;
                const newX = merc.x + pushX * 0.05;
                const newZ = merc.z + pushZ * 0.05;
                // --- MODIF ICI AUSSI ---
                if (!checkServerCollision(newX, newZ, null, merc.ownerId)) { merc.x = newX; merc.z = newZ; }
            }
        }
    }

    buildings.forEach(b => {
        if (b.type === 'GOLD_TOWER') {
            // Vérifie si 10 secondes (10000 ms) se sont écoulées
            if (now - b.lastGoldGeneration >= 10000) {
                b.lastGoldGeneration = now; // Reset timer

                // Retrouver le propriétaire
                const room = games.get(b.roomName);
                if (room) {
                    const owner = room.players[b.ownerId];
                    if (owner) {
                        // Ajout de l'or
                        owner.inventory.gold = (owner.inventory.gold || 0) + 15;
                        
                        // Envoi de la mise à jour au joueur
                        const ownerSocket = io.sockets.sockets.get(owner.id);
                        if (ownerSocket) {
                            ownerSocket.emit('updateInventory', owner.inventory);
                        }

                        // Effet visuel pour tout le monde ("+15 Gold")
                        io.to(b.roomName).emit('floatingText', { 
                            x: b.x, 
                            z: b.z, 
                            text: "+15 Or", 
                            type: 'gold' 
                        });
                    }
                }
            }
        }
    });

    // 3. BROADCAST
    games.forEach((room, roomId) => {
        for (const pid in room.players) {
            const p = room.players[pid];
            if (p.hp < p.maxHp && (now - p.lastDamageTime > PLAYER_STATS.REGEN_DELAY)) {
                p.hp += PLAYER_STATS.REGEN_SPEED;
                if (p.hp > p.maxHp) p.hp = p.maxHp;
            }
        }

        if (now - room.lastNetworkUpdate >= 50) { 
            const leaderboard = Object.values(room.players)
                .sort((a, b) => (b.inventory.gold || 0) - (a.inventory.gold || 0))
                .slice(0, 10)
                .map(p => ({ 
                    id: p.id, 
                    name: p.name, 
                    gold: p.inventory.gold || 0 
                }));
            const simplePlayers = {};
            for(const pid in room.players) {
                const p = room.players[pid];
                simplePlayers[pid] = {
                    id: p.id, name: p.name, 
                    x: round2(p.x), z: round2(p.z), 
                    angle: round2(p.angle || 0),
                    level: p.level,
                    hp: p.hp,
                    maxHp: p.maxHp
                };
            }
            const simpleMobs = mobs.map(m => ({
                id: m.id, type: m.type,
                x: round2(m.x), z: round2(m.z),
                angle: round2(m.angle),
                scale: round2(m.scale),
                hp: m.hp, maxHp: m.maxHp
            }));
            const roomMercs = mercenaries.filter(m => m.roomName === roomId).map(m => ({
                id: m.id, ownerId: m.ownerId,
                x: round2(m.x), z: round2(m.z),
                angle: round2(m.angle),
                hp: m.hp, maxHp: m.maxHp
            }));
            io.to(roomId).emit('worldUpdate', {
                players: simplePlayers,
                mobs: simpleMobs,
                mercs: roomMercs,
                leaderboard: leaderboard
            });
            room.lastNetworkUpdate = now;
        }
    });
}, 50);

io.on('connection', (socket) => {
    console.log("Joueur connecté");
    socket.emit('mapData', { resources: resources, buildings: buildings });

    socket.on('requestJoin', (data) => {
        const cleanName = (data.name || "Survivor").substring(0, 12).replace(/[^a-zA-Z0-9 ]/g, ""); 
        const roomName = "MainWorld";
        if (!games.has(roomName)) games.set(roomName, new GameRoom(roomName));
        const room = games.get(roomName);

        socket.join(roomName);
        socket.roomName = roomName;

        const newPlayer = {
            id: socket.id, 
            name: cleanName,
            x: 0, z: 0, angle: 0,
            hp: P_BASE_MAX_HP, 
            maxHp: P_BASE_MAX_HP,
            inventory: { wood: 0, stone: 0, gold: 0, food: 0 },
            xp: 0, level: 1, lastDamageTime: 0 
        };
        room.players[socket.id] = newPlayer;

        socket.emit('init', { 
            selfId: socket.id, name: cleanName,
            resources: resources, buildings: buildings,
            xp: newPlayer.xp, level: newPlayer.level, maxXp: PLAYER_STATS.BASE_XP_TO_LEVEL * newPlayer.level,
            hp: newPlayer.hp, maxHp: newPlayer.maxHp
        });
        io.to(roomName).emit('systemMessage', { text: `${cleanName} a rejoint.` });
    });

    socket.on('move', (data) => {
        const room = games.get(socket.roomName);
        if (room && room.players[socket.id]) {
            const p = room.players[socket.id];
            const dx = data.x - p.x;
            const dz = data.z - p.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < MAX_MOVE_DIST) {
                p.x = data.x; p.z = data.z; p.angle = data.angle;
            }
        }
    });

    socket.on('requestBuild', (data) => {
        const room = games.get(socket.roomName);
        if (!room || !room.players[socket.id]) return;
        const p = room.players[socket.id];
        const type = data.type;
        const buildConf = BUILDINGS[type]; 
        if (!buildConf) return;

        // Vérification distance (Code existant)
        if (Math.abs(data.x - p.x) > 8 || Math.abs(data.z - p.z) > 8) return;

        // --- NOUVEAU CODE DÉBUT ---
        // Vérification spécifique pour la Tour à Or (Distance entre tours)
        if (type === 'GOLD_TOWER' && buildConf.minDistance) {
            for (const b of buildings) {
                // On vérifie seulement contre les autres tours de la MEME salle (room)
                if (b.roomName === socket.roomName && b.type === 'GOLD_TOWER') {
                    const dist = Math.sqrt((b.x - data.x)**2 + (b.z - data.z)**2);
                    if (dist < buildConf.minDistance) {
                        socket.emit('systemMessage', { text: "Construction impossible : Trop proche d'une autre Tour à Or !" });
                        return; // On annule la construction
                    }
                }
            }
        }

        // Vérification du coût (Le Mur Pierre et la Tour Or utilisent Wood + Stone)
        if (p.inventory.wood >= buildConf.cost.wood && p.inventory.stone >= buildConf.cost.stone) {
            
            // Déduire le coût
            p.inventory.wood -= buildConf.cost.wood;
            p.inventory.stone -= buildConf.cost.stone;

            const bRad = Math.min(buildConf.width, buildConf.depth) / 2;
            
            const newBuilding = {
                id: `b_${buildingIdCounter++}`,
                type: type,
                x: data.x, z: data.z, angle: data.angle,
                hp: buildConf.hp, maxHp: buildConf.hp,
                ownerId: socket.id, 
                isOpen: false,
                radius: bRad,
                // --- AJOUTS POUR LA TOUR A OR ---
                roomName: socket.roomName,   // Important pour retrouver la salle
                lastGoldGeneration: Date.now() // Démarre le timer tout de suite
            };
            
            buildings.push(newBuilding);
            io.to(socket.roomName).emit('buildingPlaced', newBuilding);
            socket.emit('updateInventory', p.inventory);
        }
    });

    socket.on('actionHit', (data) => {
        const room = games.get(socket.roomName);
        if (!room || !room.players[socket.id]) return;
        const attacker = room.players[socket.id];
        const attackAngle = (data && data.angle !== undefined) ? data.angle : attacker.angle;
        
        const CURRENT_DMG = P_BASE_DMG + (attacker.level - 1) * PLAYER_STATS.DMG_PER_LEVEL;

        socket.to(socket.roomName).emit('playerAttack', { id: socket.id });

        const MAX_RANGE = 3.2;     
        const BASE_ANGLE = 1.4;   
        let candidates = [];
        const checkRange = MAX_RANGE + 1.5; 

        for (const pid in room.players) {
            if (pid === socket.id) continue;
            const p = room.players[pid];
            if (Math.abs(p.x - attacker.x) > checkRange || Math.abs(p.z - attacker.z) > checkRange) continue;
            candidates.push({ type: 'PLAYER', obj: p, x: p.x, z: p.z, radius: 0.5 });
        }
        for (const r of resources) {
            if (Math.abs(r.x - attacker.x) > checkRange || Math.abs(r.z - attacker.z) > checkRange) continue;
            candidates.push({ type: 'RESOURCE', obj: r, x: r.x, z: r.z, radius: r.radius });
        }
        for (const b of buildings) {
            if (Math.abs(b.x - attacker.x) > checkRange || Math.abs(b.z - attacker.z) > checkRange) continue;
            const rad = b.radius || 0.5;
            candidates.push({ type: 'BUILDING', obj: b, x: b.x, z: b.z, radius: rad });
        }
        for (const m of mobs) {
            if (Math.abs(m.x - attacker.x) > checkRange || Math.abs(m.z - attacker.z) > checkRange) continue;
            candidates.push({ type: 'MOB', obj: m, x: m.x, z: m.z, radius: m.radius });
        }
        for (const merc of mercenaries) {
            if (merc.roomName !== socket.roomName) continue;
            if (merc.ownerId === socket.id) continue; 
            if (Math.abs(merc.x - attacker.x) > checkRange || Math.abs(merc.z - attacker.z) > checkRange) continue;
            candidates.push({ type: 'MERCENARY', obj: merc, x: merc.x, z: merc.z, radius: 0.5 });
        }

        let validHits = [];
        for (const c of candidates) {
            const dx = c.x - attacker.x;
            const dz = c.z - attacker.z;
            const distCenter = Math.sqrt(dx*dx + dz*dz);
            const distHit = Math.max(0, distCenter - c.radius);
            
            if (distHit > MAX_RANGE) continue;
            const angleToTarget = Math.atan2(dx, dz);
            let angleDiff = angleToTarget - attackAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            if (Math.abs(angleDiff) > BASE_ANGLE / 2 && distHit > 1.0) continue;
            validHits.push({ candidate: c, dist: distHit });
        }

        validHits.sort((a, b) => a.dist - b.dist);

        if (validHits.length > 0) {
            const hit = validHits[0];
            const target = hit.candidate.obj;
            attacker.lastTargetId = target.id;
            attacker.lastTargetTime = Date.now();
            const type = hit.candidate.type;

            io.to(socket.roomName).emit('hitEffect', { x: hit.candidate.x, z: hit.candidate.z, id: target.id });

            if (type === 'PLAYER') {
                target.hp -= CURRENT_DMG;
                target.lastDamageTime = Date.now();
                
                let dx = target.x - attacker.x;
                let dz = target.z - attacker.z;
                let dist = Math.sqrt(dx*dx + dz*dz) || 1;
                
                const pushX = (dx/dist) * P_KNOCKBACK;
                const pushZ = (dz/dist) * P_KNOCKBACK;
                const nextX = target.x + pushX;
                const nextZ = target.z + pushZ;

                // --- OPTIONNEL : Le joueur peut aussi traverser ses portes lors du knockback ---
                // if (!checkServerCollision(nextX, nextZ, null, target.id)) { ... }
                if (!checkServerCollision(nextX, nextZ)) {
                    target.x = nextX; target.z = nextZ;
                }
                
                io.to(target.id).emit('knockback', { x: target.x, z: target.z });
                io.to(socket.roomName).emit('updatePlayerHp', { id: target.id, hp: target.hp, maxHp: target.maxHp });

                if (target.hp <= 0) {
                    io.to(socket.roomName).emit('systemMessage', { text: `☠️ ${target.name} tué par ${attacker.name} (Lvl ${attacker.level})` });

                    // MORT DES MERCENAIRES
                    for (let i = mercenaries.length - 1; i >= 0; i--) {
                        if (mercenaries[i].ownerId === target.id) {
                            io.to(socket.roomName).emit('mercDestroyed', { id: mercenaries[i].id });
                            mercenaries.splice(i, 1);
                        }
                    }
                    
                    target.xp = 0; target.level = 1; target.maxHp = P_BASE_MAX_HP; target.hp = target.maxHp;     
                    target.x = (Math.random()-0.5)*50; target.z = (Math.random()-0.5)*50;
                    io.to(target.id).emit('respawn', { x: target.x, z: target.z, hp: target.hp });
                    io.to(target.id).emit('updateXp', { xp: 0, maxXp: PLAYER_STATS.BASE_XP_TO_LEVEL, level: 1 });
                    io.to(socket.roomName).emit('updatePlayerHp', { id: target.id, hp: target.hp, maxHp: target.maxHp });
                    addXp(attacker, RESOURCE_CONFIG.XP_KILL_PLAYER, socket);
                }
            }
            else if (type === 'RESOURCE') {
                target.hp -= 1; 
                let gain = 1; 
                let resType = (target.type === 'tree') ? 'wood' : 'stone';
                addXp(attacker, (target.type === 'tree') ? RESOURCE_CONFIG.XP_TREE : RESOURCE_CONFIG.XP_ROCK, socket);
                if (resType === 'wood') attacker.inventory.wood += gain;
                else attacker.inventory.stone += gain;
                socket.emit('updateInventory', attacker.inventory);
                io.to(socket.roomName).emit('floatingText', { x: target.x, z: target.z, text: `+${gain}`, type: resType });
                if (target.hp <= 0) {
                    const idx = resources.indexOf(target);
                    const typeToRespawn = target.type;
                    if (idx !== -1) resources.splice(idx, 1);
                    io.to(socket.roomName).emit('resourceDestroyed', { id: target.id });
                    spawnResource(typeToRespawn);
                }
            }
            else if (type === 'MOB') { 
                target.hp -= CURRENT_DMG;
                const dx = target.x - attacker.x;
                const dz = target.z - attacker.z;
                target.angle = Math.atan2(dx, dz);
                target.state = 'FLEE'; target.fleeTimer = 2000;
                addXp(attacker, RESOURCE_CONFIG.XP_PIG, socket);
                if (target.hp <= 0) {
                    attacker.inventory.food += REWARD_FOOD;
                    socket.emit('updateInventory', attacker.inventory);
                    io.to(socket.roomName).emit('floatingText', { x: target.x, z: target.z, text: `+${REWARD_FOOD}`, type: 'food' });
                    addXp(attacker, RESOURCE_CONFIG.XP_KILL_PIG, socket);
                    const idx = mobs.indexOf(target);
                    if (idx !== -1) mobs.splice(idx, 1);
                    io.to(socket.roomName).emit('mobDestroyed', { id: target.id });
                    spawnMob('pig');
                }
            }
            else if (type === 'BUILDING') {
                target.hp -= CURRENT_DMG;
                if (target.hp <= 0) {
                    const idx = buildings.indexOf(target);
                    if (idx !== -1) buildings.splice(idx, 1);
                    io.to(socket.roomName).emit('buildingDestroyed', { id: target.id });
                }
            }
            else if (type === 'MERCENARY') {
                target.hp -= CURRENT_DMG;
                const dx = target.x - attacker.x;
                const dz = target.z - attacker.z;
                const dist = Math.sqrt(dx*dx + dz*dz) || 1;
                target.x += (dx/dist) * 0.5; target.z += (dz/dist) * 0.5;
                if (target.hp <= 0) {
                    const idx = mercenaries.indexOf(target);
                    if (idx !== -1) mercenaries.splice(idx, 1);
                    io.to(socket.roomName).emit('mercDestroyed', { id: target.id });
                    addXp(attacker, 20, socket); 
                    io.to(socket.roomName).emit('floatingText', { x: target.x, z: target.z, text: "KILLED", type: 'gold' });
                }
            }
        }
    });

    socket.on('requestBuyMercenary', () => {
        const room = games.get(socket.roomName);
        if (!room || !room.players[socket.id]) return;
        const p = room.players[socket.id];
        if (p.inventory.food >= UNIT_CONFIG.MERCENARY.COST) {
            p.inventory.food -= UNIT_CONFIG.MERCENARY.COST;
            socket.emit('updateInventory', p.inventory);
            const merc = {
                id: `merc_${mercIdCounter++}`,
                roomName: socket.roomName,
                ownerId: socket.id,
                x: p.x + (Math.random()-0.5)*2,
                z: p.z + (Math.random()-0.5)*2,
                angle: p.angle,
                hp: UNIT_CONFIG.MERCENARY.HP, maxHp: UNIT_CONFIG.MERCENARY.HP,
                lastAttackTime: 0
            };
            mercenaries.push(merc);
            io.to(socket.roomName).emit('floatingText', { x: p.x, z: p.z, text: "-15 Food", type: 'food' });
        } else {
             socket.emit('systemMessage', { text: "Pas assez de nourriture (15 requis) !" });
        }
    });
    
    socket.on('chatMessage', (msg) => {
        const room = games.get(socket.roomName);
        if (room && room.players[socket.id]) io.to(socket.roomName).emit('chatMessage', { name: room.players[socket.id].name, text: msg.substring(0, 100) });
    });
    socket.on('disconnect', () => {
        const room = games.get(socket.roomName);
        if (room && room.players[socket.id]) delete room.players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 SERVER READY -> http://localhost:${PORT}`));