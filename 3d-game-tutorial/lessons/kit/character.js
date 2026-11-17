// character.js — load a rigged glTF model and drive its animations. Built in Lesson 8.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// #region load
export async function loadCharacter(url, { height = 1.6 } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  // Models arrive in whatever size the artist used. Measure, then scale to our units.
  model.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.setScalar(height / size.y);

  model.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });

  // `root` is the logical object the game moves. The model is a child that only
  // plays animations in place, so the visuals can never drift from the physics.
  const root = new THREE.Group();
  root.add(model);
  return new Character(root, model, gltf.animations);
}
// #endregion

// #region class
export class Character {
  constructor(root, model, clips) {
    this.root = root;
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
  }

  /** Cross-fade to an animation by name. One-shots play once and hold the last frame. */
  play(name, { fade = 0.2, once = false, timeScale = 1 } = {}) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.play();
    if (this.current) next.crossFadeFrom(this.current, fade, true);
    this.current = next;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
// #endregion

// #region animate
/** Pick the right animation from what the player controller is doing. */
export function animateFromController(character, player) {
  const speed = player.horizontalSpeed;
  if (!player.grounded && player.airTime > 0.08) {
    character.play('Jump', { once: true, fade: 0.12, timeScale: 1.3 });
  } else if (speed > 4) {
    character.play('Running', { timeScale: speed / 6 });
  } else if (speed > 0.4) {
    character.play('Walking', { timeScale: 1.2 });
  } else {
    character.play('Idle', { fade: 0.3 });
  }
  // The running clip's speed follows how fast we actually move: no moonwalking.
  if (character.current === character.actions.Running) {
    character.current.timeScale = THREE.MathUtils.clamp(speed / 6, 0.6, 1.4);
  }
  character.root.position.copy(player.position);
  character.root.rotation.y = player.facing;
}
// #endregion
