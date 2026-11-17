// stage.js — renderer, scene, camera, lights and post-processing, plus adaptive quality.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CAMERA, QUALITY } from './config.js';

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 900);

    this.hemi = new THREE.HemisphereLight('#e8f6ff', '#7a6a55', 1.3);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sunOffset = new THREE.Vector3(14, 30, 10);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // Post-processing: render -> bloom (glow on pixels brighter than 1.45 — only emissive things)
    // -> tone map + sRGB output.
    // #region bloom
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.35, 1.45);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // #endregion

    this.mode = 'auto';   // 'auto' | 'high' | 'low'
    this.quality = null;
    this.frameTimes = [];
    this.onQualityChange = () => {};
    this.applyQuality('high');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  // #region resize
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait phones: widen the vertical FOV so you still see left and right.
    const aspect = this.camera.aspect;
    const fov = aspect < 1
      ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2) / aspect * 0.8))
      : CAMERA.fov;
    this.camera.fov = Math.min(fov, 82);
    this.camera.updateProjectionMatrix();
  }
  // #endregion

  // #region apply-quality
  applyQuality(name) {
    if (this.quality === name) return;
    this.quality = name;
    const q = QUALITY[name];
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.bloom.enabled = q.bloom;
    if (this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
    this.onQualityChange(name);
  }
  // #endregion

  setMode(mode) {
    this.mode = mode;
    this.frameTimes.length = 0;
    this.applyQuality(mode === 'low' ? 'low' : 'high');
  }

  /** Auto mode: if the last ~2 seconds averaged under ~40 fps, drop to low quality. */
  // #region monitor
  monitor(rawDt) {
    if (this.mode !== 'auto' || this.quality === 'low') return;
    this.frameTimes.push(rawDt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 40) this.applyQuality('low');
  }
  // #endregion

  followSun(target) {
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
  }

  render() {
    if (this.bloom.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
