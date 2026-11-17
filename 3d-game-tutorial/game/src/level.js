// level.js — turns a level definition (levels.js) into a living world, and cleans it up again.
import * as THREE from 'three';
import { boxCollider, cylCollider, translateCollider } from './physics.js';
import { buildIsland, buildBlock, buildPad, Decor, MATERIALS } from './world.js';
import { Core, Portal } from './pickups.js';
import { Spiker } from './enemy.js';
import { mulberry32 } from './sky.js';
import { RULES } from './config.js';

const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export class Level {
  constructor(def, scene) {
    this.def = def;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.movers = [];
    this.crumbles = [];
    this.pads = [];
    this.cores = [];
    this.enemies = [];
    this.ownedGeometries = [];
    this.instanced = [];

    const rand = mulberry32(hashString(def.id));
    const decor = new Decor();
    const tops = [];

    // #region build-islands
    for (const isl of def.islands) {
      const [x, top, z] = isl.at;
      const mesh = buildIsland(x, top, z, isl.r, rand);
      this.group.add(mesh);
      mesh.traverse((o) => o.isMesh && this.ownedGeometries.push(o.geometry));
      this.colliders.push(cylCollider(x, top, z, isl.r, 1.1, { kind: 'island' }));
      decor.scatter(x, top, z, isl.r, rand, isl.decor ?? 1);
      for (const [dx, dz, s] of isl.trees ?? []) {
        decor.tree(x + dx, top, z + dz, s, rand);
        this.colliders.push(cylCollider(x + dx, top + 2.6 * s, z + dz, 0.5 * s, 2.6 * s, { tree: true }));
      }
      tops.push(top);
    }
    // #endregion

    for (const b of def.blocks ?? []) {
      const [x, top, z] = b.at;
      const [w, d, h] = b.size;
      const mesh = buildBlock(x, top, z, w, d, h, MATERIALS.stone);
      this.group.add(mesh);
      this.ownedGeometries.push(mesh.geometry);
      this.colliders.push(boxCollider(x, top, z, w, d, h, { kind: 'block' }));
      tops.push(top);
    }

    for (const m of def.movers ?? []) {
      const [x, top, z] = m.at;
      const [w, d, h] = m.size;
      const mesh = buildBlock(x, top, z, w, d, h, MATERIALS.mover);
      this.group.add(mesh);
      this.ownedGeometries.push(mesh.geometry);
      const c = boxCollider(x, top, z, w, d, h, { kind: 'mover', mover: true });
      const mover = { c, mesh, origin: new THREE.Vector3(x, top, z), axis: AXES[m.axis], amp: m.amp, speed: m.speed, phase: m.phase ?? 0, offset: new THREE.Vector3() };
      this.movers.push(mover);
      this.colliders.push(c);
      this.#placeMover(mover, 0, true);
      tops.push(top - (m.axis === 'y' ? m.amp : 0));
    }

    for (const cr of def.crumbles ?? []) {
      const [x, top, z] = cr.at;
      const [w, d, h] = cr.size;
      const mesh = buildBlock(x, top, z, w, d, h, MATERIALS.crumble);
      this.group.add(mesh);
      this.ownedGeometries.push(mesh.geometry);
      const c = boxCollider(x, top, z, w, d, h, { kind: 'crumble', crumble: true });
      this.crumbles.push({ c, mesh, home: mesh.position.clone(), state: 'idle', t: 0, vy: 0 });
      this.colliders.push(c);
    }

    for (const p of def.pads ?? []) {
      const [x, top, z] = p.at;
      const mesh = buildPad(x, top, z);
      this.group.add(mesh);
      const c = cylCollider(x, top + 0.33, z, 0.95, 0.33, { kind: 'pad', pad: p.power ?? RULES.padPower });
      this.pads.push({ c, mesh, bounce: 0 });
      this.colliders.push(c);
    }

    def.cores.forEach(([x, y, z], i) => this.cores.push(new Core(x, y, z, this.group, i)));
    for (const e of def.enemies ?? []) this.enemies.push(new Spiker(e, this.group));
    const { at, yaw } = def.portal;
    this.portal = new Portal(at[0], at[1], at[2], yaw ?? 0, this.group);

    this.instanced = decor.build(this.group);
    this.killY = Math.min(...tops) - 12;
    this.totalCores = this.cores.length;
  }

  // Sine-wave movers: position = origin + axis * sin(t * speed + phase) * amp
  // #region movers
  #placeMover(m, t, initial = false) {
    const s = Math.sin(t * m.speed + m.phase) * m.amp;
    const nx = m.axis[0] * s;
    const ny = m.axis[1] * s;
    const nz = m.axis[2] * s;
    if (initial) {
      translateCollider(m.c, nx, ny, nz);
      m.c.delta.set(0, 0, 0);
    } else {
      translateCollider(m.c, nx - m.offset.x, ny - m.offset.y, nz - m.offset.z);
    }
    m.offset.set(nx, ny, nz);
    m.mesh.position.set(m.origin.x + nx, m.origin.y - (m.c.max.y - m.c.min.y) / 2 + ny, m.origin.z + nz);
  }
  // #endregion

  update(dt, t, player, sfx) {
    for (const m of this.movers) this.#placeMover(m, t);

    // #region crumbles
    for (const cr of this.crumbles) {
      cr.t += dt;
      if (cr.state === 'idle' && player.ground === cr.c) {
        cr.state = 'shaking';
        cr.t = 0;
      } else if (cr.state === 'shaking') {
        const k = cr.t / RULES.crumbleDelay;
        cr.mesh.position.set(
          cr.home.x + (Math.random() - 0.5) * 0.12 * k,
          cr.home.y,
          cr.home.z + (Math.random() - 0.5) * 0.12 * k,
        );
        if (cr.t >= RULES.crumbleDelay) {
          cr.state = 'falling';
          cr.t = 0;
          cr.vy = 0;
          cr.c.disabled = true;
          sfx.crumble();
        }
      } else if (cr.state === 'falling') {
        cr.vy -= 22 * dt;
        cr.mesh.position.y += cr.vy * dt;
        cr.mesh.rotation.x += dt * 0.8;
        if (cr.t >= RULES.crumbleRespawn) {
          cr.state = 'respawn';
          cr.t = 0;
          cr.mesh.position.copy(cr.home);
          cr.mesh.rotation.set(0, 0, 0);
          cr.c.disabled = false;
        }
      } else if (cr.state === 'respawn') {
        const k = Math.min(1, cr.t / 0.3);
        cr.mesh.scale.setScalar(0.2 + 0.8 * k);
        if (k >= 1) cr.state = 'idle';
      }
    }
    // #endregion

    for (const pad of this.pads) {
      pad.bounce = Math.max(0, pad.bounce - dt * 4);
      pad.mesh.userData.disc.scale.y = 1 + Math.sin(pad.bounce * Math.PI) * 2.5;
    }

    for (const core of this.cores) core.update(dt, t);
    for (const enemy of this.enemies) if (enemy.alive) enemy.update(dt, t, player);
    this.portal.update(dt, t);
  }

  /** If the player just landed on a pad, return its launch speed. */
  padUnder(player) {
    if (!player.grounded) return 0;
    const pad = this.pads.find((p) => p.c === player.ground);
    if (!pad) return 0;
    pad.bounce = 1;
    return pad.c.pad;
  }

  // #region dispose
  dispose() {
    this.scene.remove(this.group);
    for (const g of this.ownedGeometries) g.dispose();
    for (const inst of this.instanced) inst.dispose();
    for (const core of this.cores) core.dispose();
    for (const enemy of this.enemies) enemy.dispose();
    this.portal.dispose();
  }
  // #endregion
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
