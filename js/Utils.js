import * as THREE from 'three';
import { camera } from './Globals.js';

// Crée un label HTML (div) et l'ajoute au DOM
export function createLabel(text, parentObject, offset, className) {
    const div = document.createElement('div');
    div.className = 'world-label ' + (className || '');
    div.textContent = text;
    
    // On l'ajoute au conteneur prévu dans index.html
    const container = document.getElementById('labels-container');
    if (container) {
        container.appendChild(div);
    }

    // On retourne un objet qui contient l'élément HTML et une fonction pour le supprimer
    return {
        element: div,
        parent: parentObject,
        offset: offset || new THREE.Vector3(0,0,0),
        remove: () => {
            if (div.parentNode) div.parentNode.removeChild(div);
        }
    };
}

// Met à jour la position du label à chaque frame pour qu'il suive le joueur 3D
export function updateLabel(labelData, mesh, offset) {
    if (!labelData || !mesh) return;

    // 1. Récupérer la position absolue du mesh dans le monde 3D
    const pos = new THREE.Vector3();
    mesh.getWorldPosition(pos);
    
    // 2. Ajouter l'offset (ex: 3 unités au-dessus de la tête)
    if (offset) pos.add(offset);

    // 3. Projeter cette position 3D sur l'écran 2D (Camera Projection)
    pos.project(camera);

    // 4. Convertir les coordonnées normalisées (-1 à +1) en pixels écran
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

    // 5. Cacher si l'objet est derrière la caméra ou trop loin
    // (pos.z > 1 veut dire que c'est derrière le plan de la caméra)
    if (Math.abs(pos.z) > 1) {
        labelData.element.style.display = 'none';
    } else {
        labelData.element.style.display = 'block';
        labelData.element.style.left = `${x}px`;
        labelData.element.style.top = `${y}px`;
    }
}

// A ajouter dans Utils.js

export function createFloatingText(text, pos3D, color = '#fff') {
    const div = document.createElement('div');
    div.className = 'floating-text';
    div.textContent = text;
    div.style.color = color;

    // Calcul de la position écran (comme pour les labels)
    const pos = pos3D.clone();
    pos.y += 2.0; // On le fait apparaître un peu au-dessus de l'objet
    pos.project(camera);

    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

    div.style.left = `${x}px`;
    div.style.top = `${y}px`;

    document.body.appendChild(div);

    // Suppression automatique après la fin de l'animation CSS (0.8s)
    setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
    }, 800);
}