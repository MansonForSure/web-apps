import { TapTempo } from './tap-tempo.js';
import { makeDemoBuffer } from './audio/demo.js';

const ids = ['statusDot', 'status', 'sessionTime', 'demoNotice', 'bpm', 'readingNote',
  'confidenceValue', 'confidenceBar', 'confidenceFill', 'confidenceNote', 'inputDb',
  'levelFill', 'activity', 'activityLabel', 'startButton', 'stopButton', 'demoButton',
  'demoAudioControl', 'demoAudio', 'controlNote', 'message', 'tapButton', 'tapBpm',
  'resetTap', 'tapNote'];
const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const adjustButtons = [...document.querySelectorAll('[data-multiplier]')];
const taps = new TapTempo();
const state = { session: null, estimate: null, multiplier: 1, activity: [], level: 0 };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showMessage(text = '') {
  ui.message.textContent = text;
  ui.message.hidden = !text;
}

function resetReading() {
  state.estimate = null;
  state.activity = [];
  state.level = 0;
  ui.bpm.textContent = '—';
  ui.confidenceValue.textContent = '—';
  ui.confidenceFill.style.width = '0%';
  ui.confidenceBar.setAttribute('aria-valuenow', '0');
  ui.confidenceNote.textContent = 'Waiting for a steady rhythm.';
  ui.levelFill.style.width = '0%';
  ui.inputDb.textContent = '— dB';
  ui.sessionTime.textContent = '00:00';
  adjustButtons.forEach(button => { button.disabled = true; });
}

function displayEstimate(result) {
  state.estimate = result;
  const reliable = Number.isFinite(result.bpm) && result.bpm > 0 && result.signal && result.confidence >= 0.2;
  ui.bpm.textContent = reliable ? String(Math.round(result.bpm * state.multiplier)) : '—';
  ui.bpm.setAttribute('aria-label', reliable ? `Estimated ${Math.round(result.bpm * state.multiplier)} beats per minute` : 'Waiting for a reliable tempo');
  const confidence = result.signal ? Math.round(Math.max(0, Math.min(1, result.confidence || 0)) * 100) : 0;
  ui.confidenceValue.textContent = `${confidence}%`;
  ui.confidenceFill.style.width = `${confidence}%`;
  ui.confidenceBar.setAttribute('aria-valuenow', String(confidence));
  ui.confidenceNote.textContent = confidence >= 75 ? 'A clear, consistent rhythmic pattern.' : confidence >= 45 ? 'A pattern is forming. Keep listening.' : 'No clear pulse yet. Try a steady section.';
  const prefix = state.session?.mode === 'demo' ? 'Synthetic demo · ' : '';
  ui.readingNote.textContent = !result.signal ? 'Waiting for music. Move closer to the sound.' : reliable ? `${prefix}${state.multiplier === 1 ? 'Live estimate · continuously updating' : `${state.multiplier === 0.5 ? 'Half-time' : 'Double-time'} interpretation · continuously updating`}` : 'Listening for a steady pulse… allow 6–15 seconds.';
  adjustButtons.forEach(button => { button.disabled = !reliable; });
}

function isCurrent(session) {
  return state.session === session;
}

function release(session) {
  if (!session || session.released) return;
  session.released = true;
  if (session.stream) session.stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
  if (session.worker) session.worker.terminate();
  if (session.node) {
    session.node.port.onmessage = null;
    session.node.disconnect();
  }
  if (session.source) {
    if (session.mode === 'demo') { try { session.source.stop(); } catch { /* Already stopped. */ } }
    session.source.disconnect();
  }
  session.monitor?.disconnect();
  if (session.context && session.context.state !== 'closed') session.context.close().catch(() => {});
}

function stopSession(note = 'Microphone is off. Your audio was not saved.') {
  const session = state.session;
  state.session = null;
  release(session);
  resetReading();
  ui.status.textContent = 'MICROPHONE OFF';
  ui.statusDot.className = 'status-dot';
  ui.startButton.hidden = false;
  ui.startButton.disabled = false;
  ui.stopButton.hidden = true;
  ui.demoButton.disabled = false;
  ui.demoNotice.hidden = true;
  ui.demoAudioControl.hidden = true;
  ui.demoAudio.checked = false;
  ui.activityLabel.textContent = 'LIVE INPUT · LAST 3 SECONDS';
  ui.controlNote.textContent = 'Allow your microphone when prompted.';
  ui.readingNote.textContent = note;
}

function errorText(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone access was blocked. Allow microphone access in your browser’s site settings, then try again. Open this page directly, not inside another app’s preview.';
  if (error?.name === 'NotFoundError') return 'No microphone was found. Connect or enable a microphone, then try again.';
  if (error?.name === 'NotReadableError') return 'Your microphone is unavailable. Close other apps using it, check your system microphone settings, then try again.';
  if (error?.name === 'OverconstrainedError') return 'The microphone could not use these audio settings. Try another microphone or browser.';
  return error?.message || 'Audio could not start. Refresh this page and try a recent version of Chrome, Edge, Firefox, or Safari.';
}

async function startSession(mode) {
  if (state.session) stopSession();
  showMessage();
  resetReading();
  state.multiplier = 1;
  adjustButtons.forEach(button => {
    const selected = Number(button.dataset.multiplier) === 1;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (!window.isSecureContext) {
    showMessage('Microphone audio needs a secure page. Open the HTTPS GitHub Pages link, or run the app on localhost.');
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.AudioWorkletNode || !window.Worker) {
    showMessage('This browser does not support the audio tools needed here. Try a recent Chrome, Edge, Firefox, or Safari browser.');
    return;
  }
  if (mode === 'microphone' && !navigator.mediaDevices?.getUserMedia) {
    showMessage('Microphone access is not available. Open the HTTPS site directly in your browser.');
    return;
  }
  const session = { mode, context: null, stream: null, source: null, node: null, worker: null, released: false };
  state.session = session;
  ui.startButton.hidden = true;
  ui.stopButton.hidden = false;
  ui.demoButton.disabled = true;
  ui.status.textContent = mode === 'demo' ? 'PREPARING DEMO' : 'WAITING FOR PERMISSION';
  ui.readingNote.textContent = mode === 'demo' ? 'Preparing a synthetic 120 BPM rhythm…' : 'Allow microphone access to begin.';
  ui.controlNote.textContent = 'You can stop at any time.';
  try {
    session.context = new AudioContextClass({ latencyHint: 'interactive' });
    await session.context.resume();
    if (!isCurrent(session)) return;
    if (mode === 'microphone') {
      // Preferences, not mandatory constraints: supported browsers may ignore them.
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
        channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false
      } });
      if (!isCurrent(session)) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      stream.getAudioTracks().forEach(track => { track.onended = () => {
        if (isCurrent(session)) { stopSession(); showMessage('The microphone disconnected. Reconnect it and start listening again.'); }
      }; });
    }
    if (!session.context.audioWorklet) throw new Error('AudioWorklet is unavailable. Use a recent browser and open this page directly.');
    await session.context.audioWorklet.addModule(new URL('./audio/worklet.js', import.meta.url));
    if (!isCurrent(session)) return;
    session.worker = new Worker(new URL('./audio/tempo-worker.js', import.meta.url), { type: 'module' });
    session.worker.onmessage = event => {
      if (isCurrent(session) && event.data.type === 'estimate') displayEstimate(event.data);
    };
    const fail = () => {
      if (isCurrent(session)) { stopSession(); showMessage('The audio processor stopped unexpectedly. Refresh this page and try again.'); }
    };
    session.worker.onerror = fail;
    session.node = new AudioWorkletNode(session.context, 'bpm-input', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    session.node.onprocessorerror = fail;
    session.node.port.onmessage = event => {
      if (!isCurrent(session) || event.data.type !== 'features') return;
      const frames = event.data.frames;
      if (!frames?.length) return;
      session.worker.postMessage({ type: 'features', frames });
      state.activity.push(...frames);
      const last = frames[frames.length - 1];
      state.activity = state.activity.filter(frame => frame.time >= last.time - 3);
      const rms = Math.max(...frames.map(frame => frame.rms));
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      state.level = Math.max(0, Math.min(100, (db + 65) / 65 * 100));
      ui.levelFill.style.width = `${state.level}%`;
      ui.inputDb.textContent = `${Math.max(-90, Math.round(db))} dB`;
      const seconds = Math.floor(last.time);
      ui.sessionTime.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };
    // The processor outputs only zeros. This connection keeps it active without monitoring the microphone.
    session.node.connect(session.context.destination);
    if (mode === 'microphone') session.source = session.context.createMediaStreamSource(session.stream);
    else {
      session.source = session.context.createBufferSource();
      session.source.buffer = makeDemoBuffer(session.context);
      session.source.loop = true;
      session.monitor = session.context.createGain();
      session.monitor.gain.value = 0;
      session.source.connect(session.monitor).connect(session.context.destination);
    }
    session.source.connect(session.node);
    if (mode === 'demo') session.source.start();
    ui.status.textContent = mode === 'demo' ? 'SYNTHETIC DEMO' : 'LISTENING LIVE';
    ui.statusDot.className = `status-dot ${mode === 'demo' ? 'demo' : 'active'}`;
    ui.demoNotice.hidden = mode !== 'demo';
    ui.demoAudioControl.hidden = mode !== 'demo';
    ui.activityLabel.textContent = mode === 'demo' ? 'SYNTHETIC AUDIO · NOT YOUR MICROPHONE' : 'LIVE INPUT · LAST 3 SECONDS';
    ui.controlNote.textContent = mode === 'demo' ? 'Demo runs through the real audio detector.' : 'Listening locally · nothing is recorded.';
    ui.readingNote.textContent = 'Listening for a steady pulse… allow 6–15 seconds.';
  } catch (error) {
    if (isCurrent(session)) { stopSession(); showMessage(errorText(error)); }
    else release(session);
  }
}

function tapBeat() {
  const result = taps.tap(performance.now());
  ui.tapBpm.textContent = result.bpm ? String(Math.round(result.bpm)) : '—';
  ui.tapNote.textContent = result.bpm ? `${result.count} taps · manual estimate, separate from the microphone.` : 'Keep tapping with the beat. At least 3 taps needed.';
  ui.tapButton.classList.add('flash');
  setTimeout(() => ui.tapButton.classList.remove('flash'), 110);
}

ui.startButton.addEventListener('click', () => startSession('microphone'));
ui.demoButton.addEventListener('click', () => startSession('demo'));
ui.stopButton.addEventListener('click', () => { stopSession(); showMessage(); });
ui.demoAudio.addEventListener('change', () => {
  const session = state.session;
  if (session?.monitor) session.monitor.gain.setTargetAtTime(ui.demoAudio.checked ? 0.35 : 0, session.context.currentTime, 0.02);
});
ui.tapButton.addEventListener('click', tapBeat);
ui.resetTap.addEventListener('click', () => {
  taps.reset(); ui.tapBpm.textContent = '—'; ui.tapNote.textContent = 'Tap at least 3 times. Keyboard T works too.';
});
window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 't' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
    event.preventDefault(); tapBeat();
  }
});
adjustButtons.forEach(button => button.addEventListener('click', () => {
  state.multiplier = Number(button.dataset.multiplier);
  adjustButtons.forEach(item => {
    const selected = item === button;
    item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
  });
  if (state.estimate) displayEstimate(state.estimate);
}));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.session) stopSession('Listening paused because you left the tab. Tap Start to resume.');
});
window.addEventListener('pagehide', () => stopSession());

const ctx = ui.activity.getContext('2d');
function drawActivity() {
  if (ctx) {
    const width = ui.activity.clientWidth;
    const height = ui.activity.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (ui.activity.width !== Math.round(width * dpr) || ui.activity.height !== Math.round(height * dpr)) {
      ui.activity.width = Math.round(width * dpr); ui.activity.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#30362c'; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(part => { ctx.beginPath(); ctx.moveTo(width * part, 0); ctx.lineTo(width * part, height); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
    const frames = state.activity;
    if (frames.length) {
      const now = frames[frames.length - 1].time;
      const maxOnset = Math.max(0.001, ...frames.map(frame => frame.onset));
      ctx.fillStyle = '#edc16b';
      frames.forEach(frame => {
        const x = (frame.time - now + 3) / 3 * width;
        const amplitude = Math.min(1, Math.max(frame.onset / maxOnset * 0.8, Math.sqrt(frame.rms) * 0.5));
        const bar = Math.max(1, amplitude * height * 0.8);
        ctx.fillRect(x, (height - bar) / 2, Math.max(1, width / 330), bar);
      });
    }
  }
  if (!reducedMotion) requestAnimationFrame(drawActivity);
}
if (reducedMotion) setInterval(drawActivity, 150);
else requestAnimationFrame(drawActivity);
resetReading();
