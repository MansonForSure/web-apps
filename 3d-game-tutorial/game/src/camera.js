// camera.js — the Lesson 4 chase camera plus trauma-based screen shake (Lesson 11).
import * as THREE from 'three';
import { CAMERA } from './config.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.distance = CAMERA.distance;
    this.yaw = 0;
    this.pitch = CAMERA.pitch;
    this.focus = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.trauma = 0;
    this.shakeTime = 0;
    this.snapped = false;
    this.shift = 0;       // sideways framing offset (menus push the robot off-centre)
    this.shiftGoal = 0;
    this.lift = 0;        // vertical framing offset (portrait title screen)
    this.liftGoal = 0;
  }

  reset(yaw, pitch = CAMERA.pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.snapped = false;
  }

  /** Add screen shake. 0.2 = bump, 0.5 = hit, 1 = earthquake. */
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt, target, look = { x: 0, y: 0 }) {
    this.yaw -= look.x * CAMERA.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);

    this.goal.copy(target);
    this.goal.y += 1.15;
    if (!this.snapped) { this.focus.copy(this.goal); this.snapped = true; }
    else {
      // Follow horizontally a little faster than vertically: jumps feel less floaty.
      const kx = 1 - Math.exp(-CAMERA.smoothing * dt);
      const ky = 1 - Math.exp(-CAMERA.smoothing * 0.6 * dt);
      this.focus.x += (this.goal.x - this.focus.x) * kx;
      this.focus.z += (this.goal.z - this.focus.z) * kx;
      this.focus.y += (this.goal.y - this.focus.y) * ky;
    }

    const cp = Math.cos(this.pitch);
    this.offset.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
    this.shift += (this.shiftGoal - this.shift) * (1 - Math.exp(-3 * dt));
    if (Math.abs(this.shift) > 1e-3) this.camera.translateX(this.shift);
    this.lift += (this.liftGoal - this.lift) * (1 - Math.exp(-3 * dt));
    if (Math.abs(this.lift) > 1e-3) this.camera.translateY(this.lift);

    // Trauma shake: strength = trauma², so small hits stay subtle and big ones punch.
    // #region shake
    if (this.trauma > 0) {
      this.shakeTime += dt;
      const s = this.trauma * this.trauma;
      const t = this.shakeTime;
      this.camera.position.x += (Math.sin(t * 41.3) + Math.sin(t * 23.1)) * 0.22 * s;
      this.camera.position.y += (Math.sin(t * 37.7) + Math.sin(t * 19.9)) * 0.22 * s;
      this.camera.rotateZ(Math.sin(t * 31.7) * 0.05 * s);
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
    }
    // #endregion
  }

  toWorld(move, out = new THREE.Vector3()) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return out.set(move.x * cos - move.y * sin, 0, -move.x * sin - move.y * cos);
  }
}
