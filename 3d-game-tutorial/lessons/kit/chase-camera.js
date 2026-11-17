// chase-camera.js — a third-person camera that orbits and follows a target.
// Built in Lesson 4, used by every demo after it.
import * as THREE from 'three';
import { damp } from './stage.js';

// #region class
export class ChaseCamera {
  constructor(camera, {
    distance = 7,        // how far behind the target
    height = 1.2,        // look at the target's chest, not its feet
    yaw = 0,             // horizontal angle around the target (radians)
    pitch = 0.4,         // vertical angle: 0 = level, higher = looking down
    minPitch = -0.15,
    maxPitch = 1.25,
    sensitivity = 0.006, // radians per dragged pixel
    smoothing = 9,       // how quickly the camera catches up (0 = instantly)
  } = {}) {
    Object.assign(this, { camera, distance, height, yaw, pitch, minPitch, maxPitch, sensitivity, smoothing });
    this.focus = new THREE.Vector3();  // the smoothed point we look at
    this.offset = new THREE.Vector3();
    this.snapped = false;
  }
  // #endregion

  // #region update
  update(dt, targetPosition, look = { x: 0, y: 0 }) {
    // 1. Dragging turns the camera around the target.
    this.yaw -= look.x * this.sensitivity;
    this.pitch += look.y * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);

    // 2. The focus point chases the target smoothly (snaps on the first frame).
    const goal = targetPosition.clone();
    goal.y += this.height;
    if (!this.snapped || this.smoothing === 0) { this.focus.copy(goal); this.snapped = true; }
    else this.focus.lerp(goal, damp(this.smoothing, dt));

    // 3. Spherical coordinates -> an offset vector behind and above the focus point.
    const cosPitch = Math.cos(this.pitch);
    this.offset.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    ).multiplyScalar(this.distance);

    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
  }
  // #endregion

  // #region toWorld
  /** Turn stick/keys input (x = right, y = forward) into a world direction on the ground. */
  toWorld(move, out = new THREE.Vector3()) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = from camera towards target, flattened: (-sin, 0, -cos)
    // right   = forward rotated 90° clockwise:          ( cos, 0, -sin)
    out.set(
      move.x * cos - move.y * sin,
      0,
      -move.x * sin - move.y * cos,
    );
    return out;
  }
  // #endregion
}
