import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBattery, batterySummary } from '../lib/battery.js';
import { CoverageGrid } from '../lib/grid.js';
import { scoreFromRates, frameStats, median } from '../lib/bench.js';
import { createStore } from '../lib/store.js';
import { createLayers } from '../lib/layers.js';

test('battery grades follow Apple’s 80% threshold', () => {
  assert.equal(assessBattery({ capacity: 96 }).grade, 'excellent');
  assert.equal(assessBattery({ capacity: '85' }).grade, 'good');
  assert.equal(assessBattery({ capacity: 80 }).status, 'pass');
  assert.equal(assessBattery({ capacity: 79 }).status, 'fail');
  assert.equal(assessBattery({ capacity: 95, warning: true }).grade, 'service');
  assert.equal(assessBattery({ capacity: '' }).grade, 'empty');
  assert.equal(assessBattery({ capacity: 140 }).grade, 'invalid');
  assert.equal(assessBattery({ capacity: 90, cycles: 12.5 }).grade, 'invalid');
});

test('cycle notes use the right design target', () => {
  const recent = assessBattery({ capacity: 90, cycles: 250, era: 'new' });
  assert.match(recent.cycleNote, /25% of the 1000 cycles/);
  const older = assessBattery({ capacity: 90, cycles: 250, era: 'old' });
  assert.match(older.cycleNote, /50% of the 500 cycles/);
  const early = assessBattery({ capacity: 76, cycles: 200, era: 'new' });
  assert.match(early.cycleNote, /warranty/);
  const unknown = assessBattery({ capacity: 90, cycles: 300 });
  assert.equal(unknown.cycleNote, '300 charge cycles so far.');
  assert.equal(batterySummary(recent), 'Excellent · 90% capacity · 250 cycles');
});

test('coverage grid fills cells along a swipe without gaps', () => {
  const grid = new CoverageGrid(400, 800, 40);
  assert.equal(grid.cols, 10);
  assert.equal(grid.rows, 20);
  const added = grid.markSegment(0, 5, 399, 5);
  assert.equal(added.length, 10);
  assert.equal(grid.filled, 10);
  assert.equal(grid.markSegment(0, 5, 399, 5).length, 0);
  assert.equal(grid.mark(-1, 5), -1);
  for (let row = 0; row < grid.rows; row += 1) grid.markSegment(0, row * 40 + 20, 400, row * 40 + 20);
  assert.equal(grid.complete, true);
  assert.equal(grid.missing().length, 0);
  assert.deepEqual(grid.cellRect(11), { x: 40, y: 40, w: 40, h: 40 });
});

test('benchmark scoring uses the median and spots slowdowns', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  const steady = scoreFromRates([1000, 1010, 990, 1005, 1000]);
  assert.equal(steady.score, 100);
  assert.equal(steady.steady, true);
  const throttled = scoreFromRates([1000, 900, 800, 700, 600]);
  assert.equal(throttled.steady, false);
  assert.equal(Math.round(throttled.drop * 100), 40);
  assert.deepEqual(scoreFromRates([]), { score: 0, drop: 0, steady: false });
});

test('frame stats measure frame rate and on-time share', () => {
  const stamps = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));
  const stats = frameStats(stamps);
  assert.equal(stats.fps, 60);
  assert.equal(stats.smooth, 100);
  const janky = [0, 16.7, 33.3, 100, 116.7, 133.3];
  assert.ok(frameStats(janky).smooth < 100);
});

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

test('store persists results and survives corrupt data', () => {
  const storage = memoryStorage();
  const store = createStore(storage, 'k');
  store.set('display', { status: 'pass' });
  assert.deepEqual(createStore(storage, 'k').get('display'), { status: 'pass' });
  store.set('display', null);
  assert.equal(createStore(storage, 'k').get('display'), null);
  storage.setItem('bad', '{not json');
  assert.deepEqual(createStore(storage, 'bad').all(), {});
  const throwing = { getItem: () => '{}', setItem: () => { throw new Error('full'); } };
  assert.doesNotThrow(() => createStore(throwing, 'x').set('a', { status: 'pass' }));
  const none = createStore(null);
  assert.equal(none.persistent, false);
  none.set('a', { status: 'fail' });
  assert.equal(none.get('a').status, 'fail');
});

function fakeWindow() {
  const listeners = [];
  let depth = 0;
  return {
    history: {
      pushState() { depth += 1; },
      back() { depth -= 1; queueMicrotask(() => listeners.forEach((fn) => fn())); },
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn); },
    swipeBack() { depth -= 1; listeners.forEach((fn) => fn()); },
    get depth() { return depth; },
  };
}

test('layers close on the back gesture and on explicit close', async () => {
  const win = fakeWindow();
  const layers = createLayers(win);
  const closed = [];
  layers.push(() => closed.push('sheet'));
  const fullscreen = layers.push(() => closed.push('fullscreen'));
  assert.equal(layers.depth, 2);
  win.swipeBack();
  assert.deepEqual(closed, ['fullscreen']);
  layers.pop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(closed, ['fullscreen', 'sheet']);
  assert.equal(layers.depth, 0);
  assert.equal(win.depth, 0);
  layers.pop(fullscreen);
  assert.deepEqual(closed, ['fullscreen', 'sheet']);
});

test('dismissing a lower layer does not close the top one', () => {
  const win = fakeWindow();
  const layers = createLayers(win);
  const closed = [];
  const lower = layers.push(() => closed.push('lower'));
  layers.push(() => closed.push('upper'));
  layers.dismiss(lower);
  assert.deepEqual(closed, ['lower']);
  assert.equal(layers.depth, 1);
});
