import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { TapTempo } from '../tap-tempo.js';
import { makeDemoBuffer } from '../audio/demo.js';

test('tap tempo estimates a steady beat and requires three taps', () => {
  const tempo = new TapTempo();
  assert.equal(tempo.tap(0).bpm, null);
  assert.equal(tempo.tap(500).bpm, null);
  assert.equal(tempo.tap(1000).bpm, 120);
  assert.equal(tempo.tap(1500).bpm, 120);
});
test('tap tempo rejects accidental double taps and resets after a pause', () => {
  const tempo = new TapTempo();
  [0, 500, 1000, 1050, 1500].forEach(time => tempo.tap(time));
  assert.equal(tempo.result().count, 4);
  assert.equal(tempo.result().bpm, 120);
  assert.equal(tempo.tap(5000).bpm, null);
  tempo.reset();
  assert.equal(tempo.result().count, 0);
});
test('tap tempo tolerates one missed beat', () => {
  const tempo = new TapTempo();
  [0, 500, 1000, 2000, 2500, 3000].forEach(time => tempo.tap(time));
  assert.equal(tempo.result().bpm, 120);
});
test('demo creates bounded real audio samples, not a fixed displayed BPM', () => {
  const context = { sampleRate: 48000, createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { length, sampleRate, getChannelData: () => data };
  } };
  const buffer = makeDemoBuffer(context);
  assert.equal(buffer.length, 384000);
  const data = buffer.getChannelData(0);
  assert.ok(data.some(value => value !== 0));
  assert.ok(data.every(value => Math.abs(value) < 1));
});
test('all HTML runtime assets are relative and available', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\.\/[^"?]+)(?:\?[^" ]*)?"/g)) {
    if (asset !== './') assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
  }
  assert.match(html, /id="startButton"/);
  assert.match(html, /id="stopButton"/);
  assert.match(html, /SYNTHETIC DEMO/);
  assert.match(html, /aria-label/);
});
