import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../site/guitar-tuner/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('the compact shell retains every element required by the tuner', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
  for (const [, id] of app.matchAll(/element\('([^']+)'\)/g)) {
    assert.ok(ids.includes(id), `Missing tuner element: ${id}`);
  }
  assert.match(html, /id="status" role="status" aria-live="polite"/);
  assert.match(html, /<h1 id="page-title">Guitar tuner<\/h1>/);
});

test('promotional copy and repeated instructions are removed', () => {
  for (const copy of ['SIX STRINGS. ONE GOOD SOUND.', 'Find your', 'A clear note.', 'One string at a time.', 'Less setup. More playing.', 'Source code', 'THICKEST TO THINNEST']) {
    assert.ok(!html.includes(copy), `Redundant copy remains: ${copy}`);
  }
  assert.ok(!html.includes('class="intro"'));
  assert.ok(!html.includes('class="practice-notes"'));
});

test('essential help and licenses remain in one collapsed disclosure', () => {
  const disclosures = [...html.matchAll(/<details([^>]*)>/g)];
  assert.equal(disclosures.length, 1);
  assert.ok(!/\bopen\b/.test(disclosures[0][1]));
  assert.match(html, /<summary>Help<\/summary>/);
  assert.match(html, /allow microphone access/);
  assert.match(html, /nothing is recorded or uploaded/);
  assert.match(html, /Demo input is simulated/);
  assert.match(html, /href="\.\/licenses\.txt"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /href="\.\/style\.css\?v=compact-20261017"/);
});
