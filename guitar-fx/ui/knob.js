import { clamp, fromUnit, toUnit } from '../audio/dsp.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const START = -135;
const SWEEP = 270;

const STEP = { db: 0.5, ms: 1, hz: 10, hzlfo: 0.01, pct: 1, num: 0.1, s: 0.1, ratio: 0.1 };

export function roundValue(param, value) {
  let step = STEP[param.unit] ?? 0.01;
  if (param.unit === 'hz' && value >= 1000) step = 50;
  if (param.unit === 'ms' && value >= 200) step = 5;
  return clamp(Math.round(value / step) * step, param.min, param.max);
}

export function formatValue(param, value) {
  const v = Number(value);
  switch (param.unit) {
    case 'db': {
      const abs = Math.abs(v);
      const sign = v > 0.04 ? '+' : v < -0.04 ? '−' : '';
      return `${sign}${abs.toFixed(Number.isInteger(Math.round(abs * 10) / 10) ? 0 : 1)} dB`;
    }
    case 'ms': return `${Math.round(v)} ms`;
    case 's': return `${v.toFixed(1)} s`;
    case 'hz': return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`;
    case 'hzlfo': return `${v < 1 ? v.toFixed(2) : v.toFixed(1)} Hz`;
    case 'pct': return `${Math.round(v)}%`;
    case 'ratio': return `${v < 10 ? v.toFixed(1) : Math.round(v)}:1`;
    default: return v.toFixed(1);
  }
}

function arcPath(radius) {
  const point = deg => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(32 + radius * Math.cos(rad)).toFixed(2)} ${(32 + radius * Math.sin(rad)).toFixed(2)}`;
  };
  return `M ${point(START)} A ${radius} ${radius} 0 1 1 ${point(START + SWEEP)}`;
}

function svg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/**
 * Rotary knob. Touch: swipe sideways (vertical swipes keep scrolling the page).
 * Mouse/pen: drag up/down or sideways. Keyboard: arrows, Page Up/Down, Home/End.
 * Double-tap or double-click resets to the default value.
 */
export function createKnob({ param, value, onChange, compact = false }) {
  const root = document.createElement('div');
  root.className = compact ? 'knob compact' : 'knob';
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', param.label);
  root.setAttribute('aria-valuemin', String(param.min));
  root.setAttribute('aria-valuemax', String(param.max));

  const dial = svg('svg', { viewBox: '0 0 64 64', class: 'knob-dial', 'aria-hidden': 'true' });
  const track = svg('path', { d: arcPath(27), class: 'knob-track', pathLength: '100' });
  const arc = svg('path', { d: arcPath(27), class: 'knob-arc', pathLength: '100' });
  const cap = svg('circle', { cx: '32', cy: '32', r: '19', class: 'knob-cap' });
  const pointer = svg('line', { x1: '32', y1: '30', x2: '32', y2: '16', class: 'knob-pointer' });
  dial.append(track, arc, cap, pointer);
  const readout = document.createElement('span');
  readout.className = 'knob-value';
  const label = document.createElement('span');
  label.className = 'knob-label';
  label.textContent = param.label;
  root.append(dial, readout, label);

  let current = roundValue(param, value);
  let drag = null;
  let lastTap = 0;

  const render = () => {
    const t = toUnit(current, param);
    arc.setAttribute('stroke-dasharray', `${(t * 100).toFixed(2)} 100`);
    pointer.setAttribute('transform', `rotate(${(START + t * SWEEP).toFixed(1)} 32 32)`);
    const text = formatValue(param, current);
    readout.textContent = text;
    root.setAttribute('aria-valuenow', String(current));
    root.setAttribute('aria-valuetext', text);
  };

  const commit = (next, notify = true) => {
    const rounded = roundValue(param, next);
    if (rounded === current) return;
    current = rounded;
    render();
    if (notify) onChange?.(current);
  };
  const setUnit = t => commit(fromUnit(clamp(t, 0, 1), param));

  root.addEventListener('pointerdown', event => {
    if (event.button !== 0 || root.classList.contains('disabled')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, unit: toUnit(current, param), value: current, type: event.pointerType, moved: false };
    try { root.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
    root.classList.add('active');
    if (event.pointerType !== 'touch') event.preventDefault();
  });
  root.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const travel = drag.type === 'touch' ? dx : dx - dy;
    if (Math.abs(travel) > 3) drag.moved = true;
    const distance = event.shiftKey ? 720 : drag.type === 'touch' ? 190 : 200;
    setUnit(drag.unit + travel / distance);
  });
  const end = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const wasTap = !drag.moved;
    drag = null;
    root.classList.remove('active');
    if (wasTap) {
      const now = performance.now();
      if (now - lastTap < 320) { commit(param.def); lastTap = 0; } else lastTap = now;
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', event => {
    // The browser took over the gesture to scroll; undo any accidental change.
    if (drag && event.pointerId === drag.id) commit(drag.value);
    drag = null;
    root.classList.remove('active');
  });
  root.addEventListener('keydown', event => {
    const t = toUnit(current, param);
    const keys = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 };
    if (event.key in keys) setUnit(t + keys[event.key] * (event.shiftKey ? 0.25 : 1));
    else if (event.key === 'Home') setUnit(0);
    else if (event.key === 'End') setUnit(1);
    else if (event.key === 'Delete' || event.key === 'Backspace') commit(param.def);
    else return;
    event.preventDefault();
  });

  render();
  return {
    el: root,
    get value() { return current; },
    setValue(next) { commit(next, false); },
  };
}
