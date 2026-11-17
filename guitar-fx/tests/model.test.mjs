import test from 'node:test';
import assert from 'node:assert/strict';
import { PEDALS, PEDAL_BY_ID } from '../audio/pedals.js';
import { PRESETS } from '../presets.js';
import { MASTER_PARAMS, defaultSettings, presetPedals, sanitizeSettings } from '../settings.js';
import { makeDemoRiff } from '../audio/demo.js';

test('pedal definitions are complete and in a guitar-friendly order', () => {
  assert.deepEqual(PEDALS.map(p => p.id), ['gate', 'comp', 'wah', 'drive', 'amp', 'cab', 'phaser', 'chorus', 'tremolo', 'delay', 'reverb']);
  for (const pedal of PEDALS) {
    assert.ok(pedal.name && pedal.short && /^#[0-9a-f]{6}$/i.test(pedal.color), pedal.id);
    assert.equal(typeof pedal.create, 'function');
    assert.ok(pedal.params.length >= 2 && pedal.params.length <= 4);
    for (const param of pedal.params) {
      assert.ok(param.min < param.max, `${pedal.id}.${param.key} range`);
      assert.ok(param.def >= param.min && param.def <= param.max, `${pedal.id}.${param.key} default`);
      if (param.scale === 'log') assert.ok(param.min > 0);
    }
  }
});

test('every preset references real pedals, modes and in-range values', () => {
  assert.ok(PRESETS.length >= 6);
  for (const preset of PRESETS) {
    for (const [id, override] of Object.entries(preset.pedals)) {
      const def = PEDAL_BY_ID[id];
      assert.ok(def, `${preset.id}: ${id}`);
      if (override.mode) assert.ok(def.modes.some(m => m.id === override.mode), `${preset.id}: ${id} mode`);
      for (const [key, value] of Object.entries(override.params || {})) {
        const param = def.params.find(p => p.key === key);
        assert.ok(param, `${preset.id}: ${id}.${key}`);
        assert.ok(value >= param.min && value <= param.max, `${preset.id}: ${id}.${key}=${value}`);
      }
    }
    const pedals = presetPedals(preset.id);
    assert.equal(Object.keys(pedals).length, PEDALS.length);
    assert.deepEqual(Object.keys(preset.pedals).sort(), Object.entries(pedals).filter(([, p]) => p.on).map(([id]) => id).sort());
  }
});

test('stored settings are sanitized and clamped', () => {
  const defaults = defaultSettings();
  assert.equal(defaults.master, MASTER_PARAMS.master.def);
  assert.deepEqual(sanitizeSettings(null), defaults);
  assert.deepEqual(sanitizeSettings({ version: 99 }), defaults);
  const cleaned = sanitizeSettings({
    version: 1, preset: 'lead', edited: 1, input: 999, master: 'loud', channel: 'surround', deviceId: 42,
    pedals: { drive: { on: true, mode: 'laser', params: { drive: 50, tone: 3, bogus: 1 } }, nope: {} },
  });
  assert.equal(cleaned.preset, 'lead');
  assert.equal(cleaned.edited, true);
  assert.equal(cleaned.input, MASTER_PARAMS.input.max);
  assert.equal(cleaned.master, MASTER_PARAMS.master.def);
  assert.equal(cleaned.channel, 'mix');
  assert.equal(cleaned.deviceId, '');
  assert.equal(cleaned.pedals.drive.on, true);
  assert.equal(cleaned.pedals.drive.mode, 'overdrive');
  assert.equal(cleaned.pedals.drive.params.drive, 10);
  assert.equal(cleaned.pedals.drive.params.tone, 3);
  assert.equal('bogus' in cleaned.pedals.drive.params, false);
  assert.equal('nope' in cleaned.pedals, false);
});

test('demo riff is a finite, seamless, guitar-level synthetic loop', () => {
  for (const rate of [44100, 48000]) {
    const riff = makeDemoRiff(rate);
    assert.ok(riff.length > rate * 8 && riff.length < rate * 10);
    let peak = 0;
    let energy = 0;
    for (const v of riff) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); energy += v * v; }
    assert.ok(Math.abs(peak - 0.35) < 1e-6);
    assert.ok(Math.sqrt(energy / riff.length) > 0.02);
    assert.ok(Math.abs(riff[riff.length - 1] - riff[0]) < 0.2, 'no large jump at the loop point');
  }
});
