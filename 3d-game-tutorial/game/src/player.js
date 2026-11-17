// player.js — the robot: controller (Lessons 3–6), animation (Lesson 8), health (Lesson 9).
import * as THREE from 'three';
import { PLAYER, RULES } from './config.js';
import { moveBody, insideFootprint } from './physics.js';

const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export class Player {
  constructor(character) {
    this.character = character;
    this.root = character.root;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.stepHeight = 0.4;     // can walk onto ledges this high (jump pads)
    this.facing = 0;
    this.grounded = false;
    this.ground = null;
    this.airTime = 0;
    this.bufferTimer = 0;
    this.jumpCut = false;
    this.hearts = RULES.hearts;
    this.invulnerable = 0;
    this.stun = 0;
    this.alive = true;
    this.celebrating = false;
    this.posing = false;       // menus drive the animation directly
    this.lastSafe = new THREE.Vector3();
    this.safeTimer = 0;
    this.squash = 1;
    this.events = { jump() {}, land() {} };
    this._wish = new THREE.Vector3();
  }

  spawn(position, facing) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.lastSafe.copy(position);
    this.facing = facing;
    this.hearts = RULES.hearts;
    this.invulnerable = 0;
    this.stun = 0;
    this.alive = true;
    this.celebrating = false;
    this.posing = false;
    this.grounded = false;
    this.ground = null;
    this.airTime = 0;
    this.bufferTimer = 0;
    this.character.model.visible = true;
    this.character.play('Idle', { fade: 0 });
    this.sync();
  }

  respawn() {
    this.position.copy(this.lastSafe);
    this.velocity.set(0, 0, 0);
    this.ground = null;
    this.grounded = false;
    this.invulnerable = RULES.invulnerable;
  }

  get center() {
    return this.position.y + this.height * 0.5;
  }

  update(dt, input, chase, colliders, control = true) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.stun = Math.max(0, this.stun - dt);
    const canSteer = control && this.alive && this.stun <= 0 && !this.celebrating;

    // #region steer
    // Horizontal steering, camera-relative.
    const move = canSteer ? input.getMove() : { x: 0, y: 0 };
    const wish = chase.toWorld(move, this._wish).multiplyScalar(PLAYER.speed);
    const k = this.stun > 0 ? 1.5 : this.grounded ? PLAYER.accel : PLAYER.airAccel;
    const a = damp(k, dt);
    this.velocity.x += (wish.x - this.velocity.x) * a;
    this.velocity.z += (wish.z - this.velocity.z) * a;
    if (wish.lengthSq() > 0.05) {
      this.facing += angleDelta(this.facing, Math.atan2(wish.x, wish.z)) * damp(14, dt);
    }
    // #endregion

    // #region jump
    // Jump: buffer + coyote time.
    const pressed = input.consumeJump();
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.bufferTimer = pressed && canSteer ? PLAYER.jumpBuffer : this.bufferTimer - dt;
    if (this.bufferTimer > 0 && this.airTime <= PLAYER.coyoteTime) {
      this.launch(PLAYER.jumpSpeed, true);
      this.squash = 1.25;
      this.events.jump();
    }
    // #endregion

    // #region gravity
    // Gravity; heavier when the jump button is released early (short hops).
    const rising = this.velocity.y > 0;
    const g = PLAYER.gravity * (rising && this.jumpCut && !input.jumpHeld ? PLAYER.lowJumpGravity : 1);
    this.velocity.y = Math.max(this.velocity.y - g * dt, -PLAYER.maxFall);

    const wasGrounded = this.grounded;
    const fallSpeed = -this.velocity.y;
    moveBody(this, colliders, dt);
    if (!wasGrounded && this.grounded) {
      this.squash = 1 - Math.min(fallSpeed / 34, 0.35);
      this.events.land(fallSpeed);
    }
    // #endregion

    // #region safe
    // Remember a safe spot to respawn at: solid, static ground, away from the edge.
    const g0 = this.ground;
    if (this.grounded && g0 && !g0.mover && !g0.crumble && !g0.pad && !g0.tree && insideFootprint(this.position, g0, 0.8)) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.25) {
        this.lastSafe.copy(this.position);
        this.safeTimer = 0;
      }
    } else {
      this.safeTimer = 0;
    }
  }

  /** Throw the player upward (jumps, jump pads, enemy stomps). */
    // #endregion
  // #region launch
  launch(vy, cuttable = false) {
    this.velocity.y = vy;
    this.grounded = false;
    this.ground = null;
    this.airTime = Infinity;
    this.bufferTimer = 0;
    this.jumpCut = cuttable;
  }
  // #endregion

  /** Returns true if the hit landed (false while invulnerable). */
  // #region hurt
  hurt(from) {
    if (this.invulnerable > 0 || !this.alive || this.celebrating) return false;
    this.hearts -= 1;
    this.invulnerable = RULES.invulnerable;
    this.stun = RULES.stun;
    const away = new THREE.Vector3(this.position.x - from.x, 0, this.position.z - from.z);
    if (away.lengthSq() < 1e-4) away.set(Math.sin(this.facing), 0, Math.cos(this.facing)).negate();
    away.normalize().multiplyScalar(RULES.knockback);
    this.velocity.set(away.x, 0, away.z);
    this.launch(6.5);
    return true;
  }
  // #endregion

  die() {
    this.alive = false;
    this.velocity.x = this.velocity.z = 0;
    this.character.model.visible = true;
    this.character.play('Death', { once: true, fade: 0.15 });
  }

  celebrate() {
    this.celebrating = true;
    this.velocity.x = this.velocity.z = 0;
    this.character.play('Dance', { fade: 0.3 });
  }

  // #region animate
  animate(dt, elapsed, cameraYaw) {
    const c = this.character;
    if (this.alive && !this.celebrating && !this.posing) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (!this.grounded && this.airTime > 0.1) c.play('Jump', { once: true, fade: 0.12, timeScale: 1.25 });
      else if (speed > 3.8) c.play('Running', { fade: 0.18 });
      else if (speed > 0.5) c.play('Walking', { fade: 0.2, timeScale: 1.3 });
      else c.play('Idle', { fade: 0.3 });
      if (c.currentName === 'Running') c.current.timeScale = THREE.MathUtils.clamp(speed / 6, 0.7, 1.35);
    }
    if (this.celebrating) {
      // Turn to face the camera while dancing.
      this.facing += angleDelta(this.facing, cameraYaw) * damp(4, dt);
    }
    c.update(dt);

    // Blink while invulnerable.
    c.model.visible = !(this.alive && this.invulnerable > 0 && Math.floor(elapsed * 14) % 2 === 0);

    this.squash += (1 - this.squash) * damp(12, dt);
    const s = this.squash;
    c.pivot.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    this.sync();
  }
  // #endregion

  sync() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
  }
}
