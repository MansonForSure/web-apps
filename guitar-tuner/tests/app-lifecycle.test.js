import test from 'node:test';
import assert from 'node:assert/strict';
import { guitarSignal } from '../src/tuner.js';

class FakeElement extends EventTarget {
  constructor() {
    super(); this.textContent = ''; this.innerHTML = ''; this.style = {}; this.dataset = {};
    this.attributes = new Map(); this.children = []; this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  append(child) { this.children.push(child); }
  click() { this.dispatchEvent(new Event('click')); }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
let caseId = 0;

async function environment(getUserMedia) {
  const elements = new Map();
  const document = new EventTarget();
  document.hidden = false;
  document.body = new FakeElement();
  document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  document.createElement = () => new FakeElement();
  const frames = new Map();
  let frameId = 0;
  const contexts = [];
  let input = guitarSignal(82.4069, 44100);
  class AudioContext {
    constructor() { this.state = 'running'; this.sampleRate = 44100; this.currentTime = 0; this.destination = {}; this.disconnected = false; contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: (destination) => destination.set(input) }; }
    createMediaStreamSource() { return { connect() {}, disconnect: () => { this.disconnected = true; } }; }
    createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
  }
  const window = new EventTarget();
  window.AudioContext = AudioContext; window.isSecureContext = true;
  globalThis.document = document; globalThis.window = window;
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia } }, configurable: true });
  globalThis.requestAnimationFrame = (callback) => { const id = ++frameId; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  await import(`../src/app.js?test=${++caseId}`);
  return {
    document, window, contexts, element: (id) => document.getElementById(id), frames,
    tick(now = performance.now() + 100) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(now); },
    silence() { input = new Float32Array(4096); },
    cleanup() { window.dispatchEvent(new Event('pagehide')); },
  };
}

function stream() {
  const track = new EventTarget(); track.stops = 0; track.stop = () => { track.stops += 1; };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

test('cancel a pending microphone request and stop a late stream', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const env = await environment(() => pending);
  const input = stream();
  env.element('microphone-button').click();
  assert.equal(env.document.body.dataset.mode, 'permission');
  env.element('microphone-button').click();
  resolve(input); await flush();
  assert.equal(env.document.body.dataset.mode, 'idle');
  assert.equal(input.track.stops, 1);
  assert.equal(env.contexts.length, 0);
  env.cleanup();
});

test('stop releases microphone, closes audio context, and cancels the loop', async () => {
  const input = stream(); const env = await environment(async () => input);
  env.element('microphone-button').click(); await flush();
  assert.equal(env.document.body.dataset.mode, 'microphone');
  env.element('microphone-button').click();
  assert.equal(input.track.stops, 1);
  assert.equal(env.contexts[0].state, 'closed');
  assert.equal(env.contexts[0].disconnected, true);
  assert.equal(env.frames.size, 0);
  assert.equal(env.document.body.dataset.mode, 'idle');
  env.cleanup();
});

test('permission denial shows an actionable error without retaining audio', async () => {
  const env = await environment(async () => { throw new DOMException('Permission denied', 'NotAllowedError'); });
  env.element('microphone-button').click(); await flush();
  assert.equal(env.document.body.dataset.mode, 'idle');
  assert.match(env.element('status').textContent, /denied.*settings/i);
  assert.equal(env.document.body.dataset.tuning, 'error');
  assert.equal(env.contexts.length, 0);
  env.cleanup();
});

test('switching away releases the microphone', async () => {
  const input = stream(); const env = await environment(async () => input);
  env.element('microphone-button').click(); await flush();
  env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(input.track.stops, 1);
  assert.equal(env.document.body.dataset.mode, 'idle');
  assert.match(env.element('status').textContent, /Paused/);
  env.cleanup();
});

test('demo analyses generated input without requesting a microphone', async () => {
  let calls = 0;
  const env = await environment(async () => { calls += 1; return stream(); });
  env.element('demo-button').click(); env.tick();
  assert.equal(calls, 0);
  assert.equal(env.document.body.dataset.mode, 'demo');
  assert.match(env.element('source-label').textContent, /SIMULATED/);
  assert.notEqual(env.element('frequency').textContent, '—');
  env.element('demo-button').click();
  assert.equal(env.frames.size, 0);
  assert.equal(env.document.body.dataset.mode, 'idle');
  env.cleanup();
});

test('a reference tone stops microphone capture before using the speaker', async () => {
  const input = stream(); const env = await environment(async () => input);
  env.element('microphone-button').click(); await flush();
  env.element('reference-button').click(); await flush();
  assert.equal(input.track.stops, 1);
  assert.equal(env.contexts[0].state, 'closed');
  assert.equal(env.document.body.dataset.mode, 'reference');
  assert.match(env.element('source-label').textContent, /REFERENCE/);
  env.element('reference-button').click();
  assert.equal(env.document.body.dataset.mode, 'idle');
  assert.equal(env.contexts[1].state, 'closed');
  env.cleanup();
});

test('manual string target and automatic selection stay explicit', async () => {
  const env = await environment(async () => stream());
  const buttons = env.element('strings').children;
  assert.equal(buttons.length, 6);
  buttons[5].click();
  assert.equal(buttons[5].getAttribute('aria-pressed'), 'true');
  assert.equal(env.element('auto-button').getAttribute('aria-pressed'), 'false');
  assert.match(env.element('reference-label').textContent, /E4/);
  env.element('auto-button').click();
  assert.equal(env.element('auto-button').getAttribute('aria-pressed'), 'true');
  assert.equal(buttons[5].getAttribute('aria-pressed'), 'false');
  env.cleanup();
});

test('silence clears an old pitch rather than displaying a stale reading', async () => {
  const input = stream(); const env = await environment(async () => input);
  env.element('microphone-button').click(); await flush();
  const now = performance.now() + 100;
  env.tick(now); assert.notEqual(env.element('frequency').textContent, '—');
  env.silence(); env.tick(now + 600);
  assert.equal(env.element('frequency').textContent, '—');
  assert.equal(env.element('note').textContent, '—');
  env.cleanup();
});

test('demo tolerates an initial frame timestamp before the start time', async () => {
  const env = await environment(async () => stream());
  env.element('demo-button').click();
  env.tick(performance.now() - 50);
  assert.notEqual(env.element('frequency').textContent, '—');
  assert.equal(env.document.body.dataset.mode, 'demo');
  env.cleanup();
});
