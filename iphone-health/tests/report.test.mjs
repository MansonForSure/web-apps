import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TESTS, GROUPS, getTest, testsInGroup } from '../lib/catalog.js';
import { deriveStatus, itemSummary, composeResult, summarize, nextTestId, buildReport, joinAnd } from '../lib/report.js';

test('catalog ids are unique and every test is well formed', () => {
  const ids = new Set();
  for (const test of TESTS) {
    assert.ok(!ids.has(test.id), `duplicate ${test.id}`);
    ids.add(test.id);
    assert.ok(GROUPS[test.group], `${test.id} has a known group`);
    assert.ok(test.title && test.blurb && test.icon, `${test.id} has text and icon`);
    if (!test.auto && !test.custom) assert.ok(test.items && test.items.length, `${test.id} has items`);
    const itemIds = new Set((test.items || []).map((item) => item.id));
    assert.equal(itemIds.size, (test.items || []).length, `${test.id} item ids are unique`);
  }
  assert.equal(getTest('display').title, 'Display');
  assert.equal(getTest('nope'), null);
  assert.equal(testsInGroup('hardware').length + testsInGroup('settings').length, TESTS.length);
});

test('every icon used by the catalog exists', () => {
  const dom = readFileSync(new URL('../lib/dom.js', import.meta.url), 'utf8');
  for (const test of TESTS) assert.match(dom, new RegExp(`\\n  ${test.icon}: '`), `icon ${test.icon}`);
});

test('every hardware test with a custom screen has a panel module', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  for (const test of testsInGroup('hardware')) assert.match(app, new RegExp(`\\n  ${test.id}: mount`), `panel for ${test.id}`);
  assert.match(app, /\n  battery: mountBattery/);
});

test('statuses are derived from checklist answers', () => {
  const items = getTest('speakers').items;
  assert.equal(deriveStatus(items, {}), null);
  assert.equal(deriveStatus(items, { left: 'yes' }), 'partial');
  assert.equal(deriveStatus(items, { left: 'yes', right: 'yes', sweep: 'yes' }), 'pass');
  assert.equal(deriveStatus(items, { left: 'no' }), 'fail');
  const cam = getTest('cameras').items;
  assert.equal(deriveStatus(cam, { back: 'yes', front: 'yes', lenses: 'na', flash: 'yes' }), 'pass');
  assert.equal(deriveStatus([{ id: 'a' }], { a: 'na' }), 'skip');
});

test('summaries name the failing parts', () => {
  const items = getTest('speakers').items;
  assert.equal(itemSummary(items, { left: 'no', sweep: 'no', right: 'yes' }), 'Issue: Left speaker and Distortion');
  assert.equal(itemSummary(items, { left: 'yes' }), '1 of 3 checked');
  assert.equal(itemSummary(items, { left: 'yes', right: 'yes', sweep: 'yes' }), 'All checks passed');
  assert.equal(joinAnd(['a', 'b', 'c']), 'a, b and c');
});

test('composeResult merges detail text and status', () => {
  const test = getTest('touch');
  const partial = composeResult(test, {}, { detail: '64% painted' });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.summary, '64% painted');
  const done = composeResult(test, partial, { items: { coverage: 'yes' }, detail: '100% responded' });
  assert.equal(done.status, 'pass');
  assert.equal(done.summary, 'Working · 100% responded');
});

test('overall summary, next test and report', () => {
  const results = {
    display: { status: 'pass', summary: 'All checks passed' },
    touch: { status: 'fail', summary: 'Issue: Dead zones' },
    multitouch: { status: 'skip' },
    speakers: { status: 'partial', summary: '1 of 3 checked' },
  };
  const get = (id) => results[id] || null;
  const summary = summarize(TESTS, get);
  assert.equal(summary.pass, 1);
  assert.equal(summary.fail, 1);
  assert.equal(summary.skip, 1);
  assert.equal(summary.done, 3);
  assert.equal(summary.tone, 'bad');
  assert.equal(summary.headline, '1 item needs attention');
  assert.equal(nextTestId(TESTS, get), 'speakers');
  assert.equal(nextTestId(TESTS, get, 'speakers'), 'microphone');
  assert.equal(nextTestId(TESTS.slice(0, 3), get), null);
  const report = buildReport({ tests: TESTS, groups: GROUPS, getResult: get, device: null, date: new Date('2026-11-17T12:00:00Z'), url: 'https://example.com/' });
  assert.match(report, /^iPhone health report — Checkup/);
  assert.match(report, /✓ Display — All checks passed/);
  assert.match(report, /✗ Touchscreen — Issue: Dead zones/);
  assert.match(report, /○ Microphone — Not run/);
  assert.match(report, /Made with Checkup: https:\/\/example.com\//);
  const empty = summarize(TESTS, () => null);
  assert.equal(empty.tone, 'idle');
  const all = summarize(TESTS, () => ({ status: 'pass' }));
  assert.equal(all.headline, 'Your iPhone looks healthy');
});
