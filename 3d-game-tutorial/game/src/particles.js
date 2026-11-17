// particles.js — a pooled particle system drawn as ONE THREE.Points object (one draw call).
import * as THREE from 'three';

// #region vertex
const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;   // perspective: far = small
    gl_Position = projectionMatrix * mv;
  }
// #endregion
`;

// #region fragment
const fragmentShader = /* glsl */ `
  uniform float uGlow;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.15, d) * vAlpha;
    gl_FragColor = vec4(vColor * uGlow, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
// #endregion
`;

export class Particles {
  constructor(scene, { max = 500, additive = false, glow = 1 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.startSize = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.next = 0;
    this.alive = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uScale: { value: 400 }, uGlow: { value: glow } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false; // particles fly everywhere; skip the bounding-sphere test
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.color = new THREE.Color();
  }

  /** Spawn `count` particles around `origin`. */
  // #region burst
  burst(origin, {
    count = 12, color = '#ffffff', colors = null, speed = 4, up = 2, spread = 1,
    life = 0.6, size = 0.25, gravity = 6, drag = 1.5, jitter = 0.1,
  } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * jitter;
      this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * jitter;
      this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * jitter;
      this.vel[i * 3] = Math.cos(a) * r * s;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random()) + (Math.random() - 0.5) * s * (1 - spread * 0.5);
      this.vel[i * 3 + 2] = Math.sin(a) * r * s;
      this.color.set(colors ? colors[n % colors.length] : color);
      this.col[i * 3] = this.color.r;
      this.col[i * 3 + 1] = this.color.g;
      this.col[i * 3 + 2] = this.color.b;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.startSize[i] = size * (0.6 + Math.random() * 0.8);
      this.gravity[i] = gravity;
      this.drag[i] = drag;
    }
  }
  // #endregion

  // #region update
  update(dt, viewportHeight, fovDeg) {
    // Point size in pixels for a world-size particle 1 unit away.
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; }
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 1.6);
      this.size[i] = this.startSize[i] * (0.4 + 0.6 * t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
  // #endregion

  clear() {
    this.life.fill(0);
  }
}
