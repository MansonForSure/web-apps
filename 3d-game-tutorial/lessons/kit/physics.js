// physics.js — tiny "kinematic" physics for platformers.
// The player is a vertical capsule-ish cylinder (radius + height, position = feet).
// The world is made of axis-aligned boxes (AABBs). Built in Lesson 6.
import * as THREE from 'three';

// #region colliders
/** Build an AABB collider that wraps a (non-rotated) mesh. */
export function colliderFromMesh(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  return { min: box.min, max: box.max, mesh, delta: new THREE.Vector3() };
}

/** Call after moving a platform mesh: refreshes its box and remembers how far it moved. */
export function syncCollider(collider) {
  const oldMin = collider.min.clone();
  const box = new THREE.Box3().setFromObject(collider.mesh);
  collider.min.copy(box.min);
  collider.max.copy(box.max);
  collider.delta.subVectors(collider.min, oldMin);
}
// #endregion

// #region helpers
const clamp = THREE.MathUtils.clamp;

/** Squared distance on the ground plane from point p to the box's footprint. */
function distSqXZ(p, c) {
  const dx = p.x - clamp(p.x, c.min.x, c.max.x);
  const dz = p.z - clamp(p.z, c.min.z, c.max.z);
  return dx * dx + dz * dz;
}
// #endregion

// #region moveBody
/**
 * Move a body by its velocity and resolve collisions against boxes.
 * body = { position, velocity, radius, height, grounded, ground }
 */
export function moveBody(body, colliders, dt) {
  const p = body.position;
  const v = body.velocity;

  // 1. Ride moving platforms: copy whatever our ground did since last frame.
  if (body.ground) p.add(body.ground.delta);

  const prevFeet = p.y;
  const prevHead = p.y + body.height;
  p.addScaledVector(v, dt);
  body.grounded = false;
  body.ground = null;

  // 2. Vertical pass: land on tops, bonk heads on bottoms.
  const footR = body.radius * 0.9;
  for (const c of colliders) {
    if (distSqXZ(p, c) > footR * footR) continue; // not above/below this box
    const prevTop = c.max.y - c.delta.y;            // where the top was last frame
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

  // 3. Horizontal pass: push the body out of walls and slide along them.
  for (const c of colliders) {
    const standingOnTop = p.y >= c.max.y - 0.01;
    const fullyBelow = p.y + body.height <= c.min.y;
    if (standingOnTop || fullyBelow) continue;
    pushOutXZ(body, c);
  }
}
// #endregion

// #region pushOut
function pushOutXZ(body, c) {
  const p = body.position;
  const r = body.radius;
  const cx = clamp(p.x, c.min.x, c.max.x);
  const cz = clamp(p.z, c.min.z, c.max.z);
  let nx = p.x - cx;
  let nz = p.z - cz;
  const d2 = nx * nx + nz * nz;
  if (d2 >= r * r) return; // not touching

  if (d2 > 1e-9) {
    // Normal case: move out along the line from the closest point on the box.
    const d = Math.sqrt(d2);
    nx /= d; nz /= d;
    p.x = cx + nx * r;
    p.z = cz + nz * r;
  } else {
    // Our centre is inside the box: leave through the nearest side.
    const exits = [
      [p.x - c.min.x, -1, 0], [c.max.x - p.x, 1, 0],
      [p.z - c.min.z, 0, -1], [c.max.z - p.z, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    [, nx, nz] = exits[0];
    if (nx) p.x = nx < 0 ? c.min.x - r : c.max.x + r;
    else p.z = nz < 0 ? c.min.z - r : c.max.z + r;
  }

  // Remove the part of the velocity that points into the wall so we slide along it.
  const into = body.velocity.x * nx + body.velocity.z * nz;
  if (into < 0) {
    body.velocity.x -= into * nx;
    body.velocity.z -= into * nz;
  }
}
// #endregion
