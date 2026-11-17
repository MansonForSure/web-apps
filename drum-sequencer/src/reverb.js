// Generates a natural-sounding stereo room impulse response for the ambience
// send: sparse early reflections, a diffuse tail, and frequency-dependent
// damping (highs decay faster than lows, as in a real room).

import { makeRng } from "./patterns.js";

export function createRoomImpulse(ctx, { seconds = 1.7, rt60 = 1.05, seed = 7 } = {}) {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const buffer = ctx.createBuffer(2, len, sr);
  const rng = makeRng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // diffuse tail
    const onset = Math.floor(0.011 * sr);
    const ramp = Math.floor(0.025 * sr);
    let lp = 0;
    for (let i = onset; i < len; i++) {
      const t = i / sr;
      const env = Math.exp((-6.91 * t) / rt60) * Math.min(1, (i - onset) / ramp);
      const noise = rng() * 2 - 1;
      // damping: cutoff glides from ~9 kHz down to ~1.4 kHz
      const fc = 1400 + 7600 * Math.exp(-t / 0.32);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += a * (noise - lp);
      data[i] = lp * env;
    }
    // early reflections (different per channel for width)
    const taps = 12;
    for (let k = 0; k < taps; k++) {
      const t = 0.006 + rng() * 0.055;
      const idx = Math.floor(t * sr);
      const g = (0.55 - (t / 0.065) * 0.35) * (rng() < 0.5 ? -1 : 1);
      for (let j = 0; j < 24 && idx + j < len; j++) {
        data[idx + j] += g * Math.exp(-j / 5) * 0.6;
      }
    }
  }
  // normalise energy so the send level is predictable
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) energy += d[i] * d[i];
  }
  const norm = 1 / Math.sqrt(energy / 2 / (sr * 0.12));
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= norm * 0.18;
  }
  return buffer;
}
