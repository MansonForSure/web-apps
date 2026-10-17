import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOnsetFeatures, OnsetFeatureExtractor } from '../audio/feature-extractor.js';
import { TempoTracker } from '../audio/tempo-detector.js';

function makeRng(seed = 0xdecafbad) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function addClick(samples, start, sampleRate, amplitude, rng) {
  const length = Math.min(samples.length - start, Math.round(sampleRate * 0.018));
  for (let i = 0; i < length; i += 1) {
    const envelope = Math.exp(-i / (sampleRate * 0.0028));
    const brightNoise = (rng() * 2 - 1) * 0.74;
    const body = Math.sin((2 * Math.PI * 900 * i) / sampleRate) * 0.26;
    samples[start + i] += amplitude * envelope * (brightNoise + body);
  }
}

function clickTrack({ bpm, seconds, sampleRate, noise = 0.008, subdivision = null, seed = 1 }) {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const rng = makeRng(seed);
  for (let i = 0; i < samples.length; i += 1) samples[i] = (rng() * 2 - 1) * noise;

  const beat = 60 / bpm;
  for (let time = 0.06, beatIndex = 0; time < seconds; time += beat, beatIndex += 1) {
    addClick(samples, Math.round(time * sampleRate), sampleRate, beatIndex % 4 === 0 ? 0.82 : 0.64, rng);
    if (subdivision) {
      for (let fraction = 1 / subdivision; fraction < 1; fraction += 1 / subdivision) {
        addClick(samples, Math.round((time + beat * fraction) * sampleRate), sampleRate, 0.24, rng);
      }
    }
  }
  return samples;
}

function tone({ seconds, sampleRate, frequency = 220, amplitude = 0.2 }) {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

function noise({ seconds, sampleRate, amplitude = 0.08, seed = 10 }) {
  const rng = makeRng(seed);
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i += 1) samples[i] = amplitude * (rng() * 2 - 1);
  return samples;
}

function featuresFromSamples(samples, sampleRate) {
  // Deliberately uneven block sizes simulate render-quantum/chunk boundaries
  // and verify that timestamps stay tied to samples rather than chunks.
  const extractor = new OnsetFeatureExtractor({ sampleRate, frameRate: 100 });
  const frames = [];
  const blockSizes = [127, 89, 257, 31, 512, 63];
  let offset = 0;
  let blockIndex = 0;
  while (offset < samples.length) {
    const size = Math.min(blockSizes[blockIndex % blockSizes.length], samples.length - offset);
    frames.push(...extractor.process(samples.subarray(offset, offset + size)));
    offset += size;
    blockIndex += 1;
  }
  return frames;
}

function estimatesFor(samples, sampleRate) {
  const frames = featuresFromSamples(samples, sampleRate);
  const tracker = new TempoTracker();
  const estimates = [];
  for (let index = 0; index < frames.length; index += 9) {
    const result = tracker.update(frames.slice(index, index + 9));
    if (result) estimates.push(result);
  }
  return { frames, estimates, tracker };
}

function lastReliable(estimates) {
  return [...estimates].reverse().find((estimate) => estimate.bpm !== null) || null;
}

function withinTempo(value, expected, tolerance = 4) {
  return Math.abs(value - expected) <= tolerance;
}

test('sample-clocked extractor produces ~100 Hz monotonic feature frames at 44.1 and 48 kHz', () => {
  for (const sampleRate of [44_100, 48_000]) {
    const seconds = 2.3;
    const source = clickTrack({ bpm: 120, seconds, sampleRate, seed: sampleRate });
    const frames = featuresFromSamples(source, sampleRate);
    assert.ok(Math.abs(frames.length - seconds * 100) <= 1, `${sampleRate}: frame count`);
    for (let index = 1; index < frames.length; index += 1) {
      assert.ok(frames[index].time > frames[index - 1].time, `${sampleRate}: monotonic timestamps`);
    }
    assert.ok(Math.abs(frames.at(-1).time - frames.length / 100) < 0.011, `${sampleRate}: sample clock`);
  }
});

test('basic noisy click trains track their fundamental BPM over 60–210 BPM', () => {
  const scenarios = [
    [60, 44_100], [90, 48_000], [120, 44_100],
    [150, 48_000], [180, 44_100], [210, 48_000],
  ];
  for (const [bpm, sampleRate] of scenarios) {
    const source = clickTrack({ bpm, seconds: 14, sampleRate, noise: 0.009, seed: bpm + sampleRate });
    const { estimates } = estimatesFor(source, sampleRate);
    const estimate = lastReliable(estimates);
    assert.ok(estimate, `${bpm} BPM @ ${sampleRate}: a tempo should be found`);
    assert.ok(withinTempo(estimate.bpm, bpm), `${bpm} BPM @ ${sampleRate}: got ${estimate.bpm}`);
    assert.ok(estimate.confidence >= 0.45, `${bpm} BPM @ ${sampleRate}: confidence ${estimate.confidence}`);
  }
});

test('subdivision-heavy percussion may expose documented half/double tempo ambiguity', () => {
  const expected = 90;
  const source = clickTrack({
    bpm: expected,
    seconds: 14,
    sampleRate: 48_000,
    noise: 0.01,
    subdivision: 2,
    seed: 44,
  });
  const estimate = lastReliable(estimatesFor(source, 48_000).estimates);
  assert.ok(estimate, 'subdivision pattern should still have periodic evidence');
  const allowed = [expected / 2, expected, expected * 2];
  assert.ok(allowed.some((tempo) => withinTempo(estimate.bpm, tempo, 5)), `subdivision result ${estimate.bpm}`);
});

test('silence, sustained tone, and unstructured random noise never yield a reliable BPM', () => {
  const inputs = [
    new Float32Array(8 * 44_100),
    tone({ seconds: 8, sampleRate: 44_100 }),
    noise({ seconds: 8, sampleRate: 48_000, seed: 99 }),
  ];
  const rates = [44_100, 44_100, 48_000];
  for (let index = 0; index < inputs.length; index += 1) {
    const { estimates } = estimatesFor(inputs[index], rates[index]);
    assert.ok(estimates.length > 0, 'scheduled estimates should be emitted');
    for (const estimate of estimates) {
      assert.ok(estimate.bpm === null || estimate.confidence < 0.28,
        `non-rhythmic input unexpectedly reliable: ${JSON.stringify(estimate)}`);
    }
  }
});

test('a tempo change adapts and sustained silence clears the prior estimate', () => {
  const sampleRate = 48_000;
  const first = clickTrack({ bpm: 90, seconds: 8, sampleRate, noise: 0.007, seed: 55 });
  const second = clickTrack({ bpm: 150, seconds: 9, sampleRate, noise: 0.007, seed: 56 });
  const silence = new Float32Array(Math.round(3.1 * sampleRate));
  const joined = new Float32Array(first.length + second.length + silence.length);
  joined.set(first);
  joined.set(second, first.length);
  joined.set(silence, first.length + second.length);

  const frames = featuresFromSamples(joined, sampleRate);
  const tracker = new TempoTracker();
  const estimates = [];
  for (let index = 0; index < frames.length; index += 10) {
    const result = tracker.update(frames.slice(index, index + 10));
    if (result) estimates.push(result);
  }

  const beforeSilence = estimates.filter((estimate) => estimate.seconds > 10 && estimate.signal && estimate.bpm !== null).at(-1);
  assert.ok(beforeSilence, 'should produce an estimate after the change');
  assert.ok(withinTempo(beforeSilence.bpm, 150, 5), `expected 150 after change, got ${beforeSilence.bpm}`);

  const final = estimates.at(-1);
  assert.equal(final.signal, false, 'sustained silence should be marked stale/no signal');
  assert.equal(final.bpm, null, 'silence must clear rather than retain BPM');
  assert.equal(final.confidence, 0, 'silence must clear confidence');
});

test('extractOnsetFeatures convenience API uses the same streaming extractor', () => {
  const samples = clickTrack({ bpm: 120, seconds: 1, sampleRate: 44_100, seed: 17 });
  const direct = extractOnsetFeatures(samples, { sampleRate: 44_100, frameRate: 100 });
  const streamed = featuresFromSamples(samples, 44_100);
  assert.deepEqual(direct, streamed);
});
