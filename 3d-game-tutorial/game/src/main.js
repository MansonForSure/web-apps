// main.js — boot sequence: check WebGL, build systems, load the robot, start the loop.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { Sky } from './sky.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Particles } from './particles.js';
import { loadCharacter } from './character.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { LEVELS } from './levels.js';

const ui = new UI();

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  const canvas = document.getElementById('view');
  const stage = new Stage(canvas);
  const sky = new Sky(stage.scene);
  const sfx = new Sfx();
  const input = new Input({
    surface: canvas,
    base: document.getElementById('stick'),
    knob: document.getElementById('knob'),
    jumpButton: document.getElementById('jump-btn'),
  });
  const sparks = new Particles(stage.scene, { max: 700, additive: true, glow: 1.8 });
  const dust = new Particles(stage.scene, { max: 300 });

  const modelUrl = new URL('../../assets/models/RobotExpressive.glb', import.meta.url).href;
  const character = await loadCharacter(modelUrl, { height: 1.6, onProgress: (k) => ui.setLoading(k) });
  ui.setLoading(1);

  const game = new Game({ stage, sky, character, sfx, input, ui, sparks, dust });

  // Wire UI buttons and hotkeys to game actions.
  const unlockThen = (fn) => () => { sfx.unlock(); sfx.click(); fn(); };
  ui.bind({
    play: unlockThen(() => game.startLevel(0)),
    resume: unlockThen(() => game.resume()),
    restart: unlockThen(() => game.restart()),
    next: unlockThen(() => game.nextLevel()),
    title: unlockThen(() => game.toTitle()),
    pause: () => game.togglePause(),
    mute: () => game.toggleMute(),
    quality: (mode) => { game.setQuality(mode); ui.setQuality(mode, stage.quality); },
  });
  input.onPause = () => game.togglePause();
  input.onMute = () => game.toggleMute();
  input.onAnyInput = () => sfx.unlock();
  stage.onQualityChange = (actual) => ui.setQuality(game.save.quality, actual);
  ui.setQuality(game.save.quality, stage.quality);
  ui.setMuted(game.save.muted);

  // Leaving the tab (or locking the phone) pauses the game.
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });

  game.toTitle();

  // The game loop. Timer gives us frame deltas; clamp them so a hiccup
  // (tab switch, GC pause) can't make the robot teleport through a wall.
  // #region loop
  const timer = new THREE.Timer();
  timer.connect(document);
  stage.renderer.setAnimationLoop((now) => {
    timer.update(now);
    const raw = timer.getDelta();
    stage.monitor(raw);
    game.update(Math.min(raw, 1 / 20));
    stage.render();
  });
  // #endregion

  // Add ?debug to the URL to poke at the game from the browser console.
  if (new URLSearchParams(location.search).has('debug')) {
    window.skyhop = { game, stage, ui, THREE, LEVELS };
    console.info('[skyhop] debug hook: window.skyhop');
  }
}

if (!hasWebGL2()) {
  ui.show('error');
} else {
  boot().catch((err) => {
    console.error(err);
    ui.showError(`Something went wrong while starting the game: ${err.message}. Try reloading the page.`);
  });
}
