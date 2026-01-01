import * as THREE from 'three';
import { scene, camera, gameData } from './Globals.js';
import { CONFIG, BOUNDS, BUILDINGS, PLAYER_STATS, GAME_VERSION } from './Config.js';
import { Actor } from './Classes.js';
import { 
    initWorld, loadEnvironment, destroyResource, playHitEffect, 
    createBuilding, destroyBuilding, groundMesh, 
    worldBuildings, setDoorState, createPigMesh, createMercenaryMesh, worldMercenaries, destroyMercenary, addResource
} from './World.js';
import { createFloatingText } from './Utils.js';
import { InputManager } from './InputManager.js';
import { UIManager } from './UIManager.js'; // Import
import { Physics } from './Physics.js';     // Import

const GAME_MAP_SIZE = 300; 

const socket = io();
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

// --- INSTANCIATION DES MANAGERS ---
const inputManager = new InputManager();
const uiManager = new UIManager(GAME_MAP_SIZE);
const physics = new Physics();

gameData.mobs = new Map();

// Variables d'état local
let lastAttackTime = 0;
let buildMode = null; 
let ghostMesh = null; 
let buildAngle = 0; 
let currentItemIndex = 0;
const HOTBAR_ITEMS = ['SWORD', 'WALL', 'DOOR', 'WALL_STONE', 'GOLD_TOWER'];

// Setup Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement);

// Setup Camera
camera.position.set(0, 45, 35);
camera.lookAt(0, 0, 5);
scene.background = new THREE.Color(0x87CEEB); 
document.getElementById('ui-version').innerText = GAME_VERSION;

initWorld();

// --- GESTION INPUTS (VIA MANAGER) ---

inputManager.onAction = (action, payload) => {
    switch(action) {
        case 'SELECT_SLOT': window.selectBuilding(payload); break;
        case 'BUY_MERCENARY': socket.emit('requestBuyMercenary'); break;
        case 'ROTATE_BUILDING':
            buildAngle += Math.PI / 2;
            if (buildAngle >= Math.PI) buildAngle = 0; 
            if (ghostMesh) ghostMesh.rotation.y = buildAngle;
            break;
        case 'CANCEL_BUILD': window.selectBuilding('SWORD'); break;
    }
};

inputManager.onScroll = (direction) => {
    if (direction > 0) {
        currentItemIndex++; if (currentItemIndex >= HOTBAR_ITEMS.length) currentItemIndex = 0;
    } else {
        currentItemIndex--; if (currentItemIndex < 0) currentItemIndex = HOTBAR_ITEMS.length - 1;
    }
    window.selectBuilding(HOTBAR_ITEMS[currentItemIndex]);
};

inputManager.onMouseClick = (type) => {
    if (type === 'LEFT_DOWN') {
        if (buildMode) {
            // Utilisation de Physics pour valider
            if (ghostMesh && physics.isPlacementValid(ghostMesh.position.x, ghostMesh.position.z, buildAngle, buildMode)) {
                socket.emit('requestBuild', { 
                    type: buildMode, x: ghostMesh.position.x, z: ghostMesh.position.z, angle: buildAngle 
                });
            }
        } else {
            tryAttack(); 
        }
    }
};

// --- LOGIQUE JEU LOCALE ---

window.selectBuilding = (type) => {
    const newIndex = HOTBAR_ITEMS.indexOf(type);
    if (newIndex !== -1) currentItemIndex = newIndex;

    uiManager.setActiveSlot(type); // Appel UI Manager

    if (type === 'SWORD') {
        toggleBuildMode(null);
    } else {
        toggleBuildMode(type);
        uiManager.toggleBuildInstructions(true, type); // Appel UI Manager
    }
};

function toggleBuildMode(type) {
    if (buildMode === type) type = null;
    buildMode = type;
    if (ghostMesh) { scene.remove(ghostMesh); ghostMesh = null; }
    uiManager.toggleBuildInstructions(false); // Reset UI
    buildAngle = 0; 
    
    if (buildMode) {
        const conf = BUILDINGS[buildMode];
        const geo = new THREE.BoxGeometry(conf.width, conf.height, conf.depth);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.5, transparent: true });
        ghostMesh = new THREE.Mesh(geo, mat);
        ghostMesh.position.y = conf.height / 2;
        scene.add(ghostMesh);
        updateGhostPosition(); 
    }
}

function tryAttack() {
    if (buildMode || !gameData.player || !groundMesh) return;
    const now = Date.now();
    if (now - lastAttackTime >= PLAYER_STATS.ATTACK_COOLDOWN) {
        lastAttackTime = now;
        raycaster.setFromCamera(inputManager.mouse, camera);
        const intersects = raycaster.intersectObject(groundMesh);
        let attackAngle = gameData.player.mesh.rotation.y; 
        if (intersects.length > 0) {
            const targetPoint = intersects[0].point;
            const playerPos = gameData.player.mesh.position;
            attackAngle = Math.atan2(targetPoint.x - playerPos.x, targetPoint.z - playerPos.z);
            gameData.player.mesh.rotation.y = attackAngle; 
            gameData.player.targetAngle = attackAngle;
        }
        gameData.player.playAttack();
        socket.emit('actionHit', { angle: attackAngle });    
    }
}

function updateGhostPosition() {
    if (!buildMode || !ghostMesh || !groundMesh) return;
    raycaster.setFromCamera(inputManager.mouse, camera);
    const intersects = raycaster.intersectObject(groundMesh);
    if (intersects.length > 0) {
        const pt = intersects[0].point;
        ghostMesh.position.x = Math.round(pt.x);
        ghostMesh.position.z = Math.round(pt.z);
        // Utilisation de Physics
        const valid = physics.isPlacementValid(ghostMesh.position.x, ghostMesh.position.z, buildAngle, buildMode);
        ghostMesh.material.color.setHex(valid ? 0x00ff00 : 0xff0000);
    }
}

// --- SOCKETS (RESEAU) ---

document.getElementById('btn-play').addEventListener('click', () => {
    const name = document.getElementById('username-input').value.trim() || "Survivor";
    socket.emit('requestJoin', { name: name });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'block'; 
});

const chatInput = document.getElementById('chat-input');
if(chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && chatInput.value.trim() !== "") {
            socket.emit('chatMessage', chatInput.value);
            chatInput.value = '';
        }
    });
}

// Map Loading
socket.on('mapData', (data) => loadEnvironment(data));
socket.on('init', (data) => {
    loadEnvironment({ resources: data.resources, buildings: data.buildings });
    gameData.player = new Actor(data.name, 0, 0, data.hp, data.maxHp, data.level);
    gameData.player.id = data.selfId;
    gameData.actors.push(gameData.player);
    uiManager.updateXp(data.xp, data.maxXp, data.level); // UI
});

// Updates
socket.on('updateXp', (data) => {
    uiManager.updateXp(data.xp, data.maxXp, data.level); // UI
    if (gameData.player) {
        gameData.player.level = data.level;
        const newMaxHp = PLAYER_STATS.MAX_HP + (data.level - 1) * PLAYER_STATS.HP_PER_LEVEL;
        gameData.player.maxHp = newMaxHp;
        gameData.player.updateHpBar();
        gameData.player.setLevel(data.level);
    }
});

socket.on('updateInventory', (inv) => uiManager.updateInventory(inv)); // UI
socket.on('chatMessage', (data) => uiManager.addChatMessage(data.name, data.text, false)); // UI
socket.on('systemMessage', (data) => uiManager.addChatMessage(null, data.text, true)); // UI

socket.on('worldUpdate', (data) => {
    // 1. Players
    const playersData = data.players;
    if (data.leaderboard) {
        uiManager.updateLeaderboard(data.leaderboard);
    }
    for (const pid in playersData) {
        const pData = playersData[pid];
        if (gameData.player && pid === gameData.player.id) {
            if (pData.hp !== undefined) gameData.player.setHp(pData.hp, pData.maxHp);
            continue; 
        }
        let actor = gameData.actors.find(a => a.id === pid);
        if (!actor) {
            actor = new Actor(pData.name, pData.x, pData.z, pData.hp, pData.maxHp, pData.level);
            actor.id = pid;
            gameData.actors.push(actor);
        }
        actor.targetPos.set(pData.x, 0, pData.z);
        actor.targetAngle = pData.angle;
        if (pData.level && actor.level !== pData.level) actor.setLevel(pData.level);
        if (pData.hp !== undefined) actor.setHp(pData.hp, pData.maxHp);
    }
    // Nettoyage joueurs partis
    for (let i = gameData.actors.length - 1; i >= 0; i--) {
        const actor = gameData.actors[i];
        if (!playersData[actor.id] && actor !== gameData.player) {
            actor.destroy();
            gameData.actors.splice(i, 1);
        }
    }

    // 2. Mobs
    if (data.mobs) {
        data.mobs.forEach(mData => {
            let mobMesh = gameData.mobs.get(mData.id);
            if (!mobMesh) {
                if (mData.type === 'pig') {
                    mobMesh = createPigMesh(mData.scale);
                    mobMesh.position.set(mData.x, 0, mData.z); 
                    mobMesh.rotation.y = mData.angle;
                    scene.add(mobMesh);
                    mobMesh.userData = { 
                        targetX: mData.x, targetZ: mData.z, targetAngle: mData.angle,
                        hp: mData.hp, maxHp: mData.maxHp,
                        hpBar: mobMesh.userData.hpBar, hpFill: mobMesh.userData.hpFill
                    };
                    gameData.mobs.set(mData.id, mobMesh);
                }
            } else {
                mobMesh.userData.targetX = mData.x;
                mobMesh.userData.targetZ = mData.z;
                mobMesh.userData.targetAngle = mData.angle;
                mobMesh.userData.hp = mData.hp;
                mobMesh.userData.maxHp = mData.maxHp;
            }
        });
    }

    // 3. Mercs
    if (data.mercs) {
        const activeIds = new Set();
        data.mercs.forEach(m => {
            activeIds.add(m.id);
            let mesh = worldMercenaries.get(m.id);
            if (!mesh) mesh = createMercenaryMesh(m.id, m.x, m.z);
            mesh.userData.targetX = m.x;
            mesh.userData.targetZ = m.z;
            mesh.userData.targetAngle = m.angle;
            mesh.userData.hp = m.hp;
            mesh.userData.maxHp = m.maxHp;
        });
        worldMercenaries.forEach((val, key) => { if (!activeIds.has(key)) destroyMercenary(key); });
    }
});

// Événements ponctuels
socket.on('mercAttack', (data) => { const m = worldMercenaries.get(data.id); if(m) m.userData.attackTimer = 1.0; });
socket.on('mercDestroyed', (data) => destroyMercenary(data.id));
socket.on('mobDestroyed', (data) => {
    const mesh = gameData.mobs.get(data.id);
    if (mesh) { if (mesh.userData.hpBar) mesh.userData.hpBar.remove(); scene.remove(mesh); gameData.mobs.delete(data.id); }
});
socket.on('updateBuildingState', (data) => setDoorState(data.id, data.isOpen));
socket.on('buildingPlaced', (b) => createBuilding(b.id, b.type, b.x, b.z, b.angle, b.isOpen, b.ownerId));
socket.on('buildingDestroyed', (data) => destroyBuilding(data.id));
socket.on('resourceDestroyed', (data) => destroyResource(data.id));
socket.on('objectSpawned', (payload) => { if (payload.type === 'RESOURCE') addResource(payload.data); });

socket.on('playerAttack', (data) => { const a = gameData.actors.find(act => act.id === data.id); if (a) a.playAttack(); });
socket.on('hitEffect', (data) => {
    playHitEffect(data.id);
    const a = gameData.actors.find(act => act.id === data.id);
    if(a) a.charGroup.position.y += 0.2; 
});
socket.on('updatePlayerHp', (data) => { const a = gameData.actors.find(act => act.id === data.id); if (a) a.setHp(data.hp, data.maxHp); });
socket.on('respawn', (data) => {
    if (gameData.player) {
        gameData.player.mesh.position.set(data.x, 0, data.z);
        gameData.player.targetPos.set(data.x, 0, data.z);
        gameData.player.setHp(data.hp, data.hp); 
    }
});
socket.on('knockback', (data) => {
    if (gameData.player) {
        gameData.player.targetPos.set(data.x, 0, data.z);
        gameData.player.isKnockedBack = true;
        setTimeout(() => { gameData.player.isKnockedBack = false; }, 200);
    }
});
socket.on('floatingText', (data) => {
    let color = '#ffffff';
    if (data.type === 'wood') color = '#8B5A2B'; 
    if (data.type === 'stone') color = '#95a5a6'; 
    if (data.type === 'gold') color = '#FFD700'; 
    if (data.type === 'food') color = '#e91e63'; 
    createFloatingText(data.text, new THREE.Vector3(data.x, 0, data.z), color);
});

// --- MAIN LOOP ---

function animate() {
    requestAnimationFrame(animate);
    let dt = clock.getDelta();

    // --- AJOUT : SÉCURITÉ CONTRE LE LAG ---
    // Si l'onglet était inactif, dt peut être énorme (ex: 1.5s). 
    // On le force à 0.1s max (comme si on était à 10 FPS minimum) pour éviter la téléportation.
    if (dt > 0.1) dt = 0.1;

    if (buildMode) updateGhostPosition();
    if (inputManager.isMouseDown && !buildMode) tryAttack();
    

    // 1. Joueur Local
    if (gameData.player && gameData.player.mesh) {
        const p = gameData.player;
        if (p.isKnockedBack) {
            p.mesh.position.lerp(p.targetPos, 0.2); 
        } else {
            const move = (document.activeElement !== chatInput) ? inputManager.getMoveVector() : new THREE.Vector3(0,0,0);
            if (move.length() > 0) {
                p.targetAngle = Math.atan2(move.x, move.z);
                p.mesh.rotation.y = p.targetAngle;
                const speed = CONFIG.PLAYER_SPEED * (dt * 60); 
                
                const nextX = p.mesh.position.x + move.x * speed;
                // Utilisation de Physics
                if (!physics.checkCollision(nextX, p.mesh.position.z)) p.mesh.position.x = nextX;
                
                const nextZ = p.mesh.position.z + move.z * speed;
                // Utilisation de Physics
                if (!physics.checkCollision(p.mesh.position.x, nextZ)) p.mesh.position.z = nextZ;

                const dist = Math.sqrt(p.mesh.position.x ** 2 + p.mesh.position.z ** 2);
                
                // Le rayon de ton île d'herbe est de 150.
                // On met une limite un peu avant (148) pour ne pas dépasser le bord visuel.
                const maxRadius = 148; 

                if (dist > maxRadius) {
                    // Si on est trop loin, on ramène le joueur au bord du cercle
                    const ratio = maxRadius / dist;
                    p.mesh.position.x *= ratio;
                    p.mesh.position.z *= ratio;
                }
            }
            p.targetPos.copy(p.mesh.position);
        }
        socket.emit('move', { x: p.mesh.position.x, z: p.mesh.position.z, angle: p.targetAngle });
        camera.position.x = p.mesh.position.x;
        camera.position.z = p.mesh.position.z + 25; 
        camera.lookAt(p.mesh.position);
        p.update(true, dt);
    } else {
        const time = Date.now() * 0.0001;
        camera.position.x = Math.sin(time) * 60;
        camera.position.z = Math.cos(time) * 60;
        camera.position.y = 40; camera.lookAt(0, 0, 0);
    }
    
    // 2. Autres Entités
    gameData.actors.forEach(a => { if (a !== gameData.player) a.update(false, dt); });
    updateMobs(dt);
    updateMercenaries(dt);
    updateBuildingTransparency();
    const now = Date.now() * 0.002; // Temps pour le sinus
    worldBuildings.forEach(mesh => {
        if (mesh.userData.isGoldTower && mesh.userData.crystal) {
            // Rotation du cristal
            mesh.userData.crystal.rotation.y += 0.02;
            // Flottement haut/bas
            mesh.userData.crystal.position.y = (BUILDINGS.GOLD_TOWER.height + 1.2) + Math.sin(now) * 0.2;
        }
    });

    // 3. UI Updates
    uiManager.drawMinimap(); // Appel UI Manager
    renderer.render(scene, camera);
}

// J'ai extrait ces petites boucles pour aérer animate()
// --- DANS Main.js ---

function updateMobs(dt) {
    gameData.mobs.forEach(mesh => {
        // 1. Interpolation de position (inchangé)
        const speedFactor = 5.0 * dt; 
        const oldPos = mesh.position.clone(); // Pour calculer si on bouge vraiment

        mesh.position.x += (mesh.userData.targetX - mesh.position.x) * speedFactor;
        mesh.position.z += (mesh.userData.targetZ - mesh.position.z) * speedFactor;
        
        // Rotation fluide (inchangé)
        let diff = mesh.userData.targetAngle - mesh.rotation.y;
        while(diff > Math.PI) diff -= Math.PI*2; 
        while(diff < -Math.PI) diff += Math.PI*2;
        mesh.rotation.y += diff * speedFactor;

        // --- 2. NOUVELLE ANIMATION ---
        
        // On calcule la vitesse réelle pour synchroniser les pattes
        const distMoved = mesh.position.distanceTo(oldPos);
        const isMoving = distMoved > 0.005; // Seuil minimum

        // Si on a les références des pattes (ajoutées dans World.js)
        if (mesh.userData.legs) {
            const legs = mesh.userData.legs; // [FL, FR, BL, BR]

            if (isMoving) {
                // Incrémenter le timer basé sur la vitesse (x150 pour que ça soit dynamique)
                mesh.userData.walkTimer += distMoved * 150; 
                
                const t = mesh.userData.walkTimer;
                const amplitude = 0.8; // Amplitude du balancement

                // Cycle de marche quadrupède (Diagonales synchronisées)
                // Patte Avant-Gauche (0) et Arrière-Droite (3) ensemble
                legs[0].rotation.x = Math.sin(t) * amplitude;
                legs[3].rotation.x = Math.sin(t) * amplitude;

                // Patte Avant-Droite (1) et Arrière-Gauche (2) opposées
                legs[1].rotation.x = Math.sin(t + Math.PI) * amplitude;
                legs[2].rotation.x = Math.sin(t + Math.PI) * amplitude;

                // Petit sautillement du corps (sinus double fréquence absolu)
                mesh.position.y = Math.abs(Math.sin(t)) * 0.1;
                
                // Petit mouvement de tête
                if(mesh.userData.head) {
                    mesh.userData.head.rotation.z = Math.sin(t) * 0.05;
                }

            } else {
                // Retour au calme (Idle)
                // On remet doucement les pattes à 0
                for(let i=0; i<4; i++) {
                    legs[i].rotation.x = THREE.MathUtils.lerp(legs[i].rotation.x, 0, dt * 10);
                }
                mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0, dt * 10);
                if(mesh.userData.head) mesh.userData.head.rotation.z = THREE.MathUtils.lerp(mesh.userData.head.rotation.z, 0, dt * 10);
            }
        } else {
            // Fallback (si c'est un vieux mesh sans legs)
            if (isMoving) mesh.position.y = Math.abs(Math.sin(Date.now()*0.015))*0.2;
            else mesh.position.y = 0;
        }

        // --- 3. UI BARRE DE VIE (inchangé) ---
        if (mesh.userData.hpBar) {
            const hpPct = (mesh.userData.hp / mesh.userData.maxHp) * 100;
            mesh.userData.hpFill.style.width = hpPct + '%';
            mesh.userData.hpFill.style.background = hpPct < 30 ? '#ff4444' : '#4caf50';
            
            const pos = mesh.position.clone(); 
            pos.y += 1.5; 
            pos.project(camera);
            
            if (pos.z < 1) {
                const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;
                mesh.userData.hpBar.style.display = 'block';
                mesh.userData.hpBar.style.left = `${x}px`;
                mesh.userData.hpBar.style.top = `${y}px`;
            } else {
                mesh.userData.hpBar.style.display = 'none';
            }
        }
    });
}

function updateMercenaries(dt) {
    worldMercenaries.forEach(mesh => {
        const interpSpeed = 10 * dt;
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, mesh.userData.targetX, interpSpeed);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, mesh.userData.targetZ, interpSpeed);
        let diff = mesh.userData.targetAngle - mesh.rotation.y;
        if(diff > Math.PI) diff -= Math.PI*2; if(diff < -Math.PI) diff += Math.PI*2;
        mesh.rotation.y += diff * interpSpeed;

        const isMoving = Math.sqrt((mesh.userData.targetX - mesh.position.x)**2 + (mesh.userData.targetZ - mesh.position.z)**2) > 0.05;

        // Animation simplifiée pour la lisibilité ici (copie de la logique précédente)
        if (mesh.userData.attackTimer > 0) {
            mesh.userData.attackTimer -= dt * 2.5; 
            const t = 1.0 - Math.max(0, mesh.userData.attackTimer);
            let armX = 0;
            if (t < 0.3) armX = -Math.PI * 0.6;
            else if (t < 0.6) armX = Math.PI * 0.4;
            mesh.userData.armR.rotation.x = THREE.MathUtils.lerp(mesh.userData.armR.rotation.x, armX, 0.2);
        } else if (isMoving) {
            mesh.userData.walkTimer += dt * 12; 
            mesh.userData.legL.rotation.x = Math.sin(mesh.userData.walkTimer) * 0.8;
            mesh.userData.legR.rotation.x = Math.sin(mesh.userData.walkTimer + Math.PI) * 0.8;
            mesh.userData.armL.rotation.x = Math.sin(mesh.userData.walkTimer + Math.PI) * 0.6;
            mesh.userData.armR.rotation.x = Math.sin(mesh.userData.walkTimer) * 0.6;
        } else {
            mesh.userData.legL.rotation.x = 0; mesh.userData.legR.rotation.x = 0;
            mesh.userData.armL.rotation.x = 0; mesh.userData.armR.rotation.x = 0;
        }

        if (mesh.userData.hpBar) {
            const hpPct = (mesh.userData.hp / mesh.userData.maxHp) * 100;
            mesh.userData.hpFill.style.width = hpPct + '%';
            mesh.userData.hpFill.style.background = hpPct < 30 ? '#ff4444' : '#4caf50';
            const pos = mesh.position.clone(); pos.y += 2.2; pos.project(camera);
            if (pos.z < 1) {
                const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;
                mesh.userData.hpBar.style.display = 'block';
                mesh.userData.hpBar.style.left = `${x}px`;
                mesh.userData.hpBar.style.top = `${y}px`;
            } else mesh.userData.hpBar.style.display = 'none';
        }
    });
}

function updateBuildingTransparency() {
    if (gameData.player) {
        const myPos = gameData.player.mesh.position;
        worldBuildings.forEach(mesh => {
            if (mesh.userData.type === 'DOOR') {
                if (mesh.userData.isOpen) { mesh.material.opacity = 0.3; return; }
                if (mesh.userData.ownerId === gameData.player.id) {
                    mesh.material.opacity = (myPos.distanceTo(mesh.position) < 2.5) ? 0.3 : 1.0;
                } else mesh.material.opacity = 1.0;
            }
        });
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();