// physics.js — kinematic platformer physics (the Lesson 6 kit, extended with cylinders).
// A body is a vertical cylinder: position = feet, plus radius and height.
// Colliders are boxes (axis-aligned) or upright cylinders (round islands, tree trunks).
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

export function boxCollider(x, top, z, w, d, h, props = {}) {
  return {
    shape: 'box',
    min: new THREE.Vector3(x - w / 2, top - h, z - d / 2),
    max: new THREE.Vector3(x + w / 2, top, z + d / 2),
    delta: new THREE.Vector3(),
    ...props,
  };
}

export function cylCollider(x, top, z, radius, h, props = {}) {
  return {
    shape: 'cyl',
    x, z, radius,
    min: new THREE.Vector3(x - radius, top - h, z - radius),
    max: new THREE.Vector3(x + radius, top, z + radius),
    delta: new THREE.Vector3(),
    ...props,
  };
}

/** Move a collider by (dx, dy, dz) this frame and remember the motion for riders. */
export function translateCollider(c, dx, dy, dz) {
  c.min.x += dx; c.min.y += dy; c.min.z += dz;
  c.max.x += dx; c.max.y += dy; c.max.z += dz;
  if (c.shape === 'cyl') { c.x += dx; c.z += dz; }
  c.delta.set(dx, dy, dz);
}

/** Distance (squared) on the ground plane from p to the collider's footprint. */
function footprintDistSq(p, c) {
  if (c.shape === 'cyl') {
    const d = Math.max(0, Math.hypot(p.x - c.x, p.z - c.z) - c.radius);
    return d * d;
  }
  const dx = p.x - clamp(p.x, c.min.x, c.max.x);
  const dz = p.z - clamp(p.z, c.min.z, c.max.z);
  return dx * dx + dz * dz;
}

/** Is p at least `margin` inside the footprint? Used to remember safe respawn spots. */
export function insideFootprint(p, c, margin) {
  if (c.shape === 'cyl') return Math.hypot(p.x - c.x, p.z - c.z) <= c.radius - margin;
  return p.x >= c.min.x + margin && p.x <= c.max.x - margin && p.z >= c.min.z + margin && p.z <= c.max.z - margin;
}

// #region move
export function moveBody(body, colliders, dt) {
  const p = body.position;
  const v = body.velocity;

  if (body.ground && !body.ground.disabled) p.add(body.ground.delta); // ride platforms

  const prevFeet = p.y;
  const prevHead = p.y + body.height;
  const wasGrounded = body.grounded;
  p.addScaledVector(v, dt);
  body.grounded = false;
  body.ground = null;

  // #region move-ground
  const footR = body.radius * 0.9;
  for (const c of colliders) {
    if (c.disabled || footprintDistSq(p, c) > footR * footR) continue;
    const prevTop = c.max.y - c.delta.y;
    if (v.y <= 0 && prevFeet >= prevTop - 0.02 && p.y <= c.max.y) {
      p.y = c.max.y;
      v.y = 0;
      body.grounded = true;
      body.ground = c;
    } else if (v.y > 0 && prevHead <= c.min.y + 0.02 && p.y + body.height > c.min.y) {
      p.y = c.min.y - body.height;
      v.y = 0;
    }
  }
  // #endregion

  for (const c of colliders) {
    if (c.disabled) continue;
    if (p.y >= c.max.y - 0.01 || p.y + body.height <= c.min.y) continue;
    // #region move-step
    // Step up onto low ledges (jump pads, small rims) instead of treating them as walls.
    const rise = c.max.y - p.y;
    if (wasGrounded && rise <= (body.stepHeight ?? 0) && footprintDistSq(p, c) < body.radius * body.radius) {
      p.y = c.max.y;
      v.y = Math.max(v.y, 0);
      body.grounded = true;
      body.ground = c;
      continue;
    }
    if (c.shape === 'cyl') pushOutCyl(body, c);
    else pushOutBox(body, c);
    // #endregion
  }
}
// #endregion

function slide(body, nx, nz) {
  const into = body.velocity.x * nx + body.velocity.z * nz;
  if (into < 0) {
    body.velocity.x -= into * nx;
    body.velocity.z -= into * nz;
  }
}

// #region cyl
function pushOutCyl(body, c) {
  const p = body.position;
  let dx = p.x - c.x;
  let dz = p.z - c.z;
  let d = Math.hypot(dx, dz);
  const minD = c.radius + body.radius;
  if (d >= minD) return;
  if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
  const nx = dx / d;
  const nz = dz / d;
  p.x = c.x + nx * minD;
  p.z = c.z + nz * minD;
  slide(body, nx, nz);
}
// #endregion

function pushOutBox(body, c) {
  const p = body.position;
  const r = body.radius;
  const cx = clamp(p.x, c.min.x, c.max.x);
  const cz = clamp(p.z, c.min.z, c.max.z);
  let nx = p.x - cx;
  let nz = p.z - cz;
  const d2 = nx * nx + nz * nz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx /= d; nz /= d;
    p.x = cx + nx * r;
    p.z = cz + nz * r;
  } else {
    const exits = [
      [p.x - c.min.x, -1, 0], [c.max.x - p.x, 1, 0],
      [p.z - c.min.z, 0, -1], [c.max.z - p.z, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    [, nx, nz] = exits[0];
    if (nx) p.x = nx < 0 ? c.min.x - r : c.max.x + r;
    else p.z = nz < 0 ? c.min.z - r : c.max.z + r;
  }
  slide(body, nx, nz);
}
