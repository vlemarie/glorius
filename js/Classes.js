import * as THREE from 'three';
import { scene, camera } from './Globals.js'; 
import { createLabel, updateLabel } from './Utils.js';

// --- GEOMETRIES (Style Voxel "Hero" équilibré) ---

// Tête
const HEAD_GEO = new THREE.BoxGeometry(0.55, 0.55, 0.55);

// Yeux
const EYE_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.05);

// Torse
const TORSO_GEO = new THREE.BoxGeometry(0.6, 0.6, 0.35);

// Membres
const LIMB_GEO = new THREE.BoxGeometry(0.2, 0.6, 0.2);
LIMB_GEO.translate(0, -0.25, 0); // Pivot en haut

// Matériaux
const MAT_SKIN = new THREE.MeshStandardMaterial({ color: 0xffcd94, roughness: 0.8 }); 
const MAT_SHIRT = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.9 }); 
const MAT_PANTS = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 }); 
const MAT_EYES = new THREE.MeshStandardMaterial({ color: 0x111111 }); 
const MAT_WEAPON = new THREE.MeshStandardMaterial({ color: 0xecf0f1, metalness: 0.4 });

export class Actor {
    constructor(name, x, z, initialHp = 100, maxHp = 100, level = 1) {
        this.name = name;
        this.maxHp = maxHp;
        this.currentHp = initialHp;
        this.level = level; 
        this.id = null; 

        // 1. Groupe Racine
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);
        scene.add(this.mesh);

        this.targetPos = new THREE.Vector3(x, 0, z);
        this.targetAngle = 0;
        this.lastPos = new THREE.Vector3(x, 0, z);
        this.attackTimer = 0;
        this.walkTimer = 0;
        this.isKnockedBack = false;
        this.idleOffset = Math.random() * 100;

        // 2. Groupe Visuel
        this.charGroup = new THREE.Group();
        // Échelle à 1.25 (Idéal)
        this.charGroup.scale.set(1.25, 1.25, 1.25); 
        this.mesh.add(this.charGroup);

        // --- CORPS ---
        
        // Torse
        this.torso = new THREE.Mesh(TORSO_GEO, MAT_SHIRT.clone());
        this.torso.position.y = 1.0; 
        this.torso.castShadow = true;
        this.charGroup.add(this.torso);

        // Tête
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 0.35; 
        this.torso.add(this.headGroup);

        const headMesh = new THREE.Mesh(HEAD_GEO, MAT_SKIN.clone());
        headMesh.position.y = 0.28; 
        headMesh.castShadow = true;
        this.headGroup.add(headMesh);

        // Yeux
        const eyeL = new THREE.Mesh(EYE_GEO, MAT_EYES);
        eyeL.position.set(-0.14, 0.28, 0.28); 
        this.headGroup.add(eyeL);

        const eyeR = new THREE.Mesh(EYE_GEO, MAT_EYES);
        eyeR.position.set(0.14, 0.28, 0.28);
        this.headGroup.add(eyeR);

        // Jambes
        this.legL = new THREE.Mesh(LIMB_GEO, MAT_PANTS.clone());
        this.legL.position.set(-0.18, -0.3, 0); 
        this.legL.castShadow = true;
        this.torso.add(this.legL);

        this.legR = new THREE.Mesh(LIMB_GEO, MAT_PANTS.clone());
        this.legR.position.set(0.18, -0.3, 0); 
        this.legR.castShadow = true;
        this.torso.add(this.legR);

        // Bras
        this.armL = new THREE.Mesh(LIMB_GEO, MAT_SKIN.clone());
        this.armL.position.set(-0.38, 0.25, 0); 
        this.armL.castShadow = true;
        this.torso.add(this.armL);

        this.armR = new THREE.Mesh(LIMB_GEO, MAT_SKIN.clone());
        this.armR.position.set(0.38, 0.25, 0); 
        this.armR.castShadow = true;
        this.torso.add(this.armR);

        // Arme
        this.createWeapon();

        // --- UI ---
        // MODIF : Hauteur augmentée à 3.8 (au lieu de 3.5)
        const labelHtml = `<span class="lvl-badge">${this.level}</span> ${name}`;
        this.label = createLabel(name, this.mesh, new THREE.Vector3(0, 3.8, 0), "lbl-name");
        if(this.label && this.label.element) {
            this.label.element.innerHTML = labelHtml;
        }
        
        this.hpBar = document.createElement('div');
        this.hpBar.className = 'hp-bar-container';
        this.hpFill = document.createElement('div');
        this.hpFill.className = 'hp-bar-fill';
        this.hpBar.appendChild(this.hpFill);
        document.getElementById('labels-container').appendChild(this.hpBar);
        this.updateHpBar();
    }

    setLevel(lvl) {
        this.level = lvl;
        if (this.label && this.label.element) {
            this.label.element.innerHTML = `<span class="lvl-badge">${this.level}</span> ${this.name}`;
        }
    }
    
    createWeapon() {
        const swordGroup = new THREE.Group();
        
        const bladeGeo = new THREE.BoxGeometry(0.12, 0.85, 0.25); 
        bladeGeo.translate(0, 0.5, 0);
        const blade = new THREE.Mesh(bladeGeo, MAT_WEAPON);
        blade.castShadow = true;
        swordGroup.add(blade);

        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), MAT_PANTS);
        guard.position.y = 0.1;
        swordGroup.add(guard);

        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 6), new THREE.MeshStandardMaterial({color:0x8B4513}));
        handle.position.y = -0.1;
        swordGroup.add(handle);

        swordGroup.rotation.x = Math.PI / 2; 
        swordGroup.position.set(0, -0.4, 0); 
        this.armR.add(swordGroup);
    }

    playAttack() { 
        this.attackTimer = 1.0; 
    }

    setHp(newHp, newMaxHp) {
        this.currentHp = newHp;
        if(newMaxHp) this.maxHp = newMaxHp; 
        this.updateHpBar();
    }

    updateHpBar() {
        const percent = Math.max(0, (this.currentHp / this.maxHp) * 100);
        this.hpFill.style.width = percent + '%';
        this.hpFill.style.background = percent < 30 ? '#ff4444' : '#4caf50';
    }

    update(isLocalPlayer, dt) {
        const safeDt = dt || 0.016; 

        // Interpolation
        if (!isLocalPlayer) {
            const distToTarget = this.mesh.position.distanceTo(this.targetPos);
            if (distToTarget > 5.0) this.mesh.position.copy(this.targetPos);
            else this.mesh.position.lerp(this.targetPos, 12 * safeDt);
            
            const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), this.targetAngle);
            this.mesh.quaternion.slerp(targetQ, 15 * safeDt);
        }

        // Mouvement
        const distMoved = this.mesh.position.distanceTo(this.lastPos);
        const isMoving = distMoved > 0.005; 
        this.lastPos.copy(this.mesh.position);

        // --- ANIMATIONS ---
        
        // Attaque
        if (this.attackTimer > 0) {
            this.attackTimer -= safeDt * 3.5;
            const t = 1.0 - Math.max(0, this.attackTimer);
            
            let armAngle = 0;
            let torsoTwist = 0;

            if (t < 0.2) { 
                const p = t / 0.2;
                armAngle = -Math.PI * 0.8 * p; 
                torsoTwist = -0.6 * p; 
            } 
            else if (t < 0.5) { 
                const p = (t - 0.2) / 0.3;
                armAngle = -Math.PI * 0.8 + (Math.PI * 1.4 * p); 
                torsoTwist = -0.6 + (1.2 * p);
            } 
            else { 
                const p = (t - 0.5) / 0.5;
                armAngle = (Math.PI * 0.6) * (1 - p); 
                torsoTwist = 0.6 * (1 - p);
            }

            this.armR.rotation.x = armAngle;
            this.torso.rotation.y = torsoTwist;
            this.armL.rotation.x = torsoTwist * 0.5;

        } else {
            this.torso.rotation.y = THREE.MathUtils.lerp(this.torso.rotation.y, 0, 10*safeDt);
        }

        // Marche
        if (isMoving) {
            this.walkTimer += safeDt * 12.0; 
            const w = this.walkTimer;
            const swingRange = 0.9; 

            this.legL.rotation.x = Math.sin(w) * swingRange;
            this.legR.rotation.x = Math.sin(w + Math.PI) * swingRange;

            if (this.attackTimer <= 0) {
                this.armL.rotation.x = Math.sin(w + Math.PI) * (swingRange * 0.8);
                this.armR.rotation.x = Math.sin(w) * (swingRange * 0.8);
            }

            this.charGroup.position.y = Math.abs(Math.sin(w*2)) * 0.12; 
            this.charGroup.rotation.x = 0.18; 

        } else {
            // Idle
            this.walkTimer = 0;
            const time = Date.now() * 0.002 + this.idleOffset;

            this.charGroup.position.y = THREE.MathUtils.lerp(this.charGroup.position.y, 0, 10*safeDt);
            this.charGroup.rotation.x = THREE.MathUtils.lerp(this.charGroup.rotation.x, 0, 10*safeDt);

            this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, 0, 10*safeDt);
            this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0, 10*safeDt);

            if (this.attackTimer <= 0) {
                this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0, 10*safeDt);
                this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0, 10*safeDt);
                this.armL.rotation.z = 0.1 + Math.sin(time) * 0.05;
                this.armR.rotation.z = -0.1 - Math.sin(time) * 0.05;
            }
        }

        // UI Update
        // MODIF : Update Label à 3.8
        if (this.label) updateLabel(this.label, this.mesh, new THREE.Vector3(0, 4.4, 0));
        
        if (this.hpBar && this.mesh) {
            // MODIF : Update HP Bar à 3.4
            const pos = new THREE.Vector3(0, 4, 0); 
            pos.applyMatrix4(this.mesh.matrixWorld);
            pos.project(camera);
            
            if (Math.abs(pos.z) > 1 || pos.z < 0) {
                this.hpBar.style.display = 'none';
            } else {
                this.hpBar.style.display = 'block';
                const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;
                this.hpBar.style.left = `${x}px`;
                this.hpBar.style.top = `${y}px`;
            }
        }
    }

    destroy() {
        scene.remove(this.mesh);
        if(this.label) this.label.remove();
        if(this.hpBar) this.hpBar.remove(); 
    }
}