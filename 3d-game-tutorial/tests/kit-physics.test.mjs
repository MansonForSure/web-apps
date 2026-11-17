// Run inside a lesson demo page (it has the import map):  await import('/3d-game-tutorial/tests/kit-physics.test.mjs')
import * as THREE from 'three';
import { moveBody } from '../lessons/kit/physics.js';
import { ChaseCamera } from '../lessons/kit/chase-camera.js';

const results = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const boxC = (min, max) => ({ min, max, delta: V(0, 0, 0) });
const body = (p, v) => ({ position: p, velocity: v, radius: 0.4, height: 1.6, grounded: false, ground: null });

// 1. Falling onto a box lands exactly on top.
{
  const floor = boxC(V(-5, -1, -5), V(5, 0, 5));
  const b = body(V(0, 2, 0), V(0, 0, 0));
  for (let i = 0; i < 120; i++) { b.velocity.y -= 26 / 60; moveBody(b, [floor], 1 / 60); }
  check('lands on top', b.grounded && Math.abs(b.position.y) < 1e-6, `y=${b.position.y.toFixed(4)}`);
}
// 2. Very fast fall does not tunnel through a thin platform.
{
  const thin = boxC(V(-2, -0.1, -2), V(2, 0, 2));
  const b = body(V(0, 0.2, 0), V(0, -30, 0));
  moveBody(b, [thin], 1 / 20);
  check('no tunnelling', b.grounded && b.position.y === 0, `y=${b.position.y}`);
}
// 3. Walking into a wall stops at radius distance and keeps sliding sideways.
{
  const floor = boxC(V(-10, -1, -10), V(10, 0, 10));
  const wall = boxC(V(1, 0, -5), V(2, 3, 5));
  const b = body(V(0, 0, 0), V(5, 0, 2));
  for (let i = 0; i < 60; i++) { b.velocity.set(5, -0.4, 2); moveBody(b, [floor, wall], 1 / 60); }
  check('wall stops', Math.abs(b.position.x - 0.6) < 1e-6, `x=${b.position.x.toFixed(4)}`);
  check('wall slides', b.position.z > 1.5, `z=${b.position.z.toFixed(3)}`);
}
// 4. Head bonk on a ceiling.
{
  const ceil = boxC(V(-2, 2, -2), V(2, 3, 2));
  const b = body(V(0, 0, 0), V(0, 9, 0));
  for (let i = 0; i < 10; i++) moveBody(b, [ceil], 1 / 60);
  check('head bonk', b.position.y + b.height <= 2 + 1e-9 && b.velocity.y === 0, `head=${(b.position.y + 1.6).toFixed(3)}`);
}
// 5. Standing on a rising platform rides it.
{
  const lift = boxC(V(-2, -1, -2), V(2, 0, 2));
  const b = body(V(0, 0, 0), V(0, 0, 0));
  moveBody(b, [lift], 1 / 60);
  for (let i = 0; i < 60; i++) {
    lift.min.y += 0.05; lift.max.y += 0.05; lift.delta.set(0, 0.05, 0);
    b.velocity.y -= 26 / 60;
    moveBody(b, [lift], 1 / 60);
  }
  check('rides lift', b.grounded && Math.abs(b.position.y - lift.max.y) < 1e-6, `y=${b.position.y.toFixed(3)} top=${lift.max.y.toFixed(3)}`);
}
// 6. Camera-relative directions.
{
  const cam = new ChaseCamera(new THREE.PerspectiveCamera());
  cam.yaw = 0;
  const f = cam.toWorld({ x: 0, y: 1 });
  const r = cam.toWorld({ x: 1, y: 0 });
  check('forward is -Z at yaw 0', Math.abs(f.z + 1) < 1e-9 && Math.abs(f.x) < 1e-9);
  check('right is +X at yaw 0', Math.abs(r.x - 1) < 1e-9 && Math.abs(r.z) < 1e-9);
  cam.yaw = Math.PI / 2;
  cam.update(0, V(0, 0, 0));
  const dir = V(0, 0, -1).applyQuaternion(cam.camera.quaternion).setY(0).normalize();
  const f2 = cam.toWorld({ x: 0, y: 1 });
  check('forward matches camera view', dir.distanceTo(f2) < 1e-6, `${dir.toArray().map((n) => n.toFixed(2))}`);
}
export default results;
