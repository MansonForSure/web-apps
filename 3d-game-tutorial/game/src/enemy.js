// enemy.js — "Spikers": hovering drones driven by a finite state machine (Lesson 9).
//
//   PATROL --sees player--> ALERT --0.45 s--> CHASE --lost player / too far from home--> RETURN --home--> PATROL
//   any state --stomped--> SQUASHED (gone)
import * as THREE from 'three';

const bodyGeo = new THREE.IcosahedronGeometry(0.52, 0);
const spikeGeo = new THREE.ConeGeometry(0.13, 0.42, 5).translate(0, 0.62, 0);
const eyeGeo = new THREE.SphereGeometry(0.2, 12, 8);
const pupilGeo = new THREE.SphereGeometry(0.1, 10, 6);
const bodyMat = new THREE.MeshStandardMaterial({ color: '#3b2f63', roughness: 0.55, flatShading: true });
const spikeMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.5, flatShading: true });
const eyeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
const SPIKE_DIRS = [
  [0, 0, 0], [Math.PI, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0],
  [0, 0, Math.PI / 2], [0, 0, -Math.PI / 2], [Math.PI / 4, 0, Math.PI / 4], [-Math.PI / 4, 0, -Math.PI / 4],
];

const HOVER = 0.75;     // height of the body centre above its platform
const RADIUS = 0.62;    // touch radius
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Spiker {
  constructor(def, parent) {
    this.path = def.path.map(([x, z]) => new THREE.Vector3(x, def.y + HOVER, z));
    this.speed = def.speed ?? 1.8;
    this.chaseSpeed = def.chaseSpeed ?? 3.6;
    this.sight = def.sight ?? 5.5;
    this.leash = def.leash ?? 6.5;
    this.home = this.path.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(this.path.length);

    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.body.add(new THREE.Mesh(bodyGeo, bodyMat));
    for (const [x, y, z] of SPIKE_DIRS) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.rotation.set(x, y, z);
      this.body.add(spike);
    }
    this.pupilMat = new THREE.MeshStandardMaterial({ color: '#1b1a22', emissive: '#ffb02e', emissiveIntensity: 1.6 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 0.05, 0.42);
    const pupil = new THREE.Mesh(pupilGeo, this.pupilMat);
    pupil.position.set(0, 0.05, 0.58);
    this.group.add(this.body, eye, pupil);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    this.alertMark = makeAlertSprite();
    this.alertMark.position.y = 1.35;
    this.alertMark.visible = false;
    this.group.add(this.alertMark);

    this.position = this.path[0].clone();
    this.group.position.copy(this.position);
    parent.add(this.group);

    this.state = 'patrol';
    this.stateTime = 0;
    this.target = this.path.length > 1 ? 1 : 0;
    this.facing = 0;
    this.cooldown = 0;
    this.alive = true;
    this.phase = Math.random() * 10;
  }

  setState(name) {
    this.state = name;
    this.stateTime = 0;
  }

  /** Move towards a point at a speed; returns true when we arrive. */
  moveTowards(goal, speed, dt) {
    const dx = goal.x - this.position.x;
    const dz = goal.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.facing += angleDelta(this.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    return dist <= step + 0.05;
  }

  canSee(player) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dy = player.center - this.position.y;
    return player.alive && Math.hypot(dx, dz) < this.sight && Math.abs(dy) < 2.6;
  }

  update(dt, t, player) {
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // #region fsm
    switch (this.state) {
      case 'patrol': {
        if (this.moveTowards(this.path[this.target], this.speed, dt)) {
          this.target = (this.target + 1) % this.path.length;
        }
        if (this.cooldown <= 0 && this.canSee(player)) this.setState('alert');
        break;
      }
      case 'alert': {
        // Wind-up: turn to face the player and hop. Gives you a moment to react.
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        this.facing += angleDelta(this.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        if (this.stateTime > 0.45) this.setState('chase');
        break;
      }
      // #region fsm-leash
      case 'chase': {
        const goal = player.position.clone();
        // Never leave the leash circle around home.
        const fromHome = new THREE.Vector3(goal.x - this.home.x, 0, goal.z - this.home.z);
        if (fromHome.length() > this.leash) fromHome.setLength(this.leash);
        goal.set(this.home.x + fromHome.x, this.position.y, this.home.z + fromHome.z);
        this.moveTowards(goal, this.chaseSpeed, dt);
        const lost = !this.canSee(player) && this.stateTime > 0.6;
        if (lost || !player.alive) this.setState('return');
        break;
      }
      // #endregion
      case 'return': {
        if (this.moveTowards(this.path[this.target], this.speed * 1.3, dt)) {
          this.cooldown = 1.0;
          this.setState('patrol');
        } else if (this.stateTime > 0.8 && this.canSee(player) && this.cooldown <= 0) {
          this.setState('alert');
        }
        break;
      }
      case 'squashed': {
        const k = Math.min(1, this.stateTime / 0.35);
        this.group.scale.set(1 + k * 0.6, Math.max(0.05, 1 - k), 1 + k * 0.6);
        if (k >= 1) { this.group.visible = false; this.alive = false; }
        return;
      }
    }
    // #endregion

    // Visuals: hover bob, spin, eye colour by state.
    const hop = this.state === 'alert' ? Math.sin(Math.min(1, this.stateTime / 0.45) * Math.PI) * 0.45 : 0;
    this.group.position.set(this.position.x, this.position.y + Math.sin(t * 3 + this.phase) * 0.12 + hop, this.position.z);
    this.group.rotation.y = this.facing;
    this.body.rotation.y += dt * (this.state === 'chase' ? 9 : 2.5);
    const angry = this.state === 'alert' || this.state === 'chase';
    this.pupilMat.emissive.set(angry ? '#ff2d55' : '#ffb02e');
    this.alertMark.visible = this.state === 'alert';
  }

  /**
   * Check contact with the player:
   *   'stomp' if the player falls onto our head, 'hurt' on any other touch, null otherwise.
   */
  // #region touch
  touch(player) {
    if (this.state === 'squashed') return null;
    const p = player.position;
    // Closest point on the player's vertical segment to our centre.
    const y = THREE.MathUtils.clamp(this.group.position.y, p.y + player.radius, p.y + player.height - player.radius);
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const dy = y - this.group.position.y;
    const reach = RADIUS + player.radius;
    if (dx * dx + dy * dy + dz * dz > reach * reach) return null;
    const falling = player.velocity.y < -0.5;
    const above = p.y > this.group.position.y - 0.05;
    return falling && above ? 'stomp' : 'hurt';
  }
  // #endregion

  squash() {
    this.setState('squashed');
    this.alertMark.visible = false;
  }

  dispose() {
    this.pupilMat.dispose();
    this.alertMark.material.dispose();
  }
}

let alertTexture = null;
function makeAlertSprite() {
  if (!alertTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ff2d55';
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '900 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 32, 35);
    alertTexture = new THREE.CanvasTexture(c);
    alertTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture, depthTest: false }));
  s.scale.setScalar(0.55);
  s.renderOrder = 5;
  return s;
}
