// game.js — the game's brain: a state machine that owns the level, rules, score and saving.
//
//   title -> playing <-> paused
//            playing -> complete -> (next level) playing ... -> victory
//            playing -> dying -> over -> playing (retry)
import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { RULES } from './config.js';

const SAVE_KEY = 'skyhop.save.v1';
const SPARK_COLORS = ['#6ff3ff', '#c9fbff', '#2fd9ff', '#ffffff'];

export class Game {
  constructor({ stage, sky, character, sfx, input, ui, sparks, dust }) {
    Object.assign(this, { stage, sky, sfx, input, ui, sparks, dust });
    this.player = new Player(character);
    stage.scene.add(this.player.root);
    this.chase = new ChaseCamera(stage.camera);
    this.state = 'boot';
    this.stateTime = 0;
    this.elapsed = 0;
    this.levelIndex = 0;
    this.level = null;
    this.levelTime = 0;
    this.collected = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.runTimes = [];
    this.hintsShown = new Set();
    this.save = loadSave();
    this.tmp = new THREE.Vector3();

    this.player.events.jump = () => {
      this.sfx.jump();
      this.dust.burst(this.player.position, { count: 6, color: '#f6ead8', speed: 2.2, up: 0.6, life: 0.45, size: 0.35, gravity: 1, spread: 1 });
    };
    this.player.events.land = (speed) => {
      if (speed < 4) return;
      const k = Math.min(speed / 25, 1);
      this.sfx.land(k);
      this.dust.burst(this.player.position, { count: 6 + Math.round(k * 10), color: '#f6ead8', speed: 2 + k * 4, up: 0.5, life: 0.5, size: 0.4, gravity: 1, spread: 1 });
      if (speed > 18) this.chase.shake(0.25 * k);
    };

    sfx.setMuted(this.save.muted);
    stage.setMode(this.save.quality);
  }

  // ------------------------------------------------------------------ flow
  // #region setstate
  setState(name) {
    this.state = name;
    this.stateTime = 0;
    this.input.setEnabled(name === 'playing');
    this.ui.setHudVisible(['playing', 'paused', 'complete', 'dying'].includes(name));
  }
  // #endregion

  loadLevel(index) {
    this.level?.dispose();
    this.levelIndex = index;
    const def = LEVELS[index];
    this.level = new Level(def, this.stage.scene);
    this.sky.apply(def.sky, this.stage);
    this.player.spawn(new THREE.Vector3(...def.spawn), def.facing);
    this.chase.reset(def.facing + Math.PI);
    this.collected = 0;
    this.levelTime = 0;
    this.combo = 0;
    this.sparks.clear();
    this.dust.clear();
    this.ui.setLevel(index + 1, def.name);
    this.ui.setCores(0, this.level.totalCores);
    this.ui.setHearts(this.player.hearts, RULES.hearts);
    this.ui.setTimer(0);
  }

  toTitle() {
    if (!this.level || this.levelIndex !== 0) this.loadLevel(0);
    this.player.spawn(new THREE.Vector3(...LEVELS[0].spawn), LEVELS[0].facing);
    this.player.posing = true;
    this.deathFocus = null;
    this.chase.reset(LEVELS[0].facing + 0.5, 0.22); // in front of the robot, 3/4 view
    this.ui.renderLevelList(LEVELS, this.save, (i) => this.startLevel(i));
    this.ui.show('title');
    this.setState('title');
  }

  startLevel(index, { fromRun = false } = {}) {
    this.sfx.unlock();
    this.deathFocus = null;
    if (!fromRun && index === 0) this.runTimes = [];
    this.loadLevel(index);
    this.ui.show(null);
    this.setState('playing');
    const def = LEVELS[index];
    this.ui.toast(`${def.name}<small>${def.tagline}</small>`, 3200);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.show(null);
    this.setState('playing');
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  restart() {
    this.startLevel(this.levelIndex, { fromRun: true });
  }

  nextLevel() {
    if (this.levelIndex + 1 < LEVELS.length) this.startLevel(this.levelIndex + 1, { fromRun: true });
    else this.toTitle();
  }

  toggleMute() {
    this.save.muted = !this.save.muted;
    this.sfx.setMuted(this.save.muted);
    if (!this.save.muted) { this.sfx.unlock(); this.sfx.click(); }
    this.ui.setMuted(this.save.muted);
    persist(this.save);
  }

  setQuality(mode) {
    this.save.quality = mode;
    this.stage.setMode(mode);
    persist(this.save);
  }

  // ------------------------------------------------------------------ rules
  // #region collect
  collect(core) {
    core.collected = true;
    this.collected += 1;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 0;
    this.comboTimer = 2.5;
    this.sfx.collect(this.combo);
    this.sparks.burst(core.group.position, { count: 22, colors: SPARK_COLORS, speed: 5, up: 2.5, life: 0.7, size: 0.22, gravity: 5, spread: 1 });
    this.ui.setCores(this.collected, this.level.totalCores, true);
    if (this.collected === this.level.totalCores) {
      this.level.portal.activate();
      this.sfx.portalOpen();
      this.ui.toast('Portal open!<small>Head for the glowing ring.</small>', 2600);
      this.sparks.burst(this.tmp.copy(this.level.portal.base).setY(this.level.portal.base.y + 1.45), { count: 40, color: '#ffb35c', speed: 6, up: 2, life: 1, size: 0.3, gravity: 1 });
    }
  }
  // #endregion

  stomp(enemy) {
    enemy.squash();
    this.player.launch(RULES.stompBounce + (this.input.jumpHeld ? 2.5 : 0));
    this.player.squash = 1.3;
    this.sfx.stomp();
    this.chase.shake(0.3);
    this.sparks.burst(enemy.group.position, { count: 18, colors: ['#ffffff', '#b9a5ff', '#ffb02e'], speed: 6, up: 2, life: 0.5, size: 0.25, gravity: 8 });
  }

  // #region damage
  damage(from) {
    if (!this.player.hurt(from)) return;
    this.sfx.hurt();
    this.chase.shake(0.55);
    this.ui.flash('hurt');
    this.ui.setHearts(this.player.hearts, RULES.hearts);
    if (this.player.hearts <= 0) this.gameOver(true);
  }
  // #endregion

  // #region fell
  fellOff() {
    this.player.hearts -= 1;
    this.sfx.fall();
    this.ui.setHearts(this.player.hearts, RULES.hearts);
    if (this.player.hearts <= 0) { this.gameOver(false); return; }
    this.player.respawn();
    this.chase.snapped = false;
    this.ui.flash('fall');
    this.ui.toast('Whoops! <small>−1 heart</small>', 1200);
  }
  // #endregion

  gameOver(onScreen) {
    this.setState('dying');
    // Fell into the clouds? Keep the camera on the last safe spot instead of following the plunge.
    this.deathFocus = onScreen ? null : this.player.lastSafe.clone();
    if (onScreen) this.player.die();
    this.sfx.lose();
  }

  // #region complete
  completeLevel() {
    this.setState('complete');
    this.player.celebrate();
    this.sfx.win();
    this.sparks.burst(this.tmp.copy(this.player.position).setY(this.player.position.y + 1), { count: 60, colors: ['#ff5b2e', '#ffd166', '#6ff3ff', '#ffffff'], speed: 8, up: 4, life: 1.2, size: 0.3, gravity: 6 });
    const def = LEVELS[this.levelIndex];
    const time = this.levelTime;
    const prev = this.save.best[def.id];
    const record = prev === undefined || time < prev;
    if (record) this.save.best[def.id] = time;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, this.levelIndex + 2));
    this.runTimes[this.levelIndex] = time;
    persist(this.save);
    this.result = { level: this.levelIndex + 1, name: def.name, time, best: this.save.best[def.id], record, hearts: this.player.hearts, last: this.levelIndex === LEVELS.length - 1 };
  }
  // #endregion

  // ------------------------------------------------------------------ frame
  // #region frame
  update(dt) {
    // #region frame-systems
    this.elapsed += dt;
    this.stateTime += dt;
    const p = this.player;
    const playing = this.state === 'playing';
    const frozen = this.state === 'paused';

    if (!frozen) {
      this.level.update(dt, this.elapsed, p, this.sfx);
      if (this.state !== 'title' && this.state !== 'over' && this.state !== 'victory') {
        p.update(dt, this.input, this.chase, this.level.colliders, playing);
      }
    }
    // #endregion

    if (playing) {
      this.levelTime += dt;
      this.comboTimer -= dt;
      this.ui.setTimer(this.levelTime);

      const power = this.level.padUnder(p);
      if (power) {
        p.launch(power);
        p.squash = 1.4;
        this.sfx.pad();
        this.sparks.burst(p.position, { count: 16, color: '#ff8a4c', speed: 4, up: 1, life: 0.5, size: 0.25, gravity: 2 });
      }

      const center = this.tmp.set(p.position.x, p.center, p.position.z);
      for (const core of this.level.cores) {
        if (!core.collected && core.group.position.distanceToSquared(center) < 1.05 * 1.05) this.collect(core);
      }

      for (const enemy of this.level.enemies) {
        if (!enemy.alive || this.state !== 'playing') continue;
        const hit = enemy.touch(p);
        if (hit === 'stomp') this.stomp(enemy);
        else if (hit === 'hurt') this.damage(enemy.position);
      }

      if (this.state === 'playing' && p.position.y < this.level.killY) this.fellOff();
      if (this.state === 'playing' && this.level.portal.contains(p.position)) this.completeLevel();
      this.levelHints();
    }

    if (this.state === 'complete' && this.stateTime > 2.2) {
      if (this.result.last) this.showVictory();
      else { this.ui.showComplete(this.result); this.setState('result'); }
    }
    if (this.state === 'dying' && this.stateTime > 1.8) {
      this.ui.show('over');
      this.setState('over');
    }

    // Menus get a slow cinematic orbit; gameplay gets the player's own camera.
    const look = playing ? this.input.consumeLook() : { x: 0, y: 0 };
    if (['over', 'victory', 'result', 'complete'].includes(this.state)) this.chase.yaw += dt * 0.12;
    if (this.state === 'title') this.chase.yaw = LEVELS[0].facing + 0.5 + Math.sin(this.stateTime * 0.15) * 0.35;
    // Wide screens: slide the camera so the robot sits right of the title card.
    this.chase.shiftGoal = this.state === 'title' && this.stage.camera.aspect > 1.25 ? -2.4 : 0;
    // Portrait phones: the title card is a bottom sheet, so lift the robot into the top half.
    this.chase.liftGoal = this.state === 'title' && this.stage.camera.aspect < 0.8 ? -2.6 : 0;
    if (this.state === 'title') {
      // Title screen: wave twice, then idle, on an 8-second loop.
      p.character.play(this.stateTime % 8 < 3.6 ? 'Wave' : 'Idle', { fade: 0.35 });
    }
    if (!frozen) p.animate(dt, this.elapsed, this.chase.yaw);
    // #region frame-view
    this.chase.update(dt, this.deathFocus ?? p.position, look);
    this.sky.update(dt, this.stage.camera);
    this.stage.followSun(p.position);
    const h = this.stage.renderer.domElement.height;
    this.sparks.update(frozen ? 0 : dt, h, this.stage.camera.fov);
    this.dust.update(frozen ? 0 : dt, h, this.stage.camera.fov);
  }
    // #endregion
  // #endregion

  showVictory() {
    const total = this.runTimes.length === LEVELS.length && this.runTimes.every((t) => t !== undefined)
      ? this.runTimes.reduce((a, b) => a + b, 0) : null;
    if (total !== null && (this.save.bestRun === undefined || total < this.save.bestRun)) this.save.bestRun = total;
    persist(this.save);
    this.ui.showVictory({ levels: LEVELS, best: this.save.best, total, bestRun: this.save.bestRun });
    this.setState('victory');
  }

  /** Friendly one-time tips during the first level. */
  levelHints() {
    if (this.levelIndex !== 0) return;
    const t = this.levelTime;
    const tip = (id, at, text) => {
      if (t > at && !this.hintsShown.has(id)) { this.hintsShown.add(id); this.ui.toast(text, 3200); }
    };
    const touch = document.body.classList.contains('touch');
    tip('move', 3.6, touch ? 'Left thumb moves · right thumb looks' : 'WASD to move · drag the mouse to look');
    tip('jump', 8, touch ? 'Tap JUMP — hold it to jump higher' : 'Space to jump — hold it to jump higher');
    if (this.level.enemies.some((e) => e.state === 'alert') && !this.hintsShown.has('stomp')) {
      this.hintsShown.add('stomp');
      this.ui.toast('Spiker spotted you!<small>Jump on its head — touching it hurts.</small>', 3000);
    }
  }
}

// #region load-save
function loadSave() {
  const base = { v: 1, unlocked: 1, best: {}, muted: false, quality: 'auto' };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') };
  } catch {
    return base;
  }
}
// #endregion

// #region persist
function persist(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode / storage disabled: the game still works, it just forgets.
  }
}
// #endregion
