// sky.js — a gradient sky dome (custom shader), a sea of clouds and distant floating rocks.
import * as THREE from 'three';

export const SKIES = {
  day: {
    top: '#1f6fd6', horizon: '#9ed3f4', bottom: '#cfe2f6', sun: '#fff3d1',
    sunDir: [0.45, 0.42, -0.78], hemiSky: '#dff1ff', hemiGround: '#8a6f56', light: '#fff1d6',
    fog: '#b9def4', cloud: '#ffffff', cloudShade: '#cfe0f2', exposure: 1.05,
  },
  golden: {
    top: '#3168b8', horizon: '#ffbf80', bottom: '#ff9575', sun: '#ffd28a',
    sunDir: [-0.6, 0.22, -0.77], hemiSky: '#ffe3c4', hemiGround: '#7a5a46', light: '#ffd29e',
    fog: '#ffc79a', cloud: '#fff1e0', cloudShade: '#ffc0a0', exposure: 1.0,
  },
  dusk: {
    top: '#221f5c', horizon: '#ff8a76', bottom: '#5b3f8c', sun: '#ffb08a',
    sunDir: [0.7, 0.12, -0.7], hemiSky: '#c9b8ff', hemiGround: '#5a3f5f', light: '#ffb89a',
    fog: '#c98a9c', cloud: '#f5d7ef', cloudShade: '#a77fb8', exposure: 1.1,
  },
};

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// #region sky-fragment
const skyFragment = /* glsl */ `
  uniform vec3 uTop, uHorizon, uBottom, uSun, uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.45));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.08);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
// #endregion
`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    this.clouds = buildClouds();
    scene.add(this.clouds.group);
  }

  apply(preset, stage) {
    const s = SKIES[preset] ?? SKIES.day;
    this.uniforms.uTop.value.set(s.top);
    this.uniforms.uHorizon.value.set(s.horizon);
    this.uniforms.uBottom.value.set(s.bottom);
    this.uniforms.uSun.value.set(s.sun);
    this.uniforms.uSunDir.value.set(...s.sunDir).normalize();
    stage.hemi.color.set(s.hemiSky);
    stage.hemi.groundColor.set(s.hemiGround);
    stage.sun.color.set(s.light);
    stage.sunOffset.set(...s.sunDir).normalize().multiplyScalar(40);
    stage.sunOffset.y = Math.max(stage.sunOffset.y, 22); // keep shadows readable
    stage.renderer.toneMappingExposure = s.exposure;
    stage.scene.fog = new THREE.Fog(s.fog, 45, 230);
    this.clouds.material.color.set(s.cloud);
    this.clouds.material.emissive.set(s.cloudShade);
  }

  update(dt, camera) {
    this.dome.position.copy(camera.position);
    this.clouds.group.rotation.y += dt * 0.004;
  }
}

// #region clouds
function buildClouds() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#f3d9d4', emissiveIntensity: 0.35, roughness: 1, flatShading: true,
  });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const rand = mulberry32(7);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  // Cloud sea: clusters of squashed puffs far below the islands.
  const SEA = 420;
  const sea = new THREE.InstancedMesh(puff, material, SEA);
  let n = 0;
  while (n < SEA) {
    const a = rand() * Math.PI * 2;
    const r = 25 + Math.sqrt(rand()) * 200;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r - 30;
    const cy = -22 - rand() * 6;
    const parts = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < parts && n < SEA; k++, n++) {
      p.set(cx + (rand() - 0.5) * 14, cy + rand() * 2, cz + (rand() - 0.5) * 14);
      const size = 4 + rand() * 7;
      s.set(size * (1 + rand() * 0.6), size * 0.45, size);
      q.setFromEuler(e.set(0, rand() * Math.PI, 0));
      sea.setMatrixAt(n, m.compose(p, q, s));
    }
  }
  group.add(sea);

  // A few big clouds floating at island height, far away.
  const FAR = 40;
  const far = new THREE.InstancedMesh(puff, material, FAR);
  for (let i = 0; i < FAR; i++) {
    const a = rand() * Math.PI * 2;
    const r = 120 + rand() * 120;
    p.set(Math.cos(a) * r, -4 + rand() * 30, Math.sin(a) * r);
    const size = 6 + rand() * 10;
    s.set(size * 1.8, size * 0.6, size);
    q.setFromEuler(e.set(0, rand() * Math.PI, 0));
    far.setMatrixAt(i, m.compose(p, q, s));
  }
  group.add(far);

  // Distant floating rocks for depth.
  const rockMat = new THREE.MeshStandardMaterial({ color: '#a98a72', roughness: 1, flatShading: true });
  const rockGeo = new THREE.ConeGeometry(1, 2.2, 6);
  rockGeo.rotateX(Math.PI);
  const ROCKS = 26;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 90;
    p.set(Math.cos(a) * r, -8 + rand() * 26, Math.sin(a) * r);
    const size = 1.5 + rand() * 4;
    s.set(size, size, size);
    q.setFromEuler(e.set(0, rand() * Math.PI, 0));
    rocks.setMatrixAt(i, m.compose(p, q, s));
  }
  group.add(rocks);

  return { group, material };
}
// #endregion

/** Tiny seeded random number generator: same seed, same "random" world every time. */
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
