import test from 'node:test';
import assert from 'node:assert/strict';

const elements = new Map();
class Element {
  constructor(id) { this.id = id; this.hidden = false; this.disabled = false; this.textContent = ''; this.style = {}; this.dataset = {}; this.events = new Map(); this.classList = { add() {}, remove() {}, toggle() {} }; }
  setAttribute() {}
  addEventListener(name, callback) { this.events.set(name, callback); }
  click() { return this.events.get('click')?.(); }
  getContext() { return null; }
}
const docEvents = new Map();
const windowEvents = new Map();
const contexts = [];
const workers = [];
let permissionRequest;
let permissionCount = 0;
let activeTrack;
const track = () => ({ stopped: false, stop() { this.stopped = true; }, onended: null });
const stream = () => { activeTrack = track(); return { getTracks: () => [activeTrack], getAudioTracks: () => [activeTrack] }; };
class Node {
  constructor() { this.port = {}; }
  connect() { return this; }
  disconnect() { this.disconnected = true; }
  start() {}
  stop() {}
}
class Context {
  constructor() { this.state = 'running'; this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; this.destination = {}; contexts.push(this); }
  async resume() {}
  async close() { this.state = 'closed'; }
  createMediaStreamSource() { return new Node(); }
  createBufferSource() { return new Node(); }
  createGain() { const node = new Node(); node.gain = { value: 0, setTargetAtTime() {} }; return node; }
  createBuffer(channels, length) { const samples = new Float32Array(length); return { getChannelData: () => samples }; }
}
class MockWorker {
  constructor() { workers.push(this); }
  postMessage() {}
  terminate() { this.terminated = true; }
}
globalThis.document = {
  hidden: false, activeElement: null,
  getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); },
  querySelectorAll() { return []; },
  addEventListener(name, callback) { docEvents.set(name, callback); }
};
globalThis.window = {
  isSecureContext: true, AudioContext: Context, AudioWorkletNode: Node, Worker: MockWorker,
  matchMedia: () => ({ matches: false }),
  addEventListener(name, callback) { windowEvents.set(name, callback); }
};
globalThis.AudioWorkletNode = Node;
globalThis.Worker = MockWorker;
globalThis.requestAnimationFrame = () => {};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => { permissionCount++; return permissionRequest(); } } } });
await import('../app.js');
const el = id => elements.get(id);
const flush = () => new Promise(resolve => setImmediate(resolve));

test('microphone tracks and worker are released on Stop', async () => {
  permissionRequest = async () => stream();
  await el('startButton').click();
  assert.equal(el('status').textContent, 'LISTENING LIVE');
  const mic = activeTrack;
  const worker = workers.at(-1);
  el('stopButton').click();
  assert.equal(mic.stopped, true);
  assert.equal(worker.terminated, true);
  assert.equal(contexts.at(-1).state, 'closed');
  assert.equal(el('status').textContent, 'MICROPHONE OFF');
});
test('Stop during a pending permission prompt releases a late-granted stream', async () => {
  let grant;
  permissionRequest = () => new Promise(resolve => { grant = resolve; });
  const started = el('startButton').click();
  await flush();
  el('stopButton').click();
  const lateStream = stream();
  const mic = activeTrack;
  grant(lateStream);
  await started;
  assert.equal(mic.stopped, true);
  assert.equal(el('status').textContent, 'MICROPHONE OFF');
  assert.equal(contexts.at(-1).state, 'closed');
});
test('denied permission leaves no audio resources open and shows an actionable error', async () => {
  permissionRequest = async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); };
  await el('startButton').click();
  assert.match(el('message').textContent, /site settings/);
  assert.equal(el('message').hidden, false);
  assert.equal(el('startButton').hidden, false);
  assert.equal(contexts.at(-1).state, 'closed');
});
test('backgrounding releases the microphone without restarting it', async () => {
  permissionRequest = async () => stream();
  await el('startButton').click();
  const mic = activeTrack;
  document.hidden = true;
  docEvents.get('visibilitychange')();
  assert.equal(mic.stopped, true);
  assert.equal(contexts.at(-1).state, 'closed');
  assert.match(el('readingNote').textContent, /left the tab/);
  document.hidden = false;
  docEvents.get('visibilitychange')();
  assert.equal(el('status').textContent, 'MICROPHONE OFF');
});
test('synthetic demo uses the detector without requesting microphone permission', async () => {
  const before = permissionCount;
  await el('demoButton').click();
  assert.equal(permissionCount, before);
  assert.equal(el('status').textContent, 'SYNTHETIC DEMO');
  assert.equal(el('demoNotice').hidden, false);
  const worker = workers.at(-1);
  windowEvents.get('pagehide')();
  assert.equal(worker.terminated, true);
  assert.equal(contexts.at(-1).state, 'closed');
});
