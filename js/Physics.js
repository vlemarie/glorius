import { obstacles, worldBuildings } from './World.js';
import { gameData } from './Globals.js';
import { BUILDINGS } from './Config.js';

export class Physics {
    constructor() {
        this.playerRadius = 0.4;
    }

    // Vérifie si une position (x, z) est libre (pour le mouvement du joueur)
    checkCollision(x, z) {
        for (let obs of obstacles) {
            if (obs.isBuilding) {
                const mesh = worldBuildings.get(obs.id);
                // On passe à travers nos propres portes ouvertes
                if (mesh && mesh.userData.type === 'DOOR') {
                    if (mesh.userData.isOpen) continue; 
                    if (gameData.player && mesh.userData.ownerId === gameData.player.id) continue;
                }
                
                // Hitbox rectangulaire pour bâtiments
                const minX = obs.x - obs.width / 2 - this.playerRadius;
                const maxX = obs.x + obs.width / 2 + this.playerRadius;
                const minZ = obs.z - obs.depth / 2 - this.playerRadius;
                const maxZ = obs.z + obs.depth / 2 + this.playerRadius;
                
                if (x > minX && x < maxX && z > minZ && z < maxZ) return true;
            } else {
                // Hitbox circulaire pour ressources (arbres/rochers)
                const dx = x - obs.x;
                const dz = z - obs.z;
                if (dx*dx + dz*dz < (this.playerRadius + obs.radius)**2) return true;
            }
        }
        return false;
    }

    // Vérifie si on a le droit de construire ici
    isPlacementValid(x, z, angle, type) {
        const conf = BUILDINGS[type];
        if (!conf) return false;

        if (type === 'GOLD_TOWER' && conf.minDistance) {
            for (const [id, mesh] of worldBuildings) {
                // On regarde si le bâtiment existant est une tour
                if (mesh.userData.type === 'GOLD_TOWER') {
                    const dist = Math.sqrt((mesh.position.x - x)**2 + (mesh.position.z - z)**2);
                    // Si trop proche, c'est invalide (rouge)
                    if (dist < conf.minDistance) return false;
                }
            }
        }

        // Calcul dimensions selon rotation
        let w = conf.width; 
        let d = conf.depth;
        if (Math.abs(angle - Math.PI/2) < 0.1) { w = conf.depth; d = conf.width; }

        // 1. Distance max du joueur
        if (gameData.player) {
            const pPos = gameData.player.mesh.position;
            if (Math.sqrt((x - pPos.x)**2 + (z - pPos.z)**2) > 8.0) return false;
        }

        // 2. Pas sur un autre joueur/mob
        const PLAYER_BODY_RADIUS = 0.5; 
        for (const actor of gameData.actors) {
            const aPos = actor.mesh.position;
            // On vérifie les autres joueurs (pas soi-même, sauf si on veut éviter de se coincer)
            if (actor !== gameData.player) {
                if (Math.sqrt((x - aPos.x)**2 + (z - aPos.z)**2) < 2.5) return false; 
            }
            // Vérification rectangle vs cercle simplifié
            if (Math.abs(x - aPos.x) < w/2 + PLAYER_BODY_RADIUS && Math.abs(z - aPos.z) < d/2 + PLAYER_BODY_RADIUS) return false;
        }

        // 3. Pas sur un obstacle existant
        const hitScale = 0.8; // Marge de tolérance
        for (let obs of obstacles) {
            if (obs.isBuilding) {
                const obsW = obs.width * hitScale; 
                const obsD = obs.depth * hitScale;
                if (Math.abs(x - obs.x) < (w*hitScale + obsW)/2 && Math.abs(z - obs.z) < (d*hitScale + obsD)/2) return false;
            } else if (obs.isResource) {
                const rSize = obs.radius * 2;
                if (Math.abs(x - obs.x) < (w + rSize)/2 - 0.1 && Math.abs(z - obs.z) < (d + rSize)/2 - 0.1) return false;
            }
        }
        return true;
    }
}