// pickups.js — energy cores (collectibles) and the exit portal (custom shader).
import * as THREE from 'three';

// ---------------------------------------------------------------- energy cores
const coreGeo = new THREE.OctahedronGeometry(0.34, 0);
const coreMat = new THREE.MeshStandardMaterial({
  color: '#c9fbff', emissive: '#2fd9ff', emissiveIntensity: 3.4, roughness: 0.25, flatShading: true,
});
let haloTexture = null;
function getHalo() {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

export class Core {
  constructor(x, y, z, parent, index) {
    this.home = new THREE.Vector3(x, y, z);
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(coreGeo, coreMat);
    this.mesh.castShadow = true;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHalo(), color: '#5fe8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    this.halo.scale.setScalar(1.5);
    this.group.add(this.mesh, this.halo);
    this.group.position.copy(this.home);
    parent.add(this.group);
    this.phase = index * 0.7;
    this.collected = false;
    this.fade = 0;
  }

  // #region core-update
  update(dt, t) {
    if (!this.collected) {
      this.group.position.y = this.home.y + Math.sin(t * 2.2 + this.phase) * 0.15;
      this.mesh.rotation.y = t * 1.8 + this.phase;
      this.mesh.rotation.x = Math.sin(t + this.phase) * 0.3;
      return;
    }
    if (this.fade < 1) {
      // Pop: grow, rise and fade out over 0.35 s.
      this.fade = Math.min(1, this.fade + dt / 0.35);
      const s = 1 + this.fade * 1.4;
      this.mesh.scale.setScalar(s * (1 - this.fade));
      this.halo.scale.setScalar(1.5 * s);
      this.halo.material.opacity = 0.8 * (1 - this.fade);
      this.group.position.y += dt * 2.5;
      if (this.fade >= 1) this.group.visible = false;
    }
  }
  // #endregion

  dispose() {
    this.halo.material.dispose();
  }
}

// ---------------------------------------------------------------- exit portal
const swirlVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// #region portal-fragment
const swirlFragment = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    float swirl = sin(a * 3.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5;
    float rings = sin(r * 18.0 - uTime * 6.0) * 0.5 + 0.5;
    vec3 hot = vec3(1.0, 0.92, 0.7);
    vec3 warm = vec3(1.0, 0.36, 0.16);
    vec3 col = mix(hot, warm, smoothstep(0.0, 1.0, r)) * (0.55 + swirl * 0.7 + rings * 0.2);
    vec3 idle = vec3(0.32, 0.3, 0.4) * (0.7 + swirl * 0.3);
    col = mix(idle, col * 2.4, uActive);
    float alpha = smoothstep(1.0, 0.86, r) * mix(0.35, 0.95, uActive);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
// #endregion
`;

export class Portal {
  constructor(x, top, z, yaw, parent) {
    this.base = new THREE.Vector3(x, top, z);
    this.group = new THREE.Group();
    this.group.position.copy(this.base);
    this.group.rotation.y = yaw;

    this.ringMat = new THREE.MeshStandardMaterial({
      color: '#8b8797', emissive: '#ff6a2e', emissiveIntensity: 0, roughness: 0.4, metalness: 0.2, flatShading: true,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.15, 10, 40), this.ringMat);
    ring.position.y = 1.45;
    ring.castShadow = true;

    this.uniforms = { uTime: { value: 0 }, uActive: { value: 0 } };
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.02, 48),
      new THREE.ShaderMaterial({
        vertexShader: swirlVertex, fragmentShader: swirlFragment, uniforms: this.uniforms,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    disc.position.y = 1.45;

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.55, 0.2, 14),
      new THREE.MeshStandardMaterial({ color: '#efe5d1', roughness: 0.8, flatShading: true }),
    );
    plinth.position.y = -0.06; // top sits 4 cm above the ground
    plinth.receiveShadow = true;
    plinth.castShadow = true;

    this.group.add(ring, disc, plinth);
    parent.add(this.group);
    this.ring = ring;
    this.disc = disc;
    this.active = false;
    this.level = 0;
  }

  activate() {
    this.active = true;
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    const goal = this.active ? 1 : 0;
    this.level += (goal - this.level) * Math.min(1, dt * 3);
    this.uniforms.uActive.value = this.level;
    this.ringMat.emissiveIntensity = this.level * 2.2;
    this.ringMat.color.setRGB(0.55 + this.level * 0.45, 0.53 - this.level * 0.1, 0.6 - this.level * 0.35);
    this.ring.rotation.z = t * (0.2 + this.level * 1.2);
    const pulse = 1 + Math.sin(t * 5) * 0.03 * this.level;
    this.disc.scale.setScalar(pulse);
  }

  /** Is the player standing inside the ring? */
  contains(p) {
    if (!this.active) return false;
    const dx = p.x - this.base.x;
    const dz = p.z - this.base.z;
    return dx * dx + dz * dz < 1.25 * 1.25 && p.y > this.base.y - 0.5 && p.y < this.base.y + 2.4;
  }

  dispose() {
    this.ring.geometry.dispose();
    this.disc.geometry.dispose();
    this.disc.material.dispose();
    this.ringMat.dispose();
  }
}
