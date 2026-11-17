import { PEDALS } from './audio/pedals.js';
import { Engine, loadProcessors } from './audio/engine.js';
import { Visualizer } from './audio/visualizer.js';
import { makeDemoRiff } from './audio/demo.js';
import { blockLevel, clamp, gainToDb } from './audio/dsp.js';
import { PRESETS, PRESET_BY_ID } from './presets.js';
import { MASTER_PARAMS, presetPedals, sanitizeSettings } from './settings.js';
import { createKnob } from './ui/knob.js';

const STORAGE_KEY = 'stompbox.settings.v1';
const AMBER = '#f4b942';
const ids = ['statusDot', 'status', 'quickToggle', 'scope', 'gpuBadge', 'demoNotice', 'inDb', 'inClip', 'inFill', 'inPeak',
  'inputKnob', 'outDb', 'outLimit', 'outFill', 'outPeak', 'masterKnob', 'startButton', 'stopButton', 'demoButton',
  'bypassButton', 'resumeButton', 'deviceSelect', 'channelSelect', 'latency', 'sampleRate', 'message', 'presetList',
  'presetState', 'chain', 'board'];
const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

function loadSettings() {
  try { return sanitizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { return sanitizeSettings(null); }
}

const state = {
  settings: loadSettings(),
  session: null,
  bypass: false,
  views: new Map(),
  knobs: {},
  raf: 0,
  frame: 0,
  taps: [],
  scopeColor: AMBER,
  meters: { in: { level: -90, hold: -90, holdAt: 0, flagUntil: 0 }, out: { level: -90, hold: -90, holdAt: 0, flagUntil: 0 } },
};
const vis = new Visualizer(ui.scope);
const buffers = { inTime: new Float32Array(1024), outTime: new Float32Array(2048), spectrum: new Uint8Array(1024), wave: new Uint8Array(2048) };

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch { /* Storage unavailable (private mode). */ }
  }, 250);
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function showMessage(text = '', kind = 'error') {
  ui.message.textContent = text;
  ui.message.hidden = !text;
  ui.message.classList.toggle('info', kind === 'info');
}

function setStatus(kind, text) {
  ui.status.textContent = text;
  ui.statusDot.className = `status-dot ${kind}`.trim();
}

// ---------- Pedalboard UI ----------

function renderBoard() {
  PEDALS.forEach((def, index) => {
    const view = { knobs: new Map(), modeButtons: [] };
    const footswitch = h('button', { class: 'footswitch', type: 'button', 'aria-pressed': 'false', 'aria-label': `${def.name} on or off`, onclick: () => togglePedal(def.id) },
      h('span', { class: 'footswitch-cap', 'aria-hidden': 'true' }));
    const head = h('div', { class: 'pedal-head' },
      h('span', { class: 'led', 'aria-hidden': 'true' }),
      h('div', { class: 'pedal-title' }, h('h3', { text: def.name }), h('span', { text: def.kind })),
      h('span', { class: 'pedal-index', 'aria-hidden': 'true', text: String(index + 1).padStart(2, '0') }),
      footswitch);
    const card = h('article', { class: 'pedal', id: `pedal-${def.id}`, style: `--pedal:${def.color}`, 'aria-label': def.name }, head);
    if (def.modes) {
      const group = h('div', { class: 'modes', role: 'group', 'aria-label': `${def.name} voicing` });
      def.modes.forEach(mode => {
        const button = h('button', { type: 'button', 'aria-pressed': 'false', 'data-mode': mode.id, text: mode.label, onclick: () => setMode(def.id, mode.id) });
        view.modeButtons.push(button);
        group.append(button);
      });
      card.append(group);
    }
    const knobs = h('div', { class: `knobs count-${def.params.length}` });
    def.params.forEach(param => {
      const knob = createKnob({ param, value: state.settings.pedals[def.id].params[param.key], onChange: value => setParam(def.id, param.key, value) });
      view.knobs.set(param.key, knob);
      knobs.append(knob.el);
    });
    card.append(knobs);
    if (def.tap) {
      view.tap = h('button', { class: 'tap-button', type: 'button', onclick: () => tapTempo(def.id) }, 'Tap tempo');
      view.tapNote = h('span', { class: 'tap-note', 'aria-live': 'polite' });
      card.append(h('div', { class: 'pedal-foot' }, view.tap, view.tapNote));
    }
    const chip = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', style: `--pedal:${def.color}`, 'aria-label': `${def.name} on or off`, onclick: () => togglePedal(def.id) },
      h('span', { class: 'led', 'aria-hidden': 'true' }), def.short);
    Object.assign(view, { card, footswitch, chip });
    state.views.set(def.id, view);
    ui.chain.append(chip);
    ui.board.append(card);
    syncPedalView(def.id);
  });
}

function syncPedalView(id) {
  const view = state.views.get(id);
  const pedal = state.settings.pedals[id];
  view.card.classList.toggle('on', pedal.on);
  view.footswitch.setAttribute('aria-pressed', String(pedal.on));
  view.chip.setAttribute('aria-pressed', String(pedal.on));
  view.modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === pedal.mode)));
  view.knobs.forEach((knob, key) => knob.setValue(pedal.params[key]));
}

function renderPresets() {
  PRESETS.forEach(preset => {
    ui.presetList.append(h('button', { class: 'preset', type: 'button', 'data-preset': preset.id, 'aria-pressed': 'false', onclick: () => applyPreset(preset.id) },
      h('strong', { text: preset.name }), h('span', { text: preset.note })));
  });
  syncPresetView();
}

function syncPresetView() {
  ui.presetList.querySelectorAll('.preset').forEach(button => {
    const selected = button.dataset.preset === state.settings.preset;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('edited', selected && state.settings.edited);
  });
  const preset = PRESET_BY_ID[state.settings.preset];
  ui.presetState.textContent = state.settings.edited ? `${preset.name} · edited · tap it to restore` : preset.name;
}

function applyPreset(id) {
  state.settings.preset = id;
  state.settings.edited = false;
  state.settings.pedals = presetPedals(id);
  PEDALS.forEach(def => {
    syncPedalView(def.id);
    state.session?.engine?.applyPedal(def.id, state.settings.pedals[def.id]);
  });
  syncPresetView();
  updateScopeColor();
  save();
}

function markEdited() {
  if (state.settings.edited) return;
  state.settings.edited = true;
  syncPresetView();
}

function togglePedal(id) {
  const pedal = state.settings.pedals[id];
  pedal.on = !pedal.on;
  state.session?.engine?.setPedalEnabled(id, pedal.on);
  syncPedalView(id);
  markEdited();
  updateScopeColor();
  save();
}

function setParam(id, key, value) {
  state.settings.pedals[id].params[key] = value;
  state.session?.engine?.setParam(id, key, value);
  markEdited();
  save();
}

function setMode(id, mode) {
  const pedal = state.settings.pedals[id];
  if (pedal.mode === mode) return;
  pedal.mode = mode;
  state.session?.engine?.setMode(id, mode);
  syncPedalView(id);
  markEdited();
  save();
}

function tapTempo(id) {
  const now = performance.now();
  state.taps = [...state.taps.filter(t => now - t < 2000), now].slice(-5);
  const view = state.views.get(id);
  view.tap.classList.remove('flash');
  void view.tap.offsetWidth;
  view.tap.classList.add('flash');
  if (state.taps.length < 2) { view.tapNote.textContent = 'Keep tapping…'; return; }
  const intervals = state.taps.slice(1).map((t, i) => t - state.taps[i]);
  const ms = clamp(intervals.reduce((a, b) => a + b, 0) / intervals.length, 40, 1500);
  view.knobs.get('time').setValue(ms);
  setParam(id, 'time', view.knobs.get('time').value);
  view.tapNote.textContent = `${Math.round(60000 / ms)} BPM`;
}

function updateScopeColor() {
  const active = PEDALS.filter(def => state.settings.pedals[def.id].on && def.id !== 'gate' && def.id !== 'comp');
  state.scopeColor = active.length ? active[active.length - 1].color : AMBER;
  if (!state.session) drawIdle();
}

function setupRackKnobs() {
  state.knobs.input = createKnob({ param: MASTER_PARAMS.input, value: state.settings.input, compact: true, onChange: value => {
    state.settings.input = value; state.session?.engine?.setInput(value); save();
  } });
  state.knobs.master = createKnob({ param: MASTER_PARAMS.master, value: state.settings.master, compact: true, onChange: value => {
    state.settings.master = value; state.session?.engine?.setMaster(value); save();
  } });
  ui.inputKnob.append(state.knobs.input.el);
  ui.masterKnob.append(state.knobs.master.el);
}

// ---------- Meters and visuals ----------

function drawIdle() {
  vis.draw({ live: 0, color: state.scopeColor });
}

const meterPosition = db => clamp((db + 60) / 60, 0, 1);

function updateMeter(which, { peak }, now) {
  const meter = state.meters[which];
  const db = gainToDb(peak);
  meter.level = Math.max(db, meter.level - 1.1);
  if (db >= meter.hold || now - meter.holdAt > 1200) { meter.hold = db; meter.holdAt = now; }
  if (which === 'in' ? peak >= 0.98 : peak >= 0.84) meter.flagUntil = now + 1500;
  const fill = which === 'in' ? ui.inFill : ui.outFill;
  const peakEl = which === 'in' ? ui.inPeak : ui.outPeak;
  fill.style.transform = `scaleX(${meterPosition(meter.level).toFixed(3)})`;
  peakEl.style.left = `${(meterPosition(meter.hold) * 100).toFixed(1)}%`;
  if (state.frame % 6 === 0) {
    (which === 'in' ? ui.inDb : ui.outDb).textContent = meter.level <= -60 ? '< −60 dB' : `${meter.level < -0.5 ? '−' : ''}${Math.abs(Math.round(meter.level))} dB`;
    (which === 'in' ? ui.inClip : ui.outLimit).classList.toggle('lit', now < meter.flagUntil);
  }
}

function resetMeters() {
  for (const which of ['in', 'out']) Object.assign(state.meters[which], { level: -90, hold: -90, holdAt: 0, flagUntil: 0 });
  ui.inFill.style.transform = ui.outFill.style.transform = 'scaleX(0)';
  ui.inPeak.style.left = ui.outPeak.style.left = '0%';
  ui.inDb.textContent = ui.outDb.textContent = '— dB';
  ui.inClip.classList.remove('lit');
  ui.outLimit.classList.remove('lit');
}

function startLoop() {
  cancelAnimationFrame(state.raf);
  const tick = () => {
    const session = state.session;
    if (!session?.engine) return;
    const { engine, ctx } = session;
    const now = performance.now();
    state.frame++;
    engine.inAnalyser.getFloatTimeDomainData(buffers.inTime);
    engine.outAnalyser.getFloatTimeDomainData(buffers.outTime);
    engine.outAnalyser.getByteFrequencyData(buffers.spectrum);
    engine.outAnalyser.getByteTimeDomainData(buffers.wave);
    updateMeter('in', blockLevel(buffers.inTime), now);
    updateMeter('out', blockLevel(buffers.outTime), now);
    vis.draw({ spectrum: buffers.spectrum, wave: buffers.wave, nyquist: ctx.sampleRate / 2, live: ctx.state === 'running' ? 1 : 0.25, color: state.scopeColor });
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
}

// ---------- Audio session lifecycle ----------

const isCurrent = session => state.session === session;
const inputTrack = session => session?.stream?.getAudioTracks()[0] || null;

function syncTransport() {
  const session = state.session;
  ui.startButton.hidden = session?.mode === 'mic';
  ui.demoButton.hidden = session?.mode === 'demo';
  ui.stopButton.hidden = !session;
  ui.quickToggle.textContent = session ? 'Stop' : 'Start';
  ui.quickToggle.classList.toggle('live', Boolean(session));
  ui.deviceSelect.disabled = session?.mode !== 'mic' || ui.deviceSelect.options.length < 2;
  ui.demoNotice.hidden = session?.mode !== 'demo';
}

function errorText(error) {
  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was blocked. Allow microphone access for this site in your browser settings, then tap Start again. Open the page directly in Safari or Chrome, not inside another app’s preview.';
  if (name === 'NotFoundError') return 'No audio input was found. Connect your audio interface or enable a microphone, then try again.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The input is busy or unavailable. Close other apps that use the microphone (calls, recorders), then try again.';
  if (name === 'OverconstrainedError') return 'That input could not be opened with these settings. Pick another input device and try again.';
  return error?.message || 'Audio could not start. Refresh the page and use a recent Safari, Chrome, Edge or Firefox.';
}

function audioConstraints(deviceId) {
  // Raw signal: no echo cancellation, noise suppression or automatic gain.
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return { audio, video: false };
}

async function requestStream(deviceId) {
  try {
    return await navigator.mediaDevices.getUserMedia(audioConstraints(deviceId));
  } catch (error) {
    if (!deviceId || (error?.name !== 'OverconstrainedError' && error?.name !== 'NotFoundError')) throw error;
    state.settings.deviceId = '';
    save();
    return navigator.mediaDevices.getUserMedia(audioConstraints(''));
  }
}

function effectiveChannel(session) {
  if (session?.mode !== 'mic') return 'mix';
  const count = inputTrack(session)?.getSettings?.().channelCount;
  return count === 1 ? 'mix' : state.settings.channel;
}

function syncChannelAvailability() {
  const session = state.session;
  const mono = session?.mode === 'mic' && inputTrack(session)?.getSettings?.().channelCount === 1;
  [...ui.channelSelect.options].forEach(option => { if (option.value !== 'mix') option.disabled = mono; });
  ui.channelSelect.value = mono ? 'mix' : state.settings.channel;
}

function watchTrack(session) {
  const track = inputTrack(session);
  if (!track) return;
  track.onended = () => {
    if (isCurrent(session)) stopSession('The audio input disconnected. Reconnect it, then tap Start again.', 'error');
  };
}

function updateLatency() {
  const session = state.session;
  if (!session?.ctx) return;
  const parts = [session.ctx.baseLatency, session.ctx.outputLatency, inputTrack(session)?.getSettings?.().latency]
    .filter(value => Number.isFinite(value) && value > 0);
  ui.latency.textContent = parts.length ? `≈ ${Math.round(parts.reduce((a, b) => a + b, 0) * 1000)} ms` : 'Not reported';
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    const activeId = inputTrack(state.session)?.getSettings?.().deviceId || state.settings.deviceId;
    const options = devices.map((device, i) => h('option', { value: device.deviceId, text: device.label || `Input ${i + 1}` }));
    ui.deviceSelect.replaceChildren(...(options.length ? options : [h('option', { value: '', text: 'Default input' })]));
    if (devices.some(device => device.deviceId === activeId)) ui.deviceSelect.value = activeId;
  } catch { /* Device listing is optional. */ }
  syncTransport();
}

function handleContextState(session) {
  if (!isCurrent(session)) return;
  const contextState = session.ctx.state;
  if (contextState === 'running') {
    setStatus(session.mode === 'demo' ? 'demo' : 'live', session.mode === 'demo' ? 'DEMO' : 'LIVE');
    ui.resumeButton.hidden = true;
  } else if (contextState !== 'closed') {
    setStatus('paused', 'PAUSED');
    ui.resumeButton.hidden = false;
  }
}

function release(session) {
  if (!session || session.released) return;
  session.released = true;
  session.timers.forEach(clearInterval);
  session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  if (session.mode === 'demo' && session.source) { try { session.source.stop(); } catch { /* Not started. */ } }
  session.engine?.dispose();
  if (session.ctx) {
    session.ctx.onstatechange = null;
    if (session.ctx.state !== 'closed') session.ctx.close().catch(() => {});
  }
}

function stopSession(note = '', kind = 'info') {
  const session = state.session;
  state.session = null;
  release(session);
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  resetMeters();
  drawIdle();
  setStatus('', 'OFF');
  ui.resumeButton.hidden = true;
  ui.latency.textContent = '—';
  syncTransport();
  syncChannelAvailability();
  showMessage(note, kind);
}

async function startSession(mode) {
  showMessage();
  if (state.session) stopSession();
  if (!window.isSecureContext) { showMessage('Live audio needs a secure page. Open the HTTPS GitHub Pages link, or run the app on localhost.'); return; }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.AudioWorkletNode) { showMessage('This browser lacks the real-time audio features Stompbox needs (AudioWorklet). Update to a recent Safari, Chrome, Edge or Firefox.'); return; }
  if (mode === 'mic' && !navigator.mediaDevices?.getUserMedia) { showMessage('Audio input is not available here. Open the HTTPS site directly in Safari or Chrome.'); return; }

  const session = { mode, ctx: null, stream: null, source: null, engine: null, released: false, timers: [] };
  state.session = session;
  setStatus('wait', mode === 'mic' ? 'WAITING FOR INPUT' : 'STARTING DEMO');
  syncTransport();
  try {
    // Create and resume the context inside the tap so iOS unlocks audio output.
    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    session.ctx = ctx;
    const resumed = ctx.resume().catch(() => {});
    if (mode === 'mic') {
      const stream = await requestStream(state.settings.deviceId);
      session.stream = stream;
      if (!isCurrent(session)) { release(session); return; }
      watchTrack(session);
    }
    await resumed;
    await loadProcessors(ctx);
    if (!isCurrent(session)) { release(session); return; }
    session.engine = new Engine(ctx, state.settings);
    session.engine.setBypassAll(state.bypass);
    if (mode === 'mic') {
      session.source = ctx.createMediaStreamSource(session.stream);
      session.engine.connectSource(session.source, effectiveChannel(session));
    } else {
      const data = makeDemoRiff(ctx.sampleRate);
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buffer.getChannelData(0).set(data);
      const player = ctx.createBufferSource();
      player.buffer = buffer;
      player.loop = true;
      session.source = player;
      session.engine.connectSource(player, 'mix');
      player.start();
    }
    ctx.onstatechange = () => handleContextState(session);
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    handleContextState(session);
    const khz = ctx.sampleRate / 1000;
    ui.sampleRate.textContent = `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
    updateLatency();
    session.timers.push(setInterval(updateLatency, 2000));
    if (mode === 'mic') { await refreshDevices(); syncChannelAvailability(); }
    syncTransport();
    startLoop();
  } catch (error) {
    if (!isCurrent(session)) return;
    stopSession(errorText(error), 'error');
  }
}

async function switchDevice(deviceId) {
  state.settings.deviceId = deviceId;
  save();
  const session = state.session;
  if (session?.mode !== 'mic') return;
  try {
    const stream = await requestStream(deviceId);
    if (!isCurrent(session)) { stream.getTracks().forEach(track => track.stop()); return; }
    session.stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
    session.stream = stream;
    watchTrack(session);
    session.source = session.ctx.createMediaStreamSource(stream);
    session.engine.connectSource(session.source, effectiveChannel(session));
    syncChannelAvailability();
    updateLatency();
    await refreshDevices();
    showMessage();
  } catch (error) {
    showMessage(errorText(error));
  }
}

// ---------- Wiring ----------

ui.startButton.addEventListener('click', () => startSession('mic'));
ui.demoButton.addEventListener('click', () => startSession('demo'));
ui.stopButton.addEventListener('click', () => stopSession('Stopped. The input is released and nothing was recorded.'));
ui.quickToggle.addEventListener('click', () => (state.session ? stopSession('Stopped. The input is released and nothing was recorded.') : startSession('mic')));
ui.resumeButton.addEventListener('click', () => state.session?.ctx?.resume().catch(() => {}));
ui.bypassButton.addEventListener('click', () => {
  state.bypass = !state.bypass;
  ui.bypassButton.setAttribute('aria-pressed', String(state.bypass));
  ui.bypassButton.textContent = state.bypass ? 'Bypassed · tap to restore' : 'Bypass all';
  ui.board.classList.toggle('bypassed', state.bypass);
  state.session?.engine?.setBypassAll(state.bypass);
});
ui.deviceSelect.addEventListener('change', () => switchDevice(ui.deviceSelect.value));
ui.channelSelect.addEventListener('change', () => {
  state.settings.channel = ui.channelSelect.value;
  save();
  state.session?.engine?.setChannel(effectiveChannel(state.session));
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (state.session?.mode === 'mic') refreshDevices(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.session) stopSession('Audio stopped because the page went to the background. Tap Start to play again.');
});
window.addEventListener('pagehide', () => { if (state.session) stopSession(); });
window.addEventListener('resize', () => { if (!state.session) drawIdle(); });

renderBoard();
renderPresets();
setupRackKnobs();
ui.channelSelect.value = state.settings.channel;
ui.gpuBadge.textContent = vis.mode === 'webgl2' ? 'GPU · WEBGL2' : 'CANVAS 2D';
ui.gpuBadge.title = vis.mode === 'webgl2' ? 'The visualizer is rendered on your GPU' : 'WebGL2 is unavailable; using Canvas 2D';
updateScopeColor();
setStatus('', 'OFF');
syncTransport();
drawIdle();
