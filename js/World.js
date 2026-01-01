import * as THREE from 'three';
import { scene } from './Globals.js';
import { BUILDINGS } from './Config.js'; 

export let obstacles = [];
export const worldResources = new Map();
export const worldBuildings = new Map(); 
export const worldMercenaries = new Map();
export let groundMesh = null; 

// --- GÉOMÉTRIES PARTAGÉES ---
const TREE_TRUNK_GEO = new THREE.CylinderGeometry(0.4, 0.6, 1.5, 6);
TREE_TRUNK_GEO.translate(0, 0.75, 0);
const TREE_LEAVES_1_GEO = new THREE.ConeGeometry(2, 2, 6);
TREE_LEAVES_1_GEO.translate(0, 2.0, 0);
const TREE_LEAVES_2_GEO = new THREE.ConeGeometry(1.5, 1.5, 6);
TREE_LEAVES_2_GEO.translate(0, 3.0, 0);

const TREE_TRUNK_MAT = new THREE.MeshStandardMaterial({color: 0x8B4513});
const TREE_LEAVES_MAT = new THREE.MeshStandardMaterial({color: 0x228B22});

const ROCK_GEO = new THREE.DodecahedronGeometry(1, 0);
const ROCK_MAT = new THREE.MeshStandardMaterial({color: 0x888888});

const PIG_BODY_GEO = new THREE.BoxGeometry(0.9, 0.6, 1.3);
PIG_BODY_GEO.translate(0, 0.5, 0); 
const PIG_HEAD_GEO = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const PIG_NOSE_GEO = new THREE.BoxGeometry(0.2, 0.2, 0.1);
const PIG_LEG_GEO = new THREE.BoxGeometry(0.2, 0.4, 0.2);
// On déplace la géométrie vers le bas : le point (0,0,0) devient le haut de la jambe
PIG_LEG_GEO.translate(0, -0.2, 0);

const PINK_MAT = new THREE.MeshStandardMaterial({ color: 0xFFB6C1 });
const DARK_PINK_MAT = new THREE.MeshStandardMaterial({ color: 0xE75480 });

const MERC_SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xFFD700 }); 
const MERC_ARMOR_MAT = new THREE.MeshStandardMaterial({ color: 0x555555 }); 
const MERC_HELMET_MAT = new THREE.MeshStandardMaterial({ color: 0x222222 }); 

const GOLD_MAT = new THREE.MeshStandardMaterial({ 
    color: 0xFFD700, 
    metalness: 0.8, 
    roughness: 0.2 
});
const DARK_GOLD_MAT = new THREE.MeshStandardMaterial({ 
    color: 0xB8860B, 
    metalness: 0.6, 
    roughness: 0.4 
});
const GLOW_MAT = new THREE.MeshStandardMaterial({ 
    color: 0xFFD700,
    emissive: 0xFFD700,     // C'est ça qui fait "briller" sans calculs lourds
    emissiveIntensity: 2.0, // Force de la brillance
    toneMapped: false       // Pour que ce soit très blanc/brillant au centre
});

// --- FONCTIONS ---

// Permet d'ajouter une ressource dynamiquement sans recharger tout le monde
export function addResource(res) {
    if (res.type === 'tree') createTree(res.id, res.x, res.z, res.scale);
    else if (res.type === 'rock') createRock(res.id, res.x, res.z, res.scale);
}

function createGoldTowerMesh(id, x, z, height) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // 1. La Base (Socle large)
    const baseGeo = new THREE.BoxGeometry(2.8, 0.8, 2.8);
    const base = new THREE.Mesh(baseGeo, DARK_GOLD_MAT);
    base.position.y = 0.4;
    base.castShadow = true; 
    base.receiveShadow = true;
    group.add(base);

    // 2. Le Corps de la tour (Pilier central)
    const bodyGeo = new THREE.BoxGeometry(2.0, height - 1.5, 2.0);
    const body = new THREE.Mesh(bodyGeo, GOLD_MAT);
    body.position.y = (height - 1.5) / 2 + 0.8;
    body.castShadow = true;
    group.add(body);

    // 3. Les 4 piliers d'angle (Renforts)
    const pillarGeo = new THREE.BoxGeometry(0.4, height - 0.5, 0.4);
    const positions = [
        {x: 1.1, z: 1.1}, {x: -1.1, z: 1.1},
        {x: 1.1, z: -1.1}, {x: -1.1, z: -1.1}
    ];
    positions.forEach(pos => {
        const pillar = new THREE.Mesh(pillarGeo, DARK_GOLD_MAT);
        pillar.position.set(pos.x, (height - 0.5) / 2, pos.z);
        pillar.castShadow = true;
        group.add(pillar);
    });

    // 4. Plateforme supérieure (Toit)
    const topGeo = new THREE.BoxGeometry(2.6, 0.5, 2.6);
    const top = new THREE.Mesh(topGeo, DARK_GOLD_MAT);
    top.position.y = height - 0.5;
    top.castShadow = true;
    group.add(top);

    // 5. Créneaux (Les petits blocs en haut)
    const crenelGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    const cPos = [
        {x: 1.05, z: 1.05}, {x: -1.05, z: 1.05},
        {x: 1.05, z: -1.05}, {x: -1.05, z: -1.05}
    ];
    cPos.forEach(pos => {
        const c = new THREE.Mesh(crenelGeo, GOLD_MAT);
        c.position.set(pos.x, height + 0.1, pos.z);
        group.add(c);
    });

    // 6. Cristal Flottant (Au centre)
    const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
    const crystal = new THREE.Mesh(crystalGeo, GLOW_MAT);
    crystal.position.set(0, height + 1.2, 0);
    
    // On ajoute une petite lumière ponctuelle pour que le cristal éclaire autour
    
    group.add(crystal);

    // On sauvegarde la référence du cristal pour l'animer plus tard
    group.userData = { isGoldTower: true, crystal: crystal };

    return group;
}

export function createMercenaryMesh(id, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.5), MERC_ARMOR_MAT);
    body.position.y = 1.0; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.35, 8), MERC_SKIN_MAT);
    head.position.y = 1.7; head.castShadow = true; group.add(head);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), MERC_HELMET_MAT);
    helmet.position.y = 1.95; group.add(helmet);
    
    const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
    const armL = new THREE.Mesh(armGeo, MERC_ARMOR_MAT); armL.position.set(-0.65, 1.45, 0); group.add(armL);
    const armR = new THREE.Mesh(armGeo, MERC_ARMOR_MAT); armR.position.set(0.65, 1.45, 0); group.add(armR);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), new THREE.MeshStandardMaterial({color: 0xAAAAAA}));
    sword.position.set(0, -0.6, 0.2); sword.rotation.x = Math.PI/2; armR.add(sword);

    const legGeo = new THREE.BoxGeometry(0.35, 0.8, 0.35);
    const legL = new THREE.Mesh(legGeo, MERC_HELMET_MAT); legL.position.set(-0.25, 0.4, 0); group.add(legL);
    const legR = new THREE.Mesh(legGeo, MERC_HELMET_MAT); legR.position.set(0.25, 0.4, 0); group.add(legR);
    
    const hpBar = document.createElement('div'); hpBar.className = 'hp-bar-container'; 
    const hpFill = document.createElement('div'); hpFill.className = 'hp-bar-fill'; hpBar.appendChild(hpFill);
    document.getElementById('labels-container').appendChild(hpBar);
    
    group.userData = { id: id, hpBar: hpBar, hpFill: hpFill, armR: armR, armL: armL, legL: legL, legR: legR, walkTimer: 0, attackTimer: 0 };
    scene.add(group);
    worldMercenaries.set(id, group);
    return group;
}

export function destroyMercenary(id) {
    if (worldMercenaries.has(id)) {
        const mesh = worldMercenaries.get(id);
        if (mesh.userData.hpBar) mesh.userData.hpBar.remove();
        scene.remove(mesh);
        worldMercenaries.delete(id);
    }
}

function cleanMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) { mesh.material.forEach(m => m.dispose()); } else { mesh.material.dispose(); }
    }
    if (mesh.children) { mesh.children.forEach(child => cleanMesh(child)); }
}

export function initWorld() {
    // 1. TEXTURE & MATÉRIAU
    const groundTexture = createGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({ 
        map: groundTexture,
        roughness: 0.9, 
        metalness: 0.1
    });

    // 2. L'ÎLE (Ronde)
    const islandGeo = new THREE.CylinderGeometry(150, 150, 4, 40);
    groundMesh = new THREE.Mesh(islandGeo, groundMat);
    groundMesh.receiveShadow = true;
    groundMesh.position.y = -2;
    scene.add(groundMesh);

    // 3. LA PLAGE
    const sandGeo = new THREE.CylinderGeometry(165, 165, 4.5, 40);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xE6C288 });
    const beach = new THREE.Mesh(sandGeo, sandMat);
    beach.position.y = -2.5;
    beach.receiveShadow = true;
    scene.add(beach);

    // 4. L'OCÉAN
    const waterGeo = new THREE.PlaneGeometry(3000, 3000);
    const waterMat = new THREE.MeshStandardMaterial({ 
        color: 0x1ca3ec, 
        roughness: 0.2,
        metalness: 0.1
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -4; 
    scene.add(water);

    // --- ON SUPPRIME LE GRIDHELPER ICI (car il est carré) ---
    // La grille est maintenant dans la texture groundTexture

    setupLighting();
}

export function loadEnvironment(data) {
    // Nettoyage COMPLET
    worldResources.forEach(mesh => { scene.remove(mesh); }); 
    worldResources.clear();
    worldBuildings.forEach(mesh => { scene.remove(mesh); cleanMesh(mesh); }); 
    worldBuildings.clear();
    obstacles = [];

    if (data.resources) {
        data.resources.forEach(res => {
            if (res.type === 'tree') createTree(res.id, res.x, res.z, res.scale);
            if (res.type === 'rock') createRock(res.id, res.x, res.z, res.scale);
        });
    }

    if (data.buildings) {
        data.buildings.forEach(b => {
            createBuilding(b.id, b.type, b.x, b.z, b.angle, b.isOpen, b.ownerId);
        });
    }
}

export function createPigMesh(scale) {
    const grp = new THREE.Group();
    
    // Corps
    const body = new THREE.Mesh(PIG_BODY_GEO, PINK_MAT); 
    body.castShadow = true; 
    grp.add(body);

    // Tête
    const head = new THREE.Mesh(PIG_HEAD_GEO, PINK_MAT); 
    head.position.set(0, 0.7, 0.75); 
    head.castShadow = true; 
    grp.add(head);

    // Groin
    const nose = new THREE.Mesh(PIG_NOSE_GEO, DARK_PINK_MAT); 
    nose.position.set(0, 0.65, 1.0); 
    grp.add(nose);
    
    // Jambes : On les stocke pour l'animation
    // Positions : [Avant-Gauche, Avant-Droite, Arrière-Gauche, Arrière-Droite]
    const legPositions = [
        {x: -0.3, z: 0.4}, {x: 0.3, z: 0.4}, 
        {x: -0.3, z: -0.4}, {x: 0.3, z: -0.4}
    ];
    
    const legs = [];
    legPositions.forEach(pos => {
        const l = new THREE.Mesh(PIG_LEG_GEO, DARK_PINK_MAT);
        // On place la jambe plus haut (0.4) car le pivot est maintenant en haut de la géométrie
        l.position.set(pos.x, 0.4, pos.z); 
        l.castShadow = true;
        grp.add(l);
        legs.push(l);
    });

    grp.scale.set(scale, scale, scale);

    // Barre de vie (inchangée)
    const hpBar = document.createElement('div'); hpBar.className = 'hp-bar-container'; hpBar.style.display = 'none'; 
    const hpFill = document.createElement('div'); hpFill.className = 'hp-bar-fill'; hpBar.appendChild(hpFill);
    document.getElementById('labels-container').appendChild(hpBar);
    
    // On ajoute les références (legs) et un timer dans userData
    grp.userData = { 
        hpBar: hpBar, 
        hpFill: hpFill, 
        legs: legs,         // Référence aux 4 pattes
        head: head,         // Référence à la tête (optionnel, pour l'animer aussi)
        walkTimer: 0 
    };
    
    return grp;
}

export function createBuilding(id, type, x, z, angle = 0, isOpen = false, ownerId = null) {
    const conf = BUILDINGS[type]; if (!conf) return;

    let mesh;

    // --- MODIFICATION ICI ---
    if (type === 'GOLD_TOWER') {
        // Utilise notre nouveau modèle 3D complexe
        mesh = createGoldTowerMesh(id, x, z, conf.height);
    } else {
        // Comportement classique (Cube simple) pour Murs et Portes
        const geo = new THREE.BoxGeometry(conf.width, conf.height, conf.depth);
        const mat = new THREE.MeshStandardMaterial({ 
            color: conf.color, 
            transparent: true, 
            opacity: isOpen ? 0.3 : 1.0 
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, conf.height / 2, z);
    }
    // ------------------------

    // Configuration commune
    mesh.userData = { ...mesh.userData, id, baseAngle: angle, isOpen, isBuilding: true, type, ownerId };
    
    // Si ce n'est pas la tour (qui est un groupe déjà positionné), on applique la rotation
    if (type !== 'GOLD_TOWER') {
        mesh.rotation.y = angle; 
    } else {
        // Pour la tour (Groupe), on tourne tout le groupe
        mesh.rotation.y = angle;
    }

    mesh.castShadow = true; 
    mesh.receiveShadow = true; 
    scene.add(mesh);
    worldBuildings.set(id, mesh);
    
    // Hitbox physique (inchangée)
    let colWidth = conf.width; let colDepth = conf.depth;
    if (Math.abs(angle - Math.PI/2) < 0.1) { colWidth = conf.depth; colDepth = conf.width; }
    obstacles.push({ id: id, x: x, z: z, isBuilding: true, width: colWidth, depth: colDepth });
}

export function destroyBuilding(id) {
    if (worldBuildings.has(id)) {
        const mesh = worldBuildings.get(id);
        scene.remove(mesh);
        cleanMesh(mesh);
        worldBuildings.delete(id);
        const index = obstacles.findIndex(o => o.id === id);
        if (index !== -1) obstacles.splice(index, 1);
    }
}

export function destroyResource(id) {
    if (worldResources.has(id)) {
        const mesh = worldResources.get(id);
        scene.remove(mesh);
        worldResources.delete(id);
        const index = obstacles.findIndex(o => o.id === id);
        if (index !== -1) obstacles.splice(index, 1);
    }
}

export function playHitEffect(id) {
    let mesh = worldResources.get(id) || worldBuildings.get(id) || scene.getObjectByProperty('uuid', id); 
    if (!mesh) {
        worldMercenaries.forEach(m => { if(m.userData.id === id) mesh = m; });
    }
    
    if (mesh) {
        if (mesh.userData.baseRotationZ === undefined) mesh.userData.baseRotationZ = mesh.rotation.z;
        if (mesh.userData.isHitAnimating) return;
        mesh.userData.isHitAnimating = true;
        mesh.rotation.z = mesh.userData.baseRotationZ + 0.15; 
        setTimeout(() => { 
            if (mesh) {
                mesh.rotation.z = mesh.userData.baseRotationZ;
                mesh.userData.isHitAnimating = false;
            }
        }, 80);
    }
}

export function setDoorState(id, isOpen) {
    const mesh = worldBuildings.get(id);
    if (mesh) {
        mesh.userData.isOpen = isOpen;
        mesh.material.opacity = isOpen ? 0.3 : 1.0;
        mesh.material.needsUpdate = true;
    }
}
function setupLighting() {
    // Soleil un peu plus fort (0.8) pour bien marquer les ombres
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight.position.set(50, 80, 50);
    sunLight.castShadow = true;
    
    sunLight.shadow.mapSize.width = 2048; 
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -100; 
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100; 
    sunLight.shadow.camera.bottom = -100;
    
    scene.add(sunLight);

    // Ambiance neutre pour déboucher les ombres sans laver les couleurs
    const ambi = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambi);
}

function createGround() {
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x558855, roughness: 1.0, metalness: 0.0 });
    groundMesh = new THREE.Mesh(groundGeo, groundMat); 
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    
    const grid = new THREE.GridHelper(500, 100, 0x000000, 0x000000);
    grid.material.opacity = 0.08; 
    grid.material.transparent = true;
    scene.add(grid);
}

function createTree(id, x, z, s) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    const trunk = new THREE.Mesh(TREE_TRUNK_GEO, TREE_TRUNK_MAT.clone()); trunk.castShadow = true; grp.add(trunk);
    const l1 = new THREE.Mesh(TREE_LEAVES_1_GEO, TREE_LEAVES_MAT.clone()); l1.castShadow = true; grp.add(l1);
    const l2 = new THREE.Mesh(TREE_LEAVES_2_GEO, TREE_LEAVES_MAT.clone()); l2.castShadow = true; grp.add(l2);
    grp.scale.set(s, s, s); scene.add(grp); worldResources.set(id, grp);
    obstacles.push({ id: id, x: x, z: z, radius: 0.8 * s, isResource: true });
}

function createRock(id, x, z, s) {
    const rock = new THREE.Mesh(ROCK_GEO, ROCK_MAT.clone());
    rock.position.set(x, s*0.3, z); rock.scale.set(s, s*0.7, s); rock.castShadow = true;
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(rock); worldResources.set(id, rock);
    obstacles.push({ id: id, x: x, z: z, radius: 1.0 * s, isResource: true });
}

function createGroundTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 1. Fond Vert Foncé
    ctx.fillStyle = '#2b632eff'; 
    ctx.fillRect(0, 0, size, size);

    // 2. Bruit (Herbe)
    for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? '#265729' : '#347537ff'; 
        const x = Math.random() * size;
        const y = Math.random() * size;
        const w = Math.random() * 4 + 1;
        const h = Math.random() * 4 + 1;
        ctx.fillRect(x, y, w, h);
    }

    // 3. LA GRILLE (Directement peinte sur le sol)
    // On dessine un contour noir autour de la tuile.
    // Comme la texture se répète, ça créera un quadrillage parfait.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'; // Noir subtil (15%)
    ctx.lineWidth = 15; // Épaisseur du trait

    ctx.beginPath();
    // On dessine juste deux lignes (gauche et haut), la répétition fera le reste
    ctx.moveTo(0, 0); ctx.lineTo(0, size); // Ligne verticale
    ctx.moveTo(0, 0); ctx.lineTo(size, 0); // Ligne horizontale
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(60, 60); // Zoom x20
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    return texture;
}