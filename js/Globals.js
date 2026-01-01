import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87CEEB, 60, 200); 

export const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 1000);

export const gameData = {
    player: null,
    actors: [],
    mobs: new Map() // NOUVEAU : Pour stocker les cochons vivants
};