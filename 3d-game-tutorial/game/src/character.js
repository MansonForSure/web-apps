// character.js — load the rigged robot and cross-fade its animation clips (Lesson 8).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// #region load
export async function loadCharacter(url, { height = 1.6, onProgress } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => {
    if (e.lengthComputable) onProgress?.(e.loaded / e.total);
  });
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const scale = height / (box.max.y - box.min.y);
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale; // feet exactly at the root's origin
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // skinned parts can animate outside their static bounds
    }
  });
  const root = new THREE.Group();
  const pivot = new THREE.Group(); // squash & stretch happens here, animation below it
  pivot.add(model);
  root.add(pivot);
  return new Character(root, pivot, model, gltf.animations);
}
// #endregion

export class Character {
  constructor(root, pivot, model, clips) {
    this.root = root;
    this.pivot = pivot;
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.currentName = '';
  }

  // #region play
  play(name, { fade = 0.2, once = false, timeScale = 1 } = {}) {
    const next = this.actions[name];
    if (!next || name === this.currentName) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.play();
    if (this.current) next.crossFadeFrom(this.current, fade, true);
    this.current = next;
    this.currentName = name;
  }
  // #endregion

  update(dt) {
    this.mixer.update(dt);
  }
}
