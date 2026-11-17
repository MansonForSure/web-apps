import { mulberry32 } from './dsp.js';

// A synthetic, clearly labeled demo "guitar DI" signal: Karplus–Strong plucked
// strings playing a short E-minor riff. It is generated locally, never recorded.

export const DEMO_BPM = 104;
const BEATS = 16;

// [start beat, MIDI notes, length in beats, velocity, palm-muted]
const RIFF = [
  [0, [40, 47, 52], 0.9, 1, false],
  [1, [40], 0.4, 0.7, true], [1.5, [40], 0.4, 0.7, true],
  [2, [43, 50, 55], 0.45, 0.9, false], [2.5, [45, 52, 57], 1.4, 1, false],
  [4, [52], 0.45, 0.8, false], [4.5, [55], 0.45, 0.8, false], [5, [57], 0.45, 0.85, false],
  [5.5, [59], 0.45, 0.85, false], [6, [62], 0.45, 0.9, false], [6.5, [64], 1, 1, false], [7.5, [62], 0.45, 0.8, false],
  [8, [40, 47, 52], 0.9, 1, false],
  [9, [40], 0.4, 0.7, true], [9.5, [40], 0.4, 0.7, true],
  [10, [43, 50, 55], 0.45, 0.9, false], [10.5, [45, 52, 57], 1.4, 1, false],
  [12, [50, 57, 62], 1.4, 1, false], [13.5, [48, 55, 60], 0.45, 0.9, false],
  [14, [47, 54, 59], 1.9, 1, false],
];

const midiToHz = midi => 440 * 2 ** ((midi - 69) / 12);

function pluck(out, sampleRate, startSample, freq, lengthSec, velocity, muted, rand) {
  const period = Math.max(2, Math.round(sampleRate / freq - 0.5));
  const ring = new Float32Array(period);
  let lp = 0;
  const brightness = muted ? 0.25 : 0.45 + 0.4 * velocity;
  for (let i = 0; i < period; i++) { lp += brightness * (rand() * 2 - 1 - lp); ring[i] = lp; }
  const sustain = muted ? 0.18 : 2.6;
  const ringDecay = 10 ** (-3 / (sustain * freq));
  const damped = 10 ** (-3 / (0.07 * freq));
  const held = Math.floor(lengthSec * sampleRate);
  const total = held + Math.floor((muted ? 0.05 : 0.12) * sampleRate);
  const amp = 0.22 * velocity;
  let index = 0;
  let previous = 0;
  for (let n = 0; n < total; n++) {
    const current = ring[index];
    const decay = n < held ? ringDecay : damped;
    ring[index] = decay * 0.5 * (current + previous);
    previous = current;
    out[(startSample + n) % out.length] += current * amp;
    index = (index + 1) % period;
  }
}

/** Render one seamless loop at the given sample rate. Returns mono samples. */
export function makeDemoRiff(sampleRate, { seed = 7, peak = 0.35 } = {}) {
  const beat = 60 / DEMO_BPM;
  const out = new Float32Array(Math.round(BEATS * beat * sampleRate));
  const rand = mulberry32(seed);
  for (const [at, notes, length, velocity, muted] of RIFF) {
    notes.forEach((midi, i) => {
      const start = Math.round((at * beat + i * 0.011) * sampleRate);
      pluck(out, sampleRate, start, midiToHz(midi), length * beat, velocity * (1 - i * 0.08), muted, rand);
    });
  }
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / max;
  return out;
}
