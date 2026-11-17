import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_MODES, blockLevel, dbToGain, driveGain, driveMakeup, driveTransfer, fromUnit, gainToDb, makeDriveCurve, makeReverbImpulse, toUnit } from '../audio/dsp.js';

test('knob mapping round-trips for linear and log ranges', () => {
  for (const range of [{ min: -12, max: 12 }, { min: 40, max: 1500, scale: 'log' }, { min: 0.05, max: 6, scale: 'log' }]) {
    for (const t of [0, 0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(toUnit(fromUnit(t, range), range) - t) < 1e-9);
    assert.equal(fromUnit(-1, range), range.min);
    assert.equal(fromUnit(2, range), range.max);
  }
  assert.ok(Math.abs(gainToDb(dbToGain(-18)) + 18) < 1e-9);
});

test('drive curves are bounded, pass zero and rise monotonically', () => {
  for (const mode of DRIVE_MODES) {
    const curve = makeDriveCurve(mode);
    assert.equal(curve.length % 2, 1);
    assert.ok(Math.abs(curve[(curve.length - 1) / 2]) < 1e-6, `${mode} f(0)=0`);
    let max = 0;
    for (let i = 0; i < curve.length; i++) {
      assert.ok(Number.isFinite(curve[i]));
      max = Math.max(max, Math.abs(curve[i]));
      if (i) assert.ok(curve[i] >= curve[i - 1] - 1e-7, `${mode} monotonic at ${i}`);
    }
    assert.ok(Math.abs(max - 1) < 1e-6, `${mode} normalized`);
  }
});

test('drive makeup keeps loudness steady across the Drive knob', () => {
  const reference = 0.12;
  const N = 2000;
  for (const mode of DRIVE_MODES) {
    const levels = [0, 2.5, 5, 7.5, 10].map(drive => {
      const gain = driveGain(mode, drive);
      const makeup = driveMakeup(mode, gain);
      let sum = 0;
      for (let i = 0; i < N; i++) sum += (makeup * driveTransfer(mode, gain * reference * Math.sin((2 * Math.PI * i) / N))) ** 2;
      return gainToDb(Math.sqrt(sum / N));
    });
    const spread = Math.max(...levels) - Math.min(...levels);
    assert.ok(spread < 4.5, `${mode} RMS spread ${spread.toFixed(2)} dB`);
    levels.forEach(db => assert.ok(db > -28 && db < -18, `${mode} RMS ${db.toFixed(1)} dB`));
  }
  assert.ok(driveGain('fuzz', 10) > driveGain('distortion', 10));
  assert.ok(driveGain('overdrive', 0) >= 1);
});

test('reverb impulse is deterministic, stereo-decorrelated and decays to about -60 dB', () => {
  const rate = 48000;
  const [left, right] = makeReverbImpulse(rate, 2);
  const [again] = makeReverbImpulse(rate, 2);
  assert.deepEqual(left.slice(0, 2000), again.slice(0, 2000));
  assert.ok(left.length > rate * 2 && left.length < rate * 2.3);
  const energy = (data, from, to) => { let sum = 0; for (let i = from; i < to; i++) sum += data[i] ** 2; return sum / (to - from); };
  const window = Math.floor(rate * 0.1);
  const early = energy(left, Math.floor(rate * 0.03), Math.floor(rate * 0.03) + window);
  const late = energy(left, left.length - window, left.length);
  assert.ok(10 * Math.log10(early / late) > 45, 'tail is much quieter than the onset');
  let dot = 0; let l2 = 0; let r2 = 0;
  for (let i = 0; i < left.length; i++) { dot += left[i] * right[i]; l2 += left[i] ** 2; r2 += right[i] ** 2; }
  assert.ok(Math.abs(dot / Math.sqrt(l2 * r2)) < 0.3, 'channels are decorrelated for width');
  assert.ok(left.every(Number.isFinite));
});

test('block level ignores non-finite samples', () => {
  const level = blockLevel(new Float32Array([0.5, -0.25, NaN, Infinity]));
  assert.equal(level.peak, 0.5);
  assert.ok(level.rms > 0.39 && level.rms < 0.4);
});
