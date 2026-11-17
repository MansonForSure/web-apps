// Pure DSP helpers shared by the audio graph and the tests. No browser APIs here.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const dbToGain = db => 10 ** (db / 20);
export const gainToDb = gain => 20 * Math.log10(Math.max(gain, 1e-12));

/** Map a 0–1 knob position onto a parameter range (linear or logarithmic). */
export function fromUnit(t, { min, max, scale = 'lin' }) {
  const u = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  return scale === 'log' ? min * (max / min) ** u : min + (max - min) * u;
}

/** Inverse of fromUnit: parameter value to a 0–1 knob position. */
export function toUnit(value, { min, max, scale = 'lin' }) {
  const v = clamp(Number.isFinite(value) ? value : min, min, max);
  return scale === 'log' ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
}

// The waveshaper curve spans x ∈ [-1, 1], representing a signal of x × DRIVE_DOMAIN.
// Drive is then a smooth pre-gain of (driveGain / DRIVE_DOMAIN), so turning the
// Drive knob never has to rebuild the curve while audio is running.
export const DRIVE_DOMAIN = 64;
export const DRIVE_MODES = ['overdrive', 'distortion', 'fuzz'];
const DRIVE_GAIN = { overdrive: [1, 40], distortion: [3, 160], fuzz: [12, 480] };

export function driveGain(mode, drive) {
  const [lo, hi] = DRIVE_GAIN[mode] ?? DRIVE_GAIN.overdrive;
  return lo * (hi / lo) ** clamp(drive / 10, 0, 1);
}

function shape(mode, u) {
  if (mode === 'distortion') return u / (1 + Math.abs(u) ** 2.5) ** 0.4; // firm knee, symmetric
  if (mode === 'fuzz') return u >= 0 ? 1 - Math.exp(-3 * u) : -0.82 * (1 - Math.exp(2.2 * u)); // asymmetric, gated feel
  return Math.tanh(u + 0.18) - Math.tanh(0.18); // overdrive: soft, slightly asymmetric (even harmonics)
}

const SHAPE_PEAK = Object.fromEntries(DRIVE_MODES.map(mode => [mode,
  Math.max(Math.abs(shape(mode, DRIVE_DOMAIN)), Math.abs(shape(mode, -DRIVE_DOMAIN)))]));

/** Normalized transfer function (peak magnitude 1, f(0) = 0). */
export function driveTransfer(mode, u) {
  const key = DRIVE_MODES.includes(mode) ? mode : 'overdrive';
  return shape(key, clamp(u, -DRIVE_DOMAIN, DRIVE_DOMAIN)) / SHAPE_PEAK[key];
}

export function makeDriveCurve(mode, length = 8193) {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) curve[i] = driveTransfer(mode, ((i / (length - 1)) * 2 - 1) * DRIVE_DOMAIN);
  return curve;
}

/**
 * Output makeup gain that keeps a typical guitar peak (≈ -18 dBFS) at a similar
 * loudness whatever the drive amount, so engaging the pedal does not jump in volume.
 */
export function driveMakeup(mode, gain, reference = 0.12) {
  const u = reference * gain;
  const out = (Math.abs(driveTransfer(mode, u)) + Math.abs(driveTransfer(mode, -u))) / 2;
  const slope = (Math.abs(driveTransfer(mode, 1e-4)) + Math.abs(driveTransfer(mode, -1e-4))) / 2e-4;
  const saturation = clamp(1 - out / Math.max(u * slope, 1e-9), 0, 1);
  return (reference / Math.max(out, 1e-6)) * (1 - 0.55 * saturation);
}

/** Small deterministic PRNG so impulse responses and demo audio are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic stereo room impulse response: early reflections plus exponentially
 * decaying noise that darkens over time. decaySeconds is the RT60 (-60 dB) time.
 */
export function makeReverbImpulse(sampleRate, decaySeconds, { seed = 2024, channels = 2 } = {}) {
  const decay = clamp(decaySeconds, 0.1, 12);
  const preDelay = Math.min(0.024, 0.006 + decay * 0.004);
  const start = Math.floor(preDelay * sampleRate);
  const length = Math.ceil((preDelay + decay * 1.05) * sampleRate);
  const fade = Math.max(1, Math.floor(0.004 * sampleRate));
  const result = [];
  for (let c = 0; c < channels; c++) {
    const rand = mulberry32(seed + c * 7919);
    const data = new Float32Array(length);
    let lp = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / sampleRate;
      const env = Math.exp((-6.907755 * t) / decay);
      const damp = 0.86 - 0.72 * Math.min(1, t / decay);
      lp += damp * (rand() * 2 - 1 - lp);
      data[i] = lp * env * Math.min(1, (i - start) / fade);
    }
    for (let r = 0; r < 7; r++) {
      const at = start + Math.floor((0.003 + rand() * 0.028) * sampleRate);
      if (at < length) data[at] += (rand() > 0.5 ? 1 : -1) * (0.5 - r * 0.05);
    }
    result.push(data);
  }
  return result;
}

/** Peak and RMS level of a block, ignoring non-finite samples. */
export function blockLevel(samples) {
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) continue;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
    count++;
  }
  return { peak, rms: count ? Math.sqrt(sum / count) : 0 };
}
