// Shared Web Audio helpers. On iOS, an AudioContext must be created or resumed
// inside a tap, so call getAudioContext() at the start of a click handler.

let context = null;

export function hasAudioSession() {
  return typeof navigator !== 'undefined' && 'audioSession' in navigator;
}

// "playback" lets Web Audio play even when the iPhone is in Silent mode.
export function setAudioSession(type) {
  try {
    if (hasAudioSession() && navigator.audioSession.type !== type) navigator.audioSession.type = type;
  } catch {
    // Older Safari versions ignore this.
  }
}

export function getAudioContext() {
  const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtor) return Promise.reject(new Error('This browser can’t play test sounds.'));
  if (!context || context.state === 'closed') context = new AudioCtor();
  const ready = context.state === 'running' ? Promise.resolve() : context.resume().catch(() => {});
  return ready.then(() => context);
}

function createPan(ctx, pan) {
  if (typeof ctx.createStereoPanner === 'function') {
    const node = ctx.createStereoPanner();
    node.pan.value = pan;
    return { input: node, output: node };
  }
  const input = ctx.createGain();
  const left = ctx.createGain();
  const right = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  left.gain.value = pan <= 0 ? 1 : 1 - pan;
  right.gain.value = pan >= 0 ? 1 : 1 + pan;
  input.connect(left);
  input.connect(right);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  return { input, output: merger };
}

// A bright four-note chime, played twice, panned left (-1), centre (0) or right (1).
export function playChime(ctx, { pan = 0, volume = 0.55 } = {}) {
  const start = ctx.currentTime + 0.04;
  const out = ctx.createGain();
  out.gain.value = volume;
  const panner = createPan(ctx, pan);
  out.connect(panner.input);
  panner.output.connect(ctx.destination);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const sources = [];
  for (let repeat = 0; repeat < 2; repeat += 1) {
    notes.forEach((frequency, index) => {
      const time = start + repeat * 1.0 + index * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.9, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 0.55);
      sources.push(osc);
    });
  }
  const end = start + 1.0 + notes.length * 0.16 + 0.55;
  return {
    end,
    stop() {
      sources.forEach((osc) => { try { osc.stop(); } catch { /* already stopped */ } });
      try { out.disconnect(); } catch { /* ignore */ }
    },
  };
}

// A tone gliding from deep bass to a high whistle. Rattles show up as buzzing.
export function playSweep(ctx, { from = 100, to = 12000, duration = 7, volume = 0.22 } = {}) {
  const start = ctx.currentTime + 0.05;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.3);
  gain.gain.setValueAtTime(volume, start + duration - 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  return {
    start,
    end: start + duration,
    from,
    to,
    duration,
    frequencyAt(time) {
      const t = Math.min(1, Math.max(0, (time - start) / duration));
      return from * (to / from) ** t;
    },
    stop() {
      try { osc.stop(); } catch { /* already stopped */ }
      try { gain.disconnect(); } catch { /* ignore */ }
    },
  };
}
