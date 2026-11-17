import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal AudioWorkletGlobalScope so the real processors can run in Node.
const registry = new Map();
globalThis.AudioWorkletProcessor = class {};
globalThis.registerProcessor = (name, processor) => registry.set(name, processor);
globalThis.sampleRate = 48000;
await import('../audio/worklet.js');

const RATE = 48000;
const sine = (freq, amp, seconds) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / RATE));
const peakOf = (data, from = 0, to = data.length) => { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(data[i])); return p; };

function run(name, signal, values = {}, channels = 1) {
  const Processor = registry.get(name);
  const processor = new Processor();
  const params = Object.fromEntries(Processor.parameterDescriptors.map(d => [d.name, new Float32Array([values[d.name] ?? d.defaultValue])]));
  const out = new Float32Array(signal.length);
  for (let offset = 0; offset < signal.length; offset += 128) {
    const block = new Float32Array(128);
    block.set(signal.subarray(offset, offset + 128));
    const input = Array.from({ length: channels }, () => block.slice());
    const output = Array.from({ length: channels }, () => new Float32Array(128));
    assert.equal(processor.process([input], [output], params), true);
    out.set(output[0].subarray(0, Math.min(128, signal.length - offset)), offset);
  }
  return out;
}

test('all four processors register', () => {
  for (const name of ['stompbox-gate', 'stompbox-comp', 'stompbox-wah', 'stompbox-limiter']) assert.ok(registry.has(name), name);
});

test('noise gate mutes hiss below threshold and passes notes above it', () => {
  const hiss = sine(3000, 0.0005, 0.5); // about -66 dBFS
  assert.ok(peakOf(run('stompbox-gate', hiss, { threshold: -50 }), RATE * 0.1) < 1e-4);
  const note = sine(196, 0.2, 0.5);
  const passed = run('stompbox-gate', note, { threshold: -50 });
  assert.ok(peakOf(passed, RATE * 0.05) > 0.19);
});

test('compressor reduces loud peaks according to ratio and adds makeup gain', () => {
  const loud = sine(220, 0.5, 0.6); // about -6 dBFS
  const out = run('stompbox-comp', loud, { threshold: -30, ratio: 4, attack: 2, release: 100, makeup: 0 });
  const db = 20 * Math.log10(peakOf(out, RATE * 0.3));
  // -6 dB input, 24 dB over a -30 dB threshold at 4:1 → about -24 dB out.
  assert.ok(db > -26.5 && db < -21.5, `compressed level ${db.toFixed(1)} dB`);
  const quiet = sine(220, 0.005, 0.4); // -46 dBFS, below threshold
  const boosted = run('stompbox-comp', quiet, { threshold: -30, ratio: 4, makeup: 6 });
  const gain = 20 * Math.log10(peakOf(boosted, RATE * 0.2) / 0.005);
  assert.ok(Math.abs(gain - 6) < 0.5, `makeup ${gain.toFixed(2)} dB`);
});

test('auto-wah stays stable and opens brighter with a stronger pick attack', () => {
  const soft = run('stompbox-wah', sine(1800, 0.02, 0.4), { sensitivity: 7, range: 3000, resonance: 6 });
  const hard = run('stompbox-wah', sine(1800, 0.4, 0.4), { sensitivity: 7, range: 3000, resonance: 6 });
  assert.ok(soft.every(Number.isFinite) && hard.every(Number.isFinite));
  // A 1.8 kHz tone is passed more (relative to its input) when the filter sweeps up to it.
  assert.ok(peakOf(hard, RATE * 0.2) / 0.4 > (peakOf(soft, RATE * 0.2) / 0.02) * 1.5);
  assert.ok(peakOf(hard) < 4);
});

test('limiter never exceeds its ceiling and turns NaN into silence', () => {
  const hot = sine(110, 3, 0.3);
  const out = run('stompbox-limiter', hot, { ceiling: -1 }, 2);
  assert.ok(peakOf(out) <= 10 ** (-1 / 20) + 1e-6);
  const broken = new Float32Array(256).fill(NaN);
  const safe = run('stompbox-limiter', broken, {}, 2);
  assert.ok(safe.every(v => v === 0));
  const clean = sine(440, 0.3, 0.2);
  assert.ok(Math.abs(peakOf(run('stompbox-limiter', clean)) - 0.3) < 1e-3, 'transparent below the ceiling');
});

test('processors output silence and stay alive with no connected input', () => {
  for (const name of ['stompbox-gate', 'stompbox-comp', 'stompbox-wah', 'stompbox-limiter']) {
    const Processor = registry.get(name);
    const processor = new Processor();
    const params = Object.fromEntries(Processor.parameterDescriptors.map(d => [d.name, new Float32Array([d.defaultValue])]));
    const output = [new Float32Array(128).fill(1)];
    assert.equal(processor.process([[]], [output], params), true);
    assert.ok(output[0].every(v => v === 0), name);
  }
});
