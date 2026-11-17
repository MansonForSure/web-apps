// input.js — keyboard, mouse and multi-touch turned into intents (the Lesson 3 kit, game edition).
export class Input {
  constructor({ surface, base, knob, jumpButton }) {
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.jumpHeld = false;
    this.jumpQueued = false;
    this.enabled = false;
    this.onPause = () => {};
    this.onMute = () => {};
    this.onAnyInput = () => {};
    this.base = base;
    this.knob = knob;
    this.touchMode = window.matchMedia('(pointer: coarse)').matches;
    if (this.touchMode) document.body.classList.add('touch');

    this.#keyboard();
    this.#pointers(surface);
    this.#jumpButton(jumpButton);
  }

  #keyboard() {
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      this.onAnyInput();
      if (e.code === 'Escape' || e.code === 'KeyP') { this.onPause(); return; }
      if (e.code === 'KeyM') { this.onMute(); return; }
      if (!this.enabled) return;
      if (block.has(e.code)) e.preventDefault();
      if (e.code === 'Space' && !e.repeat) { this.jumpQueued = true; this.jumpHeld = true; }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.jumpHeld = false;
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  #pointers(surface) {
    const RADIUS = 58;
    let stickId = null;
    let lookId = null;
    let origin = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };

    surface.addEventListener('pointerdown', (e) => {
      this.onAnyInput();
      if (e.pointerType === 'touch' && !this.touchMode) {
        this.touchMode = true;
        document.body.classList.add('touch');
      }
      if (!this.enabled) return;
      const left = e.clientX < window.innerWidth * 0.5;
      if (e.pointerType === 'touch' && left && stickId === null) {
        stickId = e.pointerId;
        origin = { x: e.clientX, y: e.clientY };
        this.#placeStick(origin.x, origin.y, origin.x, origin.y);
        this.base.classList.add('on');
      } else if (lookId === null) {
        lookId = e.pointerId;
        last = { x: e.clientX, y: e.clientY };
      }
    });

    // #region stick
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) {
        let dx = e.clientX - origin.x;
        let dy = e.clientY - origin.y;
        const len = Math.hypot(dx, dy);
        if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
        // A small dead zone stops thumbs from drifting the robot.
        const mag = Math.hypot(dx, dy) / RADIUS;
        const scale = mag < 0.12 ? 0 : (mag - 0.12) / 0.88 / (mag || 1);
        this.stick.x = (dx / RADIUS) * scale;
        this.stick.y = (-dy / RADIUS) * scale;
        this.#placeStick(origin.x, origin.y, origin.x + dx, origin.y + dy);
      } else if (e.pointerId === lookId) {
        const k = e.pointerType === 'touch' ? 1.25 : 1;
        this.lookDelta.x += (e.clientX - last.x) * k;
        this.lookDelta.y += (e.clientY - last.y) * k;
        last = { x: e.clientX, y: e.clientY };
      }
    });
    // #endregion

    const release = (e) => {
      if (e.pointerId === stickId) {
        stickId = null;
        this.stick.x = this.stick.y = 0;
        this.base.classList.remove('on');
      }
      if (e.pointerId === lookId) lookId = null;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.releasePointers = () => {
      stickId = lookId = null;
      this.stick.x = this.stick.y = 0;
      this.base.classList.remove('on');
    };
  }

  #placeStick(bx, by, kx, ky) {
    this.base.style.transform = `translate(${bx}px, ${by}px)`;
    this.knob.style.transform = `translate(${kx - bx}px, ${ky - by}px)`;
  }

  #jumpButton(btn) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this.jumpQueued = true;
      this.jumpHeld = true;
      btn.classList.add('down');
    });
    const up = () => { this.jumpHeld = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.releaseAll();
  }

  releaseAll() {
    this.keys.clear();
    this.jumpHeld = false;
    this.jumpQueued = false;
    this.lookDelta.x = this.lookDelta.y = 0;
    this.releasePointers?.();
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  getMove() {
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyW', 'ArrowUp')) y += 1;
    if (this.isDown('KeyS', 'ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = this.lookDelta.y = 0;
    return d;
  }
}
