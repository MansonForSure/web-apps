import { PitchDetector } from 'pitchy';

export const FRAME_SIZE = 4096;
export const IN_TUNE_CENTS = 5;
export const STRINGS = Object.freeze([
  { number: 6, note: 'E', octave: 2, midi: 40 },
  { number: 5, note: 'A', octave: 2, midi: 45 },
  { number: 4, note: 'D', octave: 3, midi: 50 },
  { number: 3, note: 'G', octave: 3, midi: 55 },
  { number: 2, note: 'B', octave: 3, midi: 59 },
  { number: 1, note: 'E', octave: 4, midi: 64 },
]);

export function frequencyForMidi(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function centsBetween(frequency, target) {
  if (!(frequency > 0) || !(target > 0)) return null;
  return 1200 * Math.log2(frequency / target);
}

export function chooseTarget(frequency, selectedNumber = null) {
  if (selectedNumber !== null) {
    return STRINGS.find((string) => string.number === selectedNumber) ?? STRINGS[0];
  }
  if (!(frequency > 0)) return STRINGS[0];
  return STRINGS.reduce((best, string) => {
    const deviation = Math.abs(centsBetween(frequency, frequencyForMidi(string.midi)));
    const bestDeviation = Math.abs(centsBetween(frequency, frequencyForMidi(best.midi)));
    return deviation < bestDeviation ? string : best;
  }, STRINGS[0]);
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
}

export class GuitarPitchDetector {
  constructor(size = FRAME_SIZE) {
    this.size = size;
    this.buffer = new Float32Array(size);
    this.detector = PitchDetector.forFloat32Array(size);
  }

  analyse(input, sampleRate) {
    if (input.length !== this.size) throw new RangeError('Unexpected audio frame size');
    if (!(sampleRate > 0)) throw new RangeError('A positive sample rate is required');
    let mean = 0;
    for (let index = 0; index < this.size; index += 1) mean += input[index];
    mean /= this.size;
    let power = 0;
    for (let index = 0; index < this.size; index += 1) {
      const value = input[index] - mean;
      this.buffer[index] = value;
      power += value * value;
    }
    const rms = Math.sqrt(power / this.size);
    if (rms < 0.004) return { frequency: null, clarity: 0, rms };
    const [frequency, clarity] = this.detector.findPitch(this.buffer, sampleRate);
    if (!Number.isFinite(frequency) || frequency < 55 || frequency > 1000 || clarity < 0.9) {
      return { frequency: null, clarity, rms };
    }
    return { frequency, clarity, rms };
  }
}

// Used only by the explicitly labelled demo and deterministic tests.
export function guitarSignal(frequency, sampleRate, options = {}) {
  const { size = FRAME_SIZE, offset = 0, amplitude = 0.23, harmonics = true, noise = 0 } = options;
  const result = new Float32Array(size);
  let seed = 127;
  for (let index = 0; index < size; index += 1) {
    const phase = (2 * Math.PI * frequency * (index + offset)) / sampleRate;
    const upper = harmonics ? 0.45 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase) : 0;
    seed = (1664525 * seed + 1013904223) >>> 0;
    const random = (seed / 4294967296) * 2 - 1;
    result[index] = amplitude * (Math.sin(phase) + upper) + noise * random;
  }
  return result;
}
