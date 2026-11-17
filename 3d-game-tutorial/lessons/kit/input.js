// input.js — one place that turns keyboard, mouse and touch into simple game intents:
//   move  : a 2D vector, x = right, y = forward, length 0..1
//   jump  : pressed this frame? / currently held?
//   look  : how far the pointer was dragged since we last asked (for the camera)
// Built in Lesson 3, used by every demo after it.

// #region state
export class Input {
  constructor({ joystick = true, jumpButton = true, look = true } = {}) {
    this.keys = new Set();          // physical key codes currently held, e.g. 'KeyW'
    this.stick = { x: 0, y: 0 };    // virtual joystick vector
    this.lookDelta = { x: 0, y: 0 };
    this.jumpHeld = false;
    this.jumpQueued = false;
    this.lookEnabled = look;
    this.joystickEnabled = joystick;

    this.#bindKeyboard();
    this.#bindPointers();
    if (jumpButton) this.#makeJumpButton();
    this.#injectStyles();

    // Show touch controls straight away on phones/tablets.
    if (window.matchMedia('(pointer: coarse)').matches) this.showTouchUI();
  }
  // #endregion

  // #region keyboard
  #bindKeyboard() {
    const gameKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    window.addEventListener('keydown', (e) => {
      if (gameKeys.includes(e.code)) e.preventDefault(); // stop the page scrolling
      if (e.code === 'Space' && !e.repeat) { this.jumpQueued = true; this.jumpHeld = true; }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.jumpHeld = false;
      this.keys.delete(e.code);
    });
    // If the window loses focus we never get the keyup — release everything.
    window.addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }
  // #endregion

  // #region move
  /** Combined movement intent from keys + joystick. x = right, y = forward. */
  getMove() {
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyW', 'ArrowUp')) y += 1;
    if (this.isDown('KeyS', 'ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; } // diagonals must not be faster
    return { x, y };
  }

  /** True once per press — perfect for jumping. */
  consumeJump() {
    const pressed = this.jumpQueued;
    this.jumpQueued = false;
    return pressed;
  }

  /** Drag distance in pixels since the last call. */
  consumeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return d;
  }
  // #endregion

  // #region pointers
  #bindPointers() {
    const RADIUS = 56; // joystick travel in CSS pixels
    let stickId = null;
    let lookId = null;
    let origin = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };

    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('button, input, label, select, a')) return; // let UI work
      if (e.pointerType === 'touch') this.showTouchUI();
      const leftHalf = e.clientX < window.innerWidth * 0.5;
      if (this.joystickEnabled && e.pointerType === 'touch' && leftHalf && stickId === null) {
        stickId = e.pointerId;
        origin = { x: e.clientX, y: e.clientY };
        this.base.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
        this.knob.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
        this.base.classList.add('on');
        this.knob.classList.add('on');
      } else if (this.lookEnabled && lookId === null) {
        lookId = e.pointerId;
        last = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) {
        let dx = e.clientX - origin.x;
        let dy = e.clientY - origin.y;
        const len = Math.hypot(dx, dy);
        if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
        this.stick.x = dx / RADIUS;
        this.stick.y = -dy / RADIUS; // screen y grows downward; forward is up
        this.knob.style.transform = `translate(${origin.x + dx}px, ${origin.y + dy}px)`;
      } else if (e.pointerId === lookId) {
        this.lookDelta.x += e.clientX - last.x;
        this.lookDelta.y += e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
      }
    });

    const release = (e) => {
      if (e.pointerId === stickId) {
        stickId = null;
        this.stick.x = this.stick.y = 0;
        this.base.classList.remove('on');
        this.knob.classList.remove('on');
      }
      if (e.pointerId === lookId) lookId = null;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    document.body.append(this.base, this.knob);
  }
  // #endregion

  #makeJumpButton() {
    this.jumpBtn = document.createElement('button');
    this.jumpBtn.className = 'jump-btn';
    this.jumpBtn.textContent = 'JUMP';
    this.jumpBtn.setAttribute('aria-label', 'Jump');
    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpQueued = true;
      this.jumpHeld = true;
    });
    const up = () => { this.jumpHeld = false; };
    this.jumpBtn.addEventListener('pointerup', up);
    this.jumpBtn.addEventListener('pointercancel', up);
    this.jumpBtn.addEventListener('pointerleave', up);
    document.body.append(this.jumpBtn);
  }

  showTouchUI() {
    document.body.classList.add('touch');
  }

  #injectStyles() {
    const css = `
      html, body { touch-action: none; -webkit-user-select: none; user-select: none;
        -webkit-touch-callout: none; overscroll-behavior: none; }
      .stick-base, .stick-knob { position: fixed; left: 0; top: 0; border-radius: 50%;
        pointer-events: none; opacity: 0; transition: opacity .15s; z-index: 5; }
      .stick-base { width: 112px; height: 112px; margin: -56px 0 0 -56px;
        border: 2px solid rgba(255,255,255,.7); background: rgba(27,26,34,.18); }
      .stick-knob { width: 52px; height: 52px; margin: -26px 0 0 -26px;
        background: rgba(255,255,255,.85); box-shadow: 0 4px 14px rgba(0,0,0,.25); }
      .stick-base.on, .stick-knob.on { opacity: 1; }
      .jump-btn { display: none; position: fixed; z-index: 5;
        right: calc(22px + env(safe-area-inset-right)); bottom: calc(26px + env(safe-area-inset-bottom));
        width: 84px; height: 84px; border-radius: 50%; border: 0;
        background: #ff5b2e; color: #fff; font: 800 15px/1 system-ui, sans-serif; letter-spacing: .06em;
        box-shadow: 0 6px 0 #b83a17, 0 10px 24px rgba(0,0,0,.25); touch-action: none; }
      .jump-btn:active { transform: translateY(4px); box-shadow: 0 2px 0 #b83a17; }
      body.touch .jump-btn { display: block; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }
}
