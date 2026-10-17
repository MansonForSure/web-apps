import { FRAME_SIZE, IN_TUNE_CENTS, STRINGS, GuitarPitchDetector, centsBetween, chooseTarget, frequencyForMidi, guitarSignal, median } from './tuner.js';

const element = (id) => document.getElementById(id);
const detector = new GuitarPitchDetector();
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const ui = {
  note: element('note'), octave: element('octave'), frequency: element('frequency'),
  cents: element('cents'), status: element('status'), caption: element('reading-caption'),
  target: element('target-label'), meter: element('meter'), needle: element('needle'),
  microphone: element('microphone-button'), microphoneLabel: element('microphone-label'),
  demo: element('demo-button'), auto: element('auto-button'), strings: element('strings'),
  source: element('source-label'), level: element('signal-level'), levelLabel: element('signal-label'),
  reference: element('reference-button'), referenceLabel: element('reference-label'),
};

let mode = 'idle';
let selectedNumber = null;
let currentTarget = STRINGS[0];
let requestId = 0;
let animationFrame = null;
let referenceTimer = null;
let microphoneStream = null;
let audioContext = null;
let sourceNode = null;
let analyser = null;
let lastTick = 0;
let lastGood = 0;
let history = [];
let historyTarget = null;
let stringButtons = [];

const labels = { 6: 'Low E', 5: 'A', 4: 'D', 3: 'G', 2: 'B', 1: 'High E' };

function status(message, tuning = 'waiting') {
  if (ui.status.textContent !== message) ui.status.textContent = message;
  document.body.dataset.tuning = tuning;
}

function updateButtons() {
  ui.microphoneLabel.textContent = mode === 'microphone' ? 'Stop listening' : mode === 'permission' ? 'Cancel microphone' : 'Start tuning';
  ui.demo.innerHTML = mode === 'demo' ? 'Stop demo<span aria-hidden="true">×</span>' : 'Try demo<span aria-hidden="true">↗</span>';
  ui.auto.setAttribute('aria-pressed', String(selectedNumber === null));
  for (const { button, string } of stringButtons) {
    button.setAttribute('aria-pressed', String(selectedNumber === string.number));
  }
  ui.referenceLabel.textContent = mode === 'reference' ? 'Stop reference tone' : `Hear ${currentTarget.note}${currentTarget.octave} reference`;
}

function setMode(nextMode) {
  mode = nextMode;
  document.body.dataset.mode = mode;
  const descriptions = {
    idle: 'MICROPHONE OFF', permission: 'WAITING FOR PERMISSION',
    microphone: 'LIVE MICROPHONE', demo: 'DEMO · SIMULATED INPUT', reference: 'REFERENCE TONE',
  };
  ui.source.textContent = descriptions[mode];
  updateButtons();
}

function resetReadout() {
  ui.note.textContent = '—';
  ui.octave.textContent = '';
  ui.frequency.textContent = '—';
  ui.cents.textContent = '—';
  ui.needle.style.left = '50%';
  ui.needle.style.opacity = '.35';
  ui.meter.setAttribute('aria-label', 'Tuning meter, waiting for a note');
  ui.caption.textContent = mode === 'demo' ? 'SIMULATED GUITAR SIGNAL' : 'PLUCK A STRING TO BEGIN';
  const target = selectedNumber === null ? null : chooseTarget(0, selectedNumber);
  ui.target.textContent = target ? `Target: ${target.note}${target.octave} · ${frequencyForMidi(target.midi).toFixed(2)} Hz` : 'Automatic string detection';
  for (const { button } of stringButtons) button.classList.remove('detected');
}

function releaseAudio() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (referenceTimer !== null) clearTimeout(referenceTimer);
  referenceTimer = null;
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch { /* Already disconnected. */ }
  }
  sourceNode = null;
  analyser = null;
  const previous = audioContext;
  audioContext = null;
  if (previous && previous.state !== 'closed') previous.close().catch(() => {});
}

function stop(message = 'Microphone off. Your audio stays with you.') {
  requestId += 1;
  releaseAudio();
  history = [];
  historyTarget = null;
  lastGood = 0;
  ui.level.style.width = '0%';
  ui.levelLabel.textContent = 'NO INPUT';
  setMode('idle');
  resetReadout();
  status(message);
}

function microphoneError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Microphone access was denied. Allow it in your browser’s website settings, then try again.';
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'No microphone found. Connect one, or try the demo and reference tones.';
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'The microphone is busy or unavailable. Close other recording apps, then try again.';
  }
  if (error.name === 'SecurityError') return 'This browser is blocking the microphone. Open the HTTPS link in your main browser.';
  return 'Could not start the microphone. Check browser permissions, or try demo mode.';
}

function showReading(result, now) {
  const signalPercent = Math.max(0, Math.min(100, result.rms * 360));
  ui.level.style.width = `${signalPercent.toFixed(1)}%`;
  ui.levelLabel.textContent = result.rms < 0.004 ? 'TOO QUIET' : 'SIGNAL';
  if (!result.frequency) {
    if (now - lastGood > 450) {
      history = [];
      historyTarget = null;
      resetReadout();
      status(result.rms < 0.004 ? 'Listening… pluck one string gently.' : 'Let one string ring. Mute the others for a clearer note.');
    }
    return;
  }
  lastGood = now;
  const target = chooseTarget(result.frequency, selectedNumber);
  if (historyTarget !== target.number) {
    history = [];
    historyTarget = target.number;
  }
  history.push(result.frequency);
  if (history.length > 5) history.shift();
  const measured = median(history);
  const desired = frequencyForMidi(target.midi);
  const cents = centsBetween(measured, desired);
  currentTarget = target;
  ui.note.textContent = target.note;
  ui.octave.textContent = String(target.octave);
  ui.frequency.textContent = measured.toFixed(1);
  ui.cents.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(1)}`;
  ui.caption.textContent = mode === 'demo' ? 'SIMULATED GUITAR SIGNAL' : `STRING ${target.number} · ${labels[target.number].toUpperCase()}`;
  ui.target.textContent = `Target ${target.note}${target.octave} · ${desired.toFixed(2)} Hz`;
  ui.needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
  ui.needle.style.opacity = '1';
  ui.meter.setAttribute('aria-label', `${target.note}${target.octave}, ${Math.abs(cents).toFixed(1)} cents ${cents < 0 ? 'flat' : 'sharp'}`);
  for (const { button, string } of stringButtons) button.classList.toggle('detected', string.number === target.number);
  updateButtons();
  if (Math.abs(cents) <= IN_TUNE_CENTS) {
    status(mode === 'demo' ? 'In tune · simulated input.' : 'In tune. Back to playing.', 'tuned');
  } else if (Math.abs(cents) > 160) {
    status('Far from this target. Check your selected string and adjust carefully.', cents < 0 ? 'flat' : 'sharp');
  } else {
    const advice = cents < 0 ? 'A little low. Tune up gently.' : 'A little high. Tune down gently.';
    status(mode === 'demo' ? `${advice} · Demo` : advice, cents < 0 ? 'flat' : 'sharp');
  }
}

async function startMicrophone() {
  stop('Requesting microphone access…');
  if (!window.isSecureContext) {
    status('Microphone tuning needs HTTPS. Open the published link, or use localhost.', 'error');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
    status('This browser cannot access a microphone. Open the link in a modern browser, or try the demo.', 'error');
    return;
  }
  const id = requestId;
  setMode('permission');
  status('Allow microphone access when your browser asks.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    if (id !== requestId || document.hidden) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    microphoneStream = stream;
    const context = new AudioContextClass();
    audioContext = context;
    await context.resume();
    if (id !== requestId) return;
    analyser = context.createAnalyser();
    analyser.fftSize = FRAME_SIZE;
    sourceNode = context.createMediaStreamSource(stream);
    sourceNode.connect(analyser); // Do not connect to speakers: no microphone monitoring.
    const samples = new Float32Array(FRAME_SIZE);
    setMode('microphone');
    status('Listening… pluck one string gently.');
    lastTick = 0;
    lastGood = performance.now();
    stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
      if (requestId === id && mode === 'microphone') stop('Microphone disconnected. Reconnect it and start again.');
    }));
    const tick = (now) => {
      if (requestId !== id || mode !== 'microphone') return;
      if (now - lastTick >= 70) {
        lastTick = now;
        analyser.getFloatTimeDomainData(samples);
        showReading(detector.analyse(samples, context.sampleRate), now);
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
  } catch (error) {
    if (id !== requestId) return;
    stop();
    status(microphoneError(error), 'error');
  }
}

function startDemo() {
  stop('Demo mode uses a generated signal, not your microphone.');
  const id = requestId;
  setMode('demo');
  const started = performance.now();
  let offset = 0;
  lastTick = 0;
  ui.caption.textContent = 'SIMULATED GUITAR SIGNAL';
  const tick = (now) => {
    if (requestId !== id || mode !== 'demo') return;
    if (now - lastTick >= 90) {
      lastTick = now;
      // A frame timestamp may precede the click's performance.now(), especially in an iframe.
      const elapsed = Math.max(0, now - started);
      const target = selectedNumber === null ? STRINGS[Math.floor(elapsed / 6000) % STRINGS.length] : chooseTarget(0, selectedNumber);
      const phase = elapsed % 6000;
      const detuning = phase < 2000 ? -16 : phase < 4000 ? 14 : 0.8;
      const frequency = frequencyForMidi(target.midi) * 2 ** (detuning / 1200);
      const samples = guitarSignal(frequency, 44100, { offset, noise: 0.0006 });
      offset += FRAME_SIZE;
      showReading(detector.analyse(samples, 44100), now);
    }
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

async function playReference() {
  if (mode === 'reference') {
    stop('Reference tone stopped.');
    return;
  }
  const target = chooseTarget(frequencyForMidi(currentTarget.midi), selectedNumber);
  stop('Playing a reference tone. The microphone is off.');
  currentTarget = target;
  if (!AudioContextClass) {
    status('Reference tones are not supported by this browser.', 'error');
    return;
  }
  const id = requestId;
  try {
    const context = new AudioContextClass();
    audioContext = context;
    await context.resume();
    if (requestId !== id) return;
    setMode('reference');
    status(`Hear ${target.note}${target.octave} at ${frequencyForMidi(target.midi).toFixed(2)} Hz. Microphone off.`);
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.11, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.9);
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequencyForMidi(target.midi);
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + 3);
    updateButtons();
    referenceTimer = setTimeout(() => {
      if (requestId === id) stop('Reference finished. Start tuning when you are ready.');
    }, 3100);
  } catch {
    if (requestId === id) {
      stop();
      status('Could not play the tone. Check this browser’s audio settings.', 'error');
    }
  }
}

function selectString(number) {
  if (mode === 'reference') stop('Reference tone stopped.');
  selectedNumber = number;
  history = [];
  historyTarget = null;
  if (number !== null) currentTarget = chooseTarget(0, number);
  resetReadout();
  updateButtons();
  if (mode === 'idle') status(number === null ? 'Automatic selection. Start tuning when you are ready.' : `${labels[number]} selected. Start tuning or hear the reference.`);
}

function createStringButtons() {
  stringButtons = STRINGS.map((string) => {
    const button = document.createElement('button');
    button.className = 'string-button';
    button.setAttribute('aria-label', `String ${string.number}, ${labels[string.number]}, ${string.note}${string.octave}, ${frequencyForMidi(string.midi).toFixed(2)} hertz`);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="string-number">${string.number}</span><span class="string-note">${string.note}<span class="string-octave">${string.octave}</span></span><span class="string-frequency">${frequencyForMidi(string.midi).toFixed(2)}</span>`;
    button.addEventListener('click', () => selectString(string.number));
    ui.strings.append(button);
    return { button, string };
  });
}

createStringButtons();
ui.microphone.addEventListener('click', () => {
  if (mode === 'microphone' || mode === 'permission') stop();
  else startMicrophone();
});
ui.demo.addEventListener('click', () => mode === 'demo' ? stop('Demo stopped. The microphone was never used.') : startDemo());
ui.auto.addEventListener('click', () => selectString(null));
ui.reference.addEventListener('click', playReference);
window.addEventListener('pagehide', () => stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode !== 'idle') stop('Paused while the page was hidden. Start again when you are ready.');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mode !== 'idle') stop();
});
setMode('idle');
resetReadout();
status('Ready when you are.');
