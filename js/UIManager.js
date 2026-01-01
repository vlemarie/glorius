import { gameData } from './Globals.js';
import { obstacles, worldBuildings, worldMercenaries } from './World.js';

export class UIManager {
    constructor(mapKeySize = 300) {
        // --- MINIMAP SETUP ---
        this.minimapEl = document.getElementById('minimap');
        this.ctxMinimap = this.minimapEl.getContext('2d');
        this.mapSize = mapKeySize; // Taille logique du monde (300x300)
        this.elLeaderboardList = document.getElementById('lb-list');
        
        // --- DOM ELEMENTS CACHE ---
        this.elWood = document.getElementById('ui-wood');
        this.elStone = document.getElementById('ui-stone');
        this.elFood = document.getElementById('ui-food');
        this.elXpFill = document.getElementById('xp-bar-fill');
        this.elXpText = document.getElementById('xp-text');
        this.elChat = document.getElementById('chat-messages');
        this.slots = {
            SWORD: document.getElementById('slot-sword'),
            WALL: document.getElementById('slot-wall'),
            DOOR: document.getElementById('slot-door'),
            WALL_STONE: document.getElementById('slot-wall-stone'),
            GOLD_TOWER: document.getElementById('slot-gold-tower') // <-- AJOUT
        };
    }

    updateInventory(inv) {
        if(inv.wood !== undefined) this.elWood.innerText = inv.wood;
        if(inv.stone !== undefined) this.elStone.innerText = inv.stone;
        if(inv.food !== undefined && this.elFood) this.elFood.innerText = inv.food;
        if(inv.gold !== undefined) document.getElementById('ui-score').innerText = inv.gold;
    }

    updateXp(current, max, level) {
        const pct = Math.min(100, (current / max) * 100);
        this.elXpFill.style.width = `${pct}%`;
        this.elXpText.innerText = `Niveau ${level} | ${Math.floor(current)} / ${max} XP`;
    }

    addChatMessage(name, text, isSystem = false) {
        const div = document.createElement('div');
        if (isSystem) {
            div.innerHTML = `<i>${text}</i>`;
            div.style.color = "#ffff00";
        } else {
            div.innerHTML = `<b>${name}:</b> ${text}`;
            div.style.color = "white";
        }
        div.style.textShadow = "1px 1px 0 #000";
        this.elChat.appendChild(div);
        this.elChat.scrollTop = this.elChat.scrollHeight;
    }

    setActiveSlot(type) {
        // Enlève la classe active de partout
        Object.values(this.slots).forEach(el => {
            if(el) el.classList.remove('active');
        });
        // L'ajoute sur le bon slot
        if (this.slots[type]) this.slots[type].classList.add('active');
    }

    toggleBuildInstructions(show, type = '') {
        const instr = document.getElementById('build-instruction');
        if (!instr) return;
        if (show) {
            instr.style.display = 'block';
            instr.innerHTML = `Construction : <b>${type}</b><span>[R] Pivoter &nbsp; • &nbsp; [Clic Gauche] Poser</span>`;
        } else {
            instr.style.display = 'none';
        }
    }

    // --- LOGIQUE MINIMAP ---
    drawMinimap() {
        if (!this.minimapEl || !this.ctxMinimap) return;
        
        const width = this.minimapEl.width;
        const height = this.minimapEl.height;
        const ctx = this.ctxMinimap;

        ctx.clearRect(0, 0, width, height);
        
        const scale = width / this.mapSize;
        const toMap = (x, z) => { 
            return { x: (x + this.mapSize / 2) * scale, y: (z + this.mapSize / 2) * scale }; 
        };

        // Grille centrale
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width/2, 0); ctx.lineTo(width/2, height);
        ctx.moveTo(0, height/2); ctx.lineTo(width, height/2);
        ctx.stroke();

        // 1. Ressources
        obstacles.forEach(obs => {
            if (!obs.isResource) return;
            const pos = toMap(obs.x, obs.z);
            ctx.beginPath();
            ctx.fillStyle = (obs.radius < 1.0) ? "#2ecc71" : "#95a5a6"; // Vert ou Gris
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // 2. Batiments
        worldBuildings.forEach((mesh) => {
            const pos = toMap(mesh.position.x, mesh.position.z);
            ctx.fillStyle = "#8B4513";
            ctx.fillRect(pos.x - 1.5, pos.y - 1.5, 3, 3);
        });

        // 3. Mobs (Cochons)
        gameData.mobs.forEach(mesh => {
            const pos = toMap(mesh.position.x, mesh.position.z);
            ctx.beginPath();
            ctx.fillStyle = "#e91e63"; // Rose foncé
            ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });

        // 4. Mercenaires
        worldMercenaries.forEach(mesh => {
            const pos = toMap(mesh.position.x, mesh.position.z);
            ctx.beginPath();
            ctx.fillStyle = "#00bcd4"; // Cyan
            ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });

        // 5. Autres Joueurs
        gameData.actors.forEach(actor => {
            if (actor === gameData.player) return;
            const pos = toMap(actor.mesh.position.x, actor.mesh.position.z);
            ctx.beginPath();
            ctx.fillStyle = "#e74c3c"; // Rouge
            ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // 6. Joueur Local (Flèche blanche)
        if (gameData.player && gameData.player.mesh) {
            const p = gameData.player.mesh;
            const pos = toMap(p.position.x, p.position.z);
            ctx.beginPath();
            ctx.fillStyle = "#ffffff";
            ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Direction
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x + Math.sin(p.rotation.y) * 8, pos.y + Math.cos(p.rotation.y) * 8);
            ctx.stroke();
        }
    }
    updateLeaderboard(list) {
        if (!this.elLeaderboardList) return;
        this.elLeaderboardList.innerHTML = ''; // On vide la liste

        list.forEach((entry, index) => {
            const li = document.createElement('li');
            li.className = 'lb-item';
            
            // Si c'est moi, on ajoute une classe spéciale pour le style
            if (gameData.player && entry.id === gameData.player.id) {
                li.classList.add('me');
            }

            // Structure : "1. Pseudo .... 150"
            li.innerHTML = `
                <span>${index + 1}. ${entry.name}</span>
                <span class="gold-val">${entry.gold}</span>
            `;
            this.elLeaderboardList.appendChild(li);
        });
    }
}
