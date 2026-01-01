import * as THREE from 'three';

export class InputManager {
    constructor() {
        // État interne
        this.keys = { w: false, a: false, s: false, d: false };
        this.mouse = new THREE.Vector2(); // Coordonnées normalisées (-1 à +1)
        this.isMouseDown = false;
        
        // Callbacks (fonctions que Main.js va définir)
        this.onAction = null;      // Pour les touches uniques (1, 2, R, ESC...)
        this.onScroll = null;      // Pour la molette
        this.onMouseClick = null;  // Pour le clic gauche/droit
        
        this.initListeners();
    }

    initListeners() {
        // --- CLAVIER (DOWN) ---
        window.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT') return; // Ne pas bouger si on écrit dans le chat

            const k = e.key.toLowerCase();
            
            // Mouvement (ZQSD / WASD)
            if(k==='w'||k==='z') this.keys.w = true;
            if(k==='s') this.keys.s = true;
            if(k==='a'||k==='q') this.keys.a = true;
            if(k==='d') this.keys.d = true;

            // Actions Uniques (On notifie Main.js)
            if (this.onAction) {
                // Hotbar
                if(k === '1' || k === '&') this.onAction('SELECT_SLOT', 'SWORD');
                if(k === '2' || k === 'é') this.onAction('SELECT_SLOT', 'WALL');
                if(k === '3' || k === '"') this.onAction('SELECT_SLOT', 'DOOR');
                if(k === '4' || k === '\'') this.onAction('SELECT_SLOT', 'WALL_STONE');
                if(k === '5' || k === '(') this.onAction('SELECT_SLOT', 'GOLD_TOWER');
                if(k === '6' || k === '-') this.onAction('BUY_MERCENARY');
                
                // Construction
                if(k === 'r') this.onAction('ROTATE_BUILDING');
                if(k === 'escape') this.onAction('CANCEL_BUILD');
            }
        });

        // --- CLAVIER (UP) ---
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if(k==='w'||k==='z') this.keys.w = false;
            if(k==='s') this.keys.s = false;
            if(k==='a'||k==='q') this.keys.a = false;
            if(k==='d') this.keys.d = false;
        });

        // --- SOURIS (MOVE) ---
        window.addEventListener('mousemove', (e) => {
            // Normalisé -1 à +1
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        // --- SOURIS (CLIC) ---
        window.addEventListener('mousedown', (e) => {
            if(e.button === 0) {
                this.isMouseDown = true;
                if(this.onMouseClick) this.onMouseClick('LEFT_DOWN');
            }
            if(e.button === 2) {
                if(this.onAction) this.onAction('CANCEL_BUILD'); // Clic droit annule
            }
        });

        window.addEventListener('mouseup', (e) => { 
            if (e.button === 0) this.isMouseDown = false; 
        });

        // --- MOLETTE ---
        window.addEventListener('wheel', (e) => {
            if (this.onScroll) {
                const direction = e.deltaY > 0 ? 1 : -1; // 1 = bas, -1 = haut
                this.onScroll(direction);
            }
        });
        window.addEventListener('blur', () => {
            // On remet tout à zéro quand on quitte la fenêtre
            this.keys.w = false;
            this.keys.a = false;
            this.keys.s = false;
            this.keys.d = false;
            this.isMouseDown = false;
            
            // Optionnel : Si tu veux annuler une construction en cours
            if (this.onAction) this.onAction('CANCEL_BUILD');
        });
    }

    // Calcule le vecteur de mouvement pour la frame actuelle
    getMoveVector() {
        const move = new THREE.Vector3(0, 0, 0);
        if (this.keys.w) move.z -= 1;
        if (this.keys.s) move.z += 1;
        if (this.keys.a) move.x -= 1;
        if (this.keys.d) move.x += 1;
        
        // On normalise pour éviter d'aller plus vite en diagonale
        if (move.length() > 0) move.normalize();
        
        return move;
    }
}