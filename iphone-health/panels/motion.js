import { h, button, statusLine } from '../lib/dom.js';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function cardinal(degrees) {
  const normalised = ((degrees % 360) + 360) % 360;
  return CARDINALS[Math.round(normalised / 45) % 8];
}

export default function mountMotion(ctx) {
  const state = {
    listening: false,
    events: 0,
    accelSamples: 0,
    gravity: null,
    gx: 0,
    gy: 0,
    beta: null,
    gamma: null,
    rotMax: 0,
    heading: null,
    headingAccuracy: null,
    buckets: new Set(),
  };
  const passed = {
    accel: ctx.result && ctx.result.items && ctx.result.items.accel === 'yes',
    gyro: ctx.result && ctx.result.items && ctx.result.items.gyro === 'yes',
    compass: ctx.result && ctx.result.items && ctx.result.items.compass === 'yes',
  };
  let raf = 0;
  let waitTimer = 0;

  const bubble = h('span', { class: 'level-bubble' });
  const level = h('div', { class: 'level', 'aria-hidden': 'true' }, h('span', { class: 'level-ring' }), h('span', { class: 'level-cross' }), bubble);
  const rose = h('div', { class: 'rose' }, ...['N', 'E', 'S', 'W'].map((letter) => h('span', { class: `rose-${letter.toLowerCase()}` }, letter)));
  const compass = h('div', { class: 'compass', 'aria-hidden': 'true' }, rose, h('span', { class: 'compass-needle' }));
  const out = {
    gravity: h('span', { class: 'reading-value' }, '—'),
    tilt: h('span', { class: 'reading-value' }, '—'),
    rotation: h('span', { class: 'reading-value' }, '—'),
    heading: h('span', { class: 'reading-value' }, '—'),
  };
  const reading = (label, value) => h('div', { class: 'reading' }, h('span', { class: 'reading-label' }, label), value);
  const status = statusLine('Sensors are off.');
  const start = button('Start sensors', { kind: 'primary', iconName: 'motion', wide: true, onClick: begin });

  ctx.body.append(
    h('p', { class: 'panel-lede' }, 'Lay the phone flat, then tilt it, give it a quick twist, and turn around slowly.'),
    h('div', { class: 'dials' }, h('figure', {}, level, h('figcaption', {}, 'Level')), h('figure', {}, compass, h('figcaption', {}, 'Compass'))),
    h('div', { class: 'readings' }, reading('Gravity', out.gravity), reading('Tilt', out.tilt), reading('Rotation', out.rotation), reading('Heading', out.heading)),
    status,
    start,
    ctx.checklist(),
  );

  function onMotion(event) {
    state.events += 1;
    const g = event.accelerationIncludingGravity;
    if (g && g.x !== null && g.x !== undefined) {
      state.gravity = Math.hypot(g.x, g.y, g.z);
      state.gx = g.x;
      state.gy = g.y;
      state.accelSamples += 1;
      if (!passed.accel && state.accelSamples > 15 && state.gravity > 8.3 && state.gravity < 11.3) {
        passed.accel = true;
        ctx.setItem('accel', 'yes', { auto: true });
      }
    }
    const r = event.rotationRate;
    if (r && r.alpha !== null && r.alpha !== undefined) {
      const magnitude = Math.max(Math.abs(r.alpha || 0), Math.abs(r.beta || 0), Math.abs(r.gamma || 0));
      state.rotMax = Math.max(state.rotMax * 0.995, magnitude);
      state.rotNow = magnitude;
      if (!passed.gyro && magnitude > 60) {
        passed.gyro = true;
        ctx.setItem('gyro', 'yes', { auto: true });
      }
    }
  }

  function onOrientation(event) {
    state.events += 1;
    if (event.beta !== null && event.beta !== undefined) {
      state.beta = event.beta;
      state.gamma = event.gamma;
    }
    let heading = null;
    if (typeof event.webkitCompassHeading === 'number' && event.webkitCompassHeading >= 0) {
      heading = event.webkitCompassHeading;
      state.headingAccuracy = typeof event.webkitCompassAccuracy === 'number' ? event.webkitCompassAccuracy : null;
    } else if (event.absolute && typeof event.alpha === 'number') {
      heading = (360 - event.alpha) % 360;
    }
    if (heading !== null) {
      state.heading = heading;
      state.buckets.add(Math.floor(heading / 30));
      if (!passed.compass && state.buckets.size >= 3) {
        passed.compass = true;
        ctx.setItem('compass', 'yes', { auto: true });
      }
    }
  }

  function render() {
    if (!state.listening) return;
    const radius = 46;
    let x = 0;
    let y = 0;
    if (state.beta !== null) {
      x = Math.max(-1, Math.min(1, -(state.gamma || 0) / 45));
      y = Math.max(-1, Math.min(1, -(state.beta || 0) / 45));
    } else if (state.gravity) {
      x = Math.max(-1, Math.min(1, state.gx / 9.81));
      y = Math.max(-1, Math.min(1, -state.gy / 9.81));
    }
    bubble.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    if (state.gravity) out.gravity.textContent = `${state.gravity.toFixed(2)} m/s²`;
    if (state.beta !== null) out.tilt.textContent = `${Math.round(state.beta)}° / ${Math.round(state.gamma || 0)}°`;
    if (state.rotNow !== undefined) out.rotation.textContent = `${Math.round(state.rotNow)}°/s`;
    if (state.heading !== null) {
      rose.style.transform = `rotate(${-state.heading}deg)`;
      out.heading.textContent = `${Math.round(state.heading)}° ${cardinal(state.heading)}`;
    }
    const waiting = [];
    if (!passed.accel) waiting.push('tilt');
    if (!passed.gyro) waiting.push('twist the phone quickly');
    if (!passed.compass) waiting.push(state.heading === null ? 'waiting for the compass' : 'turn around slowly');
    if (state.headingAccuracy !== null && state.headingAccuracy < 0) status.textContent = 'Compass needs calibrating: move the phone in a figure-eight.';
    else if (!state.events) status.textContent = 'Waiting for sensor data…';
    else status.textContent = waiting.length ? `Now ${waiting.join(', ')}.` : 'All three sensors responded.';
    raf = requestAnimationFrame(render);
  }

  async function begin() {
    if (state.listening) {
      finish('Sensors are off.');
      return;
    }
    const requests = [];
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') requests.push(DeviceMotionEvent.requestPermission());
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') requests.push(DeviceOrientationEvent.requestPermission());
    if (typeof DeviceMotionEvent === 'undefined' && typeof DeviceOrientationEvent === 'undefined') {
      status.textContent = 'This browser doesn’t provide motion sensors.';
      return;
    }
    try {
      const answers = await Promise.all(requests.map((request) => request.catch(() => 'denied')));
      if (answers.length && answers.every((answer) => answer !== 'granted')) {
        status.textContent = 'Motion access was declined. Reload the page and tap Allow when Safari asks.';
        return;
      }
    } catch {
      status.textContent = 'Motion access was declined. Reload the page and tap Allow when Safari asks.';
      return;
    }
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('deviceorientationabsolute', onOrientation);
    state.listening = true;
    start.querySelector('.button-label').textContent = 'Stop sensors';
    start.classList.replace('primary', 'secondary');
    raf = requestAnimationFrame(render);
    waitTimer = setTimeout(() => {
      if (state.listening && !state.events) status.textContent = 'No sensor data. On iPhone, use Safari and allow Motion & Orientation access. A phone with no response here may have a sensor fault.';
    }, 3500);
  }

  function finish(message) {
    state.listening = false;
    cancelAnimationFrame(raf);
    clearTimeout(waitTimer);
    window.removeEventListener('devicemotion', onMotion);
    window.removeEventListener('deviceorientation', onOrientation);
    window.removeEventListener('deviceorientationabsolute', onOrientation);
    start.querySelector('.button-label').textContent = 'Start sensors';
    start.classList.replace('secondary', 'primary');
    if (message) status.textContent = message;
  }

  ctx.onHidden(() => { if (state.listening) finish('Sensors paused because you left the page.'); });
  ctx.onCleanup(() => finish());
}
