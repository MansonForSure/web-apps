// world.js — low-poly builders for islands, blocks, trees, jump pads and decorations.
// Shared geometries/materials are created once; per-level instanced decor is rebuilt per level.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

export const MATERIALS = {
  grass: std('#8fd16f'),
  dirt: std('#c08a5e'),
  rock: std('#a07a5c'),
  stone: std('#efe5d1', { roughness: 0.8 }),
  mover: std('#5aa9e6', { roughness: 0.6 }),
  crumble: std('#e0ae78'),
  trunk: std('#7a5236'),
  leafA: std('#3f9a5a'),
  leafB: std('#5cb86c'),
  tuft: std('#6dbb55'),
  pebble: std('#c9bfae'),
  flowerA: std('#ffe066', { emissive: '#ffcc33', emissiveIntensity: 0.15 }),
  flowerB: std('#ff8fb1', { emissive: '#ff6f9b', emissiveIntensity: 0.15 }),
  padBase: std('#2b2a35', { roughness: 0.5 }),
  padTop: std('#ff5b2e', { emissive: '#ff5b2e', emissiveIntensity: 1.4, roughness: 0.4 }),
};

const GEO = {
  trunk: new THREE.CylinderGeometry(0.14, 0.2, 1, 6).translate(0, 0.5, 0),
  leafLow: new THREE.ConeGeometry(0.9, 1.4, 7).translate(0, 1.5, 0),
  leafHigh: new THREE.ConeGeometry(0.65, 1.1, 7).translate(0, 2.15, 0),
  tuft: new THREE.ConeGeometry(0.09, 0.32, 4).translate(0, 0.16, 0),
  pebble: new THREE.DodecahedronGeometry(0.22, 0),
  flower: new THREE.IcosahedronGeometry(0.09, 0),
  padBase: new THREE.CylinderGeometry(0.95, 1.05, 0.25, 16).translate(0, 0.125, 0),
  padTop: new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16).translate(0, 0.29, 0),
};

/** Seeded jitter keeps islands organic but identical every visit. Vertices at `lockY` heights stay put. */
function jitter(geometry, amount, rand, lockY = []) {
  const pos = geometry.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    if (lockY.some((y) => Math.abs(pos.getY(i) - y) < 1e-3)) continue; // seams with neighbouring layers
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]);
    const [dx, dy, dz] = seen.get(key);
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// #region island
export function buildIsland(x, top, z, r, rand) {
  const group = new THREE.Group();
  const segs = r >= 4 ? 12 : 9;
  const turf = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 0.55, segs), MATERIALS.grass);
  turf.position.set(x, top - 0.275, z);
  const dirt = new THREE.Mesh(jitter(new THREE.CylinderGeometry(r * 0.97, r * 0.86, 0.7, segs, 2), 0.16, rand, [0.35, -0.35]), MATERIALS.dirt);
  dirt.position.set(x, top - 0.9, z);
  const depth = r * 1.3 + 1.2;
  // Jitter the cone, but keep its wide rim (y = -depth/2, before flipping) welded to the dirt.
  const rockGeo = jitter(new THREE.ConeGeometry(r * 0.86, depth, segs, 3), r * 0.16, rand, [-depth / 2]);
  rockGeo.rotateX(Math.PI);
  const rock = new THREE.Mesh(rockGeo, MATERIALS.rock);
  rock.position.set(x, top - 1.25 - depth / 2, z);
  rock.rotation.y = rand() * Math.PI;
  for (const m of [turf, dirt, rock]) { m.castShadow = true; m.receiveShadow = true; }
  group.add(turf, dirt, rock);
  return group;
}
// #endregion

export function buildBlock(x, top, z, w, d, h, material) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.14, h / 3)), material);
  mesh.position.set(x, top - h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildPad(x, top, z) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(GEO.padBase, MATERIALS.padBase);
  const disc = new THREE.Mesh(GEO.padTop, MATERIALS.padTop);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base, disc);
  group.position.set(x, top, z);
  group.userData.disc = disc;
  return group;
}

const DECOR_MATERIAL = { leafLow: 'leafA', leafHigh: 'leafB' };

/**
 * Decor collects transforms for many small things, then turns each kind into ONE
 * InstancedMesh. Hundreds of tufts and flowers cost a handful of draw calls.
 */
// #region decor
export class Decor {
  constructor() {
    this.items = { trunk: [], leafLow: [], leafHigh: [], tuft: [], pebble: [], flowerA: [], flowerB: [] };
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }

  add(kind, x, y, z, scale = 1, yaw = 0, sy = scale) {
    this.q.setFromEuler(this.e.set(0, yaw, 0));
    this.items[kind].push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q.clone(), new THREE.Vector3(scale, sy, scale)));
  }

  tree(x, y, z, s, rand) {
    const yaw = rand() * Math.PI;
    this.add('trunk', x, y, z, s, yaw, s * 1.2);
    this.add('leafLow', x, y, z, s, yaw);
    this.add('leafHigh', x, y, z, s, yaw + 0.5);
  }

  scatter(x, top, z, r, rand, density = 1) {
    const n = Math.round(r * r * 1.4 * density);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * (r - 0.4);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const roll = rand();
      if (roll < 0.62) this.add('tuft', px, top, pz, 0.8 + rand() * 0.8, rand() * 6);
      else if (roll < 0.74) this.add('flowerA', px, top + 0.12, pz, 0.8 + rand() * 0.6);
      else if (roll < 0.86) this.add('flowerB', px, top + 0.12, pz, 0.8 + rand() * 0.6);
      else this.add('pebble', px, top + 0.05, pz, 0.5 + rand() * 0.8, rand() * 6, 0.35 + rand() * 0.3);
    }
  }

  // #region decor-build
  build(group) {
    const meshes = [];
    for (const [kind, list] of Object.entries(this.items)) {
      if (!list.length) continue;
      const geo = GEO[kind] ?? GEO.flower;
      const inst = new THREE.InstancedMesh(geo, MATERIALS[DECOR_MATERIAL[kind] ?? kind], list.length);
      list.forEach((mat, i) => inst.setMatrixAt(i, mat));
      inst.castShadow = kind === 'trunk' || kind.startsWith('leaf');
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      group.add(inst);
      meshes.push(inst);
    }
    return meshes;
  }
  // #endregion
}
// #endregion
