import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_SIZE, STRINGS, GuitarPitchDetector, centsBetween, chooseTarget, frequencyForMidi, guitarSignal, median } from '../src/tuner.js';

const detector = new GuitarPitchDetector();

for (const sampleRate of [32000, 44100, 48000]) {
  for (const string of STRINGS) {
    test(`detect string ${string.number} ${string.note}${string.octave} at ${sampleRate} Hz`, () => {
      const expected = frequencyForMidi(string.midi);
      const result = detector.analyse(guitarSignal(expected, sampleRate), sampleRate);
      assert.ok(result.frequency, 'Pitch was not detected');
      assert.ok(Math.abs(centsBetween(result.frequency, expected)) < 1.5);
      assert.equal(chooseTarget(result.frequency).number, string.number);
    });
  }
}

for (const deviation of [-23, -7, 0, 7, 23]) {
  test(`correctly measure ${deviation} cents on the low E string`, () => {
    const target = frequencyForMidi(40);
    const actual = target * 2 ** (deviation / 1200);
    const result = detector.analyse(guitarSignal(actual, 48000, { offset: 1357, noise: 0.001 }), 48000);
    assert.ok(result.frequency);
    assert.ok(Math.abs(centsBetween(result.frequency, target) - deviation) < 1.5);
  });
}

test('reject silence and low input levels', () => {
  assert.equal(detector.analyse(new Float32Array(FRAME_SIZE), 44100).frequency, null);
  assert.equal(detector.analyse(guitarSignal(110, 44100, { amplitude: 0.0005 }), 44100).frequency, null);
});

test('reject a constant DC signal', () => {
  assert.equal(detector.analyse(new Float32Array(FRAME_SIZE).fill(0.2), 44100).frequency, null);
});

test('reject deterministic white noise', () => {
  const buffer = new Float32Array(FRAME_SIZE);
  let seed = 456;
  for (let index = 0; index < buffer.length; index += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    buffer[index] = ((seed / 4294967296) * 2 - 1) * 0.2;
  }
  assert.equal(detector.analyse(buffer, 44100).frequency, null);
});

test('preserve low E fundamental with strong upper harmonics', () => {
  const expected = frequencyForMidi(40);
  const input = guitarSignal(expected, 48000, { noise: 0.004 });
  const result = detector.analyse(input, 48000);
  assert.ok(result.frequency);
  assert.ok(Math.abs(centsBetween(result.frequency, expected)) < 2);
});

test('manual string selection does not silently change targets', () => {
  assert.equal(chooseTarget(110, 6).midi, 40);
  assert.equal(chooseTarget(82.4, 1).midi, 64);
});

test('standard tuning reference values', () => {
  const expected = [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276];
  STRINGS.forEach((string, index) => assert.ok(Math.abs(frequencyForMidi(string.midi) - expected[index]) < 0.001));
});

test('median smoothing and invalid cents inputs', () => {
  assert.equal(median([1, 20, 3]), 3);
  assert.equal(median([4, 2]), 3);
  assert.equal(median([]), null);
  assert.equal(centsBetween(0, 440), null);
  assert.equal(centsBetween(440, -1), null);
});

test('validate frame size and sample rate', () => {
  assert.throws(() => detector.analyse(new Float32Array(10), 44100), RangeError);
  assert.throws(() => detector.analyse(new Float32Array(FRAME_SIZE), 0), RangeError);
});
