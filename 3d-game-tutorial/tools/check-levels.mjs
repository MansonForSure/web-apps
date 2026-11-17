// check-levels.mjs — prove every level is completable on paper.
// Builds a graph of walkable surfaces, adds an edge when a jump can cross the gap
// (using the real jump physics from config.js), then checks the portal and every
// energy core are reachable from the spawn.   Run:  node tools/check-levels.mjs
import { LEVELS } from '../game/src/levels.js';

const PLAYER = { speed: 6.5, jumpSpeed: 9.4, gravity: 26 };
const PAD = 17;
const SAFETY = 0.8;        // only count 80% of the theoretical reach
const LANDING = 0.36;      // the player can land with its centre this far beyond an edge

function reach(dh, v) {
  const disc = v * v - 2 * PLAYER.gravity * dh;
  if (disc < 0) return -1;                       // can't get that high
  const t = (v + Math.sqrt(disc)) / PLAYER.gravity;
  return PLAYER.speed * t * SAFETY;
}

function footprints(level) {
  const nodes = [];
  for (const i of level.islands) nodes.push({ name: `island@${i.at}`, kind: 'island', samples: [{ shape: 'cyl', x: i.at[0], z: i.at[2], r: i.r, top: i.at[1] }] });
  for (const b of level.blocks ?? []) nodes.push({ name: `block@${b.at}`, kind: 'block', samples: [box(b.at, b.size)] });
  for (const c of level.crumbles ?? []) nodes.push({ name: `crumble@${c.at}`, kind: 'crumble', samples: [box(c.at, c.size)] });
  for (const m of level.movers ?? []) {
    const samples = [];
    for (let k = 0; k < 24; k++) {
      const s = Math.sin((k / 24) * Math.PI * 2) * m.amp;
      const at = [...m.at];
      at['xyz'.indexOf(m.axis)] += s;
      samples.push(box(at, m.size));
    }
    nodes.push({ name: `mover(${m.axis})@${m.at}`, kind: 'mover', samples });
  }
  for (const p of level.pads ?? []) nodes.push({ name: `pad@${p.at}`, kind: 'pad', samples: [{ shape: 'cyl', x: p.at[0], z: p.at[2], r: 0.95, top: p.at[1] + 0.33 }] });
  return nodes;
}

function box(at, [w, d]) {
  return { shape: 'box', minX: at[0] - w / 2, maxX: at[0] + w / 2, minZ: at[2] - d / 2, maxZ: at[2] + d / 2, top: at[1] };
}

function pointDist(s, x, z) {
  if (s.shape === 'cyl') return Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
  const dx = Math.max(s.minX - x, 0, x - s.maxX);
  const dz = Math.max(s.minZ - z, 0, z - s.maxZ);
  return Math.hypot(dx, dz);
}

function gap(a, b) {
  if (a.shape === 'cyl' && b.shape === 'cyl') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.shape === 'cyl') return pointDist(b, a.x, a.z) - a.r;
  if (b.shape === 'cyl') return pointDist(a, b.x, b.z) - b.r;
  const dx = Math.max(b.minX - a.maxX, 0, a.minX - b.maxX);
  const dz = Math.max(b.minZ - a.maxZ, 0, a.minZ - b.maxZ);
  return Math.hypot(dx, dz);
}

let failures = 0;
for (const level of LEVELS) {
  const nodes = footprints(level);
  const v = (n) => (n.kind === 'pad' ? PAD : PLAYER.jumpSpeed);
  const edges = nodes.map(() => []);
  nodes.forEach((a, i) => nodes.forEach((b, j) => {
    if (i === j) return;
    let best = Infinity;
    for (const sa of a.samples) for (const sb of b.samples) {
      const g = gap(sa, sb) - LANDING;
      const r = reach(sb.top - sa.top, v(a));
      // Walking off/onto touching surfaces also counts if the target isn't higher than a step.
      const walk = g <= 0 && sb.top - sa.top <= 0.4;
      if (walk || (r > 0 && g <= r)) best = Math.min(best, g);
    }
    if (best < Infinity) edges[i].push(j);
  }));

  const [sx, , sz] = level.spawn;
  const start = nodes.findIndex((n) => n.samples.some((s) => pointDist(s, sx, sz) === 0));
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) for (const j of edges[queue.shift()]) if (!seen.has(j)) { seen.add(j); queue.push(j); }

  const problems = [];
  const unreached = nodes.filter((_, i) => !seen.has(i)).map((n) => n.name);
  if (unreached.length) problems.push(`unreachable surfaces: ${unreached.join(', ')}`);

  const [px, py, pz] = level.portal.at;
  const portalNode = nodes.findIndex((n) => n.kind === 'island' && n.samples.some((s) => pointDist(s, px, pz) === 0 && Math.abs(s.top - py) < 1e-6));
  if (portalNode < 0) problems.push('portal is not standing on an island top');
  else if (!seen.has(portalNode)) problems.push('portal island unreachable');

  level.cores.forEach(([x, y, z], k) => {
    const ok = [...seen].some((i) => nodes[i].samples.some((s) => {
      const above = y - s.top;
      const peak = (v(nodes[i]) ** 2) / (2 * PLAYER.gravity);
      return pointDist(s, x, z) <= 2.4 && above >= 0.2 && above <= peak + 0.8 + 0.9;
    }));
    if (!ok) problems.push(`core #${k + 1} at ${[x, y, z]} cannot be reached`);
  });

  (level.enemies ?? []).forEach((e, k) => {
    const home = nodes.find((n) => n.samples.length === 1 && Math.abs(n.samples[0].top - e.y) < 1e-6 &&
      e.path.every(([x, z]) => pointDist(n.samples[0], x, z) === 0));
    if (!home) problems.push(`enemy #${k + 1} path is not over a single platform at y=${e.y}`);
  });

  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${level.name}: ${nodes.length} surfaces, ${seen.size} reachable, ${level.cores.length} cores`);
  for (const p of problems) console.log('      - ' + p);
  failures += problems.length;
}
process.exit(failures ? 1 : 0);
