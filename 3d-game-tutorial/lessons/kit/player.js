// player.js — the platformer controller from Lessons 3–6 in one reusable class.
// It knows nothing about meshes: it only moves a position. Anything can follow it.
import * as THREE from 'three';
import { moveBody } from './physics.js';
import { angleDelta, damp } from './stage.js';

// #region class
export class PlayerController {
  constructor({
    speed = 6.5,        // top running speed (units per second)
    accel = 14,         // how quickly we reach that speed on the ground
    airAccel = 6,       // weaker steering in the air
    jumpSpeed = 9.2,    // initial upward velocity of a jump
    gravity = 26,       // downward acceleration
    coyoteTime = 0.12,  // seconds you can still jump after running off a ledge
    jumpBuffer = 0.12,  // seconds a jump press is remembered before landing
  } = {}) {
    Object.assign(this, { speed, accel, airAccel, jumpSpeed, gravity, coyoteTime, jumpBuffer });
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = 0.4;
    this.height = 1.6;
    this.facing = 0;           // yaw in radians, 0 = looking down +Z
    this.grounded = false;
    this.ground = null;
    this.airTime = 0;
    this.bufferTimer = 0;
    this.onJump = () => {};
    this.onLand = () => {};
  }
  // #endregion

  // #region update
  update(dt, input, chaseCamera, colliders) {
    // --- Horizontal: steer towards the wished-for velocity -------------------
    const wish = chaseCamera.toWorld(input.getMove()).multiplyScalar(this.speed);
    const a = damp(this.grounded ? this.accel : this.airAccel, dt);
    this.velocity.x += (wish.x - this.velocity.x) * a;
    this.velocity.z += (wish.z - this.velocity.z) * a;

    // Turn to face where we are going (shortest way round).
    if (wish.lengthSq() > 0.05) {
      const target = Math.atan2(wish.x, wish.z);
      this.facing += angleDelta(this.facing, target) * damp(14, dt);
    }

    // --- Jumping with coyote time + jump buffering ---------------------------
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.bufferTimer = input.consumeJump() ? this.jumpBuffer : this.bufferTimer - dt;
    if (this.bufferTimer > 0 && this.airTime <= this.coyoteTime) {
      this.velocity.y = this.jumpSpeed;
      this.bufferTimer = 0;
      this.airTime = Infinity; // no second jump from coyote time
      this.grounded = false;
      this.ground = null;
      this.onJump();
    }

    // --- Gravity (stronger when you let go of jump = variable jump height) ---
    const rising = this.velocity.y > 0;
    const g = rising && !input.jumpHeld ? this.gravity * 2.2 : this.gravity;
    this.velocity.y = Math.max(this.velocity.y - g * dt, -30);

    // --- Move and collide ------------------------------------------------------
    const wasGrounded = this.grounded;
    const fallSpeed = -this.velocity.y;
    moveBody(this, colliders, dt);
    if (!wasGrounded && this.grounded) this.onLand(fallSpeed);
  }
  // #endregion

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
}
