// stage.js — the boilerplate from Lessons 1 and 2, packed into one function.
// Every demo from Lesson 3 onward starts with `const stage = createStage()`.
import * as THREE from 'three';

// #region createStage
export function createStage({
  background = '#bfe1ee',
  fov = 55,
  shadows = true,
  fog = [30, 90],
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = shadows;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(background, fog[0], fog[1]);

  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 6, 10);

  // Sky light from above + bounce light from below, then one shadow-casting sun.
  const hemi = new THREE.HemisphereLight('#e8f6ff', '#7a6a55', 1.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(8, 14, 6);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera;
  s.left = -18; s.right = 18; s.top = 18; s.bottom = -18; s.near = 1; s.far = 50;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, sun, hemi, start: (update) => startLoop(renderer, scene, camera, update) };
}
// #endregion

// #region loop
// Runs update(dt, elapsed) every frame, then renders.
// dt is clamped so a hiccup (tab switch, debugger pause) cannot launch the player into space.
function startLoop(renderer, scene, camera, update) {
  const timer = new THREE.Timer();
  timer.connect(document);
  let visible = true;

  // Pause rendering while the demo is scrolled out of view (saves battery on phones).
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; })
    .observe(renderer.domElement);

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    if (!visible) return;
    const dt = Math.min(timer.getDelta(), 1 / 20);
    const keepDefaultRender = update?.(dt, timer.getElapsed());
    if (keepDefaultRender !== false) renderer.render(scene, camera);
  });
}
// #endregion

// Small helpers shared by many demos.
export function box(w, h, d, color, { x = 0, y = 0, z = 0, flat = true } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: flat }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function ground(scene, size = 60, color = '#9fd08a') {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const grid = new THREE.GridHelper(size, size / 2, '#5c8f52', '#7fb36f');
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);
  return mesh;
}

// A friendly little box robot used before we load a real model (Lesson 7).
export function makeBot(color = '#ff6a3d') {
  const bot = new THREE.Group();
  const body = box(0.9, 1.0, 0.7, color, { y: 0.75 });
  const head = box(0.7, 0.5, 0.6, '#f4f1ea', { y: 1.5 });
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.05),
    new THREE.MeshStandardMaterial({ color: '#1b1a22', emissive: '#37e0ff', emissiveIntensity: 0.8 }),
  );
  visor.position.set(0, 1.52, 0.31); // +Z is the bot's front
  const legL = box(0.25, 0.3, 0.3, '#2a2933', { x: -0.22, y: 0.15 });
  const legR = box(0.25, 0.3, 0.3, '#2a2933', { x: 0.22, y: 0.15 });
  bot.add(body, head, visor, legL, legR);
  bot.userData.legs = [legL, legR];
  return bot;
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Frame-rate independent smoothing factor: use as `x += (target - x) * damp(10, dt)`.
export function damp(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}
