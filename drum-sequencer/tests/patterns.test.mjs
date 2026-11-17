import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LEVELS, ROW_KEYS, VOICES, layerForVelocity, velocityDb } from "../src/kit.js";
import {
  MAX_STEPS,
  PRESETS,
  applyPreset,
  decodeState,
  defaultState,
  encodeState,
  makeRng,
  nextPatternIndex,
  parseSteps,
  presetPatterns,
  sanitizeState,
  stepDuration,
  stepEvents,
  stepsToString,
} from "../src/patterns.js";
import { buildMidi, exportSequence } from "../src/export.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kit = JSON.parse(readFileSync(join(root, "samples/kit.json"), "utf8"));

test("every voice in the UI has rendered samples on disk", () => {
  for (const id of Object.keys(VOICES)) {
    const v = kit.voices[id];
    assert.ok(v, `kit.json is missing ${id}`);
    assert.ok(v.layers.length >= 1);
    for (const layer of v.layers) {
      assert.ok(layer.files.length >= 1, `${id} has an empty layer`);
      for (const f of layer.files) assert.ok(existsSync(join(root, "samples", id, f)), `${id}/${f} missing`);
    }
  }
});

test("velocity layers are chosen like the SFZ equal-split ranges", () => {
  // 5 layers: 1-27, 28-52, 53-77, 78-102, 103-127 (approximately equal splits)
  assert.equal(layerForVelocity(5, 0.05), 0);
  assert.equal(layerForVelocity(5, 0.3), 1);
  assert.equal(layerForVelocity(5, 0.55), 2);
  assert.equal(layerForVelocity(5, 0.78), 3);
  assert.equal(layerForVelocity(5, 1), 4);
  assert.equal(layerForVelocity(3, 0.2), 0);
  assert.equal(layerForVelocity(3, 0.5), 1);
  assert.equal(layerForVelocity(3, 1), 2);
  assert.equal(layerForVelocity(1, 0.4), 0);
  // painted dynamics map to distinct layers on 5-layer drums
  const layers = Object.values(LEVELS).map((l) => layerForVelocity(5, l.vel));
  assert.equal(new Set(layers).size, 4);
});

test("velocity loudness curve is monotonic and unity at full velocity", () => {
  assert.equal(velocityDb(1), 0);
  let prev = -Infinity;
  for (let v = 0.05; v <= 1.0001; v += 0.05) {
    const d = velocityDb(v);
    assert.ok(d > prev);
    prev = d;
  }
  assert.ok(velocityDb(LEVELS[1].vel) < -15, "ghost notes should be clearly quieter");
});

test("step strings round-trip", () => {
  const s = "X.x.gsfFrRqh....";
  const steps = parseSteps(s);
  assert.equal(steps.length, MAX_STEPS);
  assert.equal(stepsToString(steps, 16), s);
});

test("all presets are well-formed", () => {
  for (const p of PRESETS) {
    assert.ok(p.bpm >= 30 && p.bpm <= 260, p.id);
    assert.ok([3, 4].includes(p.division), p.id);
    assert.ok(p.length <= MAX_STEPS, p.id);
    for (const pat of p.patterns) {
      for (const [key, str] of Object.entries(pat)) {
        assert.ok(ROW_KEYS.includes(key), `${p.id}: unknown row ${key}`);
        assert.ok(str.length <= p.length, `${p.id}.${key} is longer than the pattern (${str.length} > ${p.length})`);
        assert.ok(str.length === p.length || str.length === 0, `${p.id}.${key} should fill the bar (${str.length}/${p.length})`);
        assert.match(str, /^[.\-gsxXhfFqrRkl]*$/, `${p.id}.${key}`);
      }
    }
    const pats = presetPatterns(p);
    assert.equal(pats.length, 4);
    assert.ok(pats[0].grid.bd.some((c) => c) || pats[0].grid.xs.some((c) => c), `${p.id} has no kick or cross-stick`);
  }
});

test("presets can remap row voices", () => {
  const metal = PRESETS.find((p) => p.id === "metal");
  const s = applyPreset(defaultState(), metal);
  assert.equal(s.rows.find((r) => r.key === "crash2").voice, "china");
  const rock = applyPreset(s, PRESETS[0]);
  assert.equal(rock.rows.find((r) => r.key === "crash2").voice, "crash2");
});

test("swing delays only the off-16ths and stays within the step", () => {
  const s = defaultState();
  const p = s.patterns[0];
  p.grid.hh = parseSteps("xxxxxxxxxxxxxxxx");
  const opts = { bpm: 100, swing: 0.62, humanize: 0 };
  const dur = stepDuration(100, 4);
  const on = stepEvents(p, s.rows, 0, opts).find((e) => e.rowKey === "hh");
  const off = stepEvents(p, s.rows, 1, opts).find((e) => e.rowKey === "hh");
  assert.equal(on.offset, 0);
  assert.ok(Math.abs(off.offset - 0.24 * dur) < 1e-9);
  assert.ok(off.offset < dur);
});

test("triplet grids ignore the 16th swing control", () => {
  const s = defaultState();
  const p = { length: 12, division: 3, grid: s.patterns[0].grid };
  p.grid.hh = parseSteps("xxxxxxxxxxxx");
  const e = stepEvents(p, s.rows, 1, { bpm: 90, swing: 0.7 }).find((x) => x.rowKey === "hh");
  assert.equal(e.offset, 0);
});

test("flams add a quieter grace note just before the main stroke; rolls split the step", () => {
  const s = defaultState();
  const p = s.patterns[0];
  for (const k of Object.keys(p.grid)) p.grid[k].fill(0);
  p.grid.sn[4] = 14; // accent flam
  p.grid.sn[8] = 23; // roll
  const flam = stepEvents(p, s.rows, 4, { bpm: 100 });
  assert.equal(flam.length, 2);
  assert.ok(flam[0].offset < 0 && flam[0].vel < flam[1].vel);
  const roll = stepEvents(p, s.rows, 8, { bpm: 100 });
  assert.equal(roll.length, 2);
  assert.ok(Math.abs(roll[1].offset - stepDuration(100, 4) / 2) < 1e-9);
});

test("mute and solo filter rows", () => {
  const s = defaultState();
  const p = s.patterns[0];
  const all = stepEvents(p, s.rows, 0, { bpm: 100 }).map((e) => e.rowKey);
  assert.ok(all.includes("bd") && all.includes("hh"));
  s.rows.find((r) => r.key === "bd").mute = true;
  assert.ok(!stepEvents(p, s.rows, 0, { bpm: 100 }).some((e) => e.rowKey === "bd"));
  s.rows.find((r) => r.key === "hh").solo = true;
  assert.deepEqual(
    stepEvents(p, s.rows, 0, { bpm: 100 }).map((e) => e.rowKey),
    ["hh"],
  );
});

test("humanize is bounded and keeps velocity in range", () => {
  const s = defaultState();
  const p = s.patterns[0];
  p.grid.hh = parseSteps("XXXXXXXXXXXXXXXX");
  const rng = makeRng(42);
  let maxDev = 0;
  for (let i = 0; i < 2000; i++) {
    const e = stepEvents(p, s.rows, 0, { bpm: 120, humanize: 1, rng }).find((x) => x.rowKey === "hh");
    maxDev = Math.max(maxDev, Math.abs(e.offset));
    assert.ok(e.vel > 0 && e.vel <= 1);
  }
  assert.ok(maxDev > 0.005 && maxDev <= 0.0165, `max deviation ${maxDev}`);
});

test("share links round-trip and reject garbage", () => {
  const s = applyPreset(defaultState(), PRESETS[1]);
  s.rows[3].vol = -4.5;
  s.rows[5].pan = -0.4;
  s.chain = true;
  const back = decodeState(encodeState(s));
  assert.equal(back.bpm, s.bpm);
  assert.equal(back.chain, true);
  assert.equal(back.rows[3].vol, -4.5);
  assert.deepEqual(back.patterns[1].grid.sn, s.patterns[1].grid.sn);
  assert.equal(decodeState("%%%not-base64"), null);
  const weird = sanitizeState({ bpm: 9999, swing: -1, rows: [{ key: "bd", voice: "nope", vol: 99 }], patterns: [{ length: 99, grid: { bd: [5, 99, "x"] } }] });
  assert.equal(weird.bpm, 260);
  assert.equal(weird.swing, 0.5);
  assert.equal(weird.rows.find((r) => r.key === "bd").voice, "kick");
  assert.equal(weird.rows.find((r) => r.key === "bd").vol, 6);
  assert.equal(weird.patterns[0].length, 32);
  assert.deepEqual(weird.patterns[0].grid.bd.slice(0, 3), [0, 0, 0]);
});

test("chain mode skips empty patterns", () => {
  const s = defaultState();
  for (const k of Object.keys(s.patterns[2].grid)) s.patterns[2].grid[k].fill(0);
  s.chain = true;
  assert.equal(nextPatternIndex(s, 1, null), 3);
  assert.equal(nextPatternIndex(s, 3, null), 0);
  assert.equal(nextPatternIndex(s, 0, 2), 2, "a queued pattern wins");
  s.chain = false;
  assert.equal(nextPatternIndex(s, 1, null), 1);
  assert.deepEqual(exportSequence({ ...s, chain: true, current: 0 }), [0, 1, 3]);
});

test("MIDI export is a valid type-0 GM drum file", () => {
  const s = defaultState();
  s.chain = false;
  const bytes = buildMidi(s);
  const txt = String.fromCharCode(...bytes.slice(0, 4));
  assert.equal(txt, "MThd");
  assert.equal(String.fromCharCode(...bytes.slice(14, 18)), "MTrk");
  const len = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
  assert.equal(bytes.length, 22 + len);
  // count note-ons on channel 10 and check kick note 36 is present
  let ons = 0;
  let kick = false;
  for (let i = 22; i < bytes.length - 2; i++) {
    if (bytes[i] === 0x99) {
      ons++;
      if (bytes[i + 1] === 36) kick = true;
    }
  }
  const expected = Object.values(s.patterns[0].grid).reduce((n, row) => n + row.slice(0, 16).filter(Boolean).length, 0);
  assert.equal(ons, expected);
  assert.ok(kick);
  assert.deepEqual([...bytes.slice(-3)], [0xff, 0x2f, 0x00]);
});

test("WAV loop folding wraps tails and grace notes so the loop is seamless", async () => {
  const { foldLoop, encodeWav } = await import("../src/export.js");
  const src = new Float32Array(20);
  src[3] = 0.5; // grace note 1 frame before the downbeat at frame 4
  src[4] = 1; // downbeat
  src[13] = 0.25; // tail past the 8-frame loop -> wraps to index 1
  src[19] = 0.125; // second wrap -> index 7
  const [out] = foldLoop([src], 4, 8, 2);
  assert.equal(out.length, 8);
  assert.equal(out[0], 1);
  assert.equal(out[7], 0.5 + 0.125);
  assert.equal(out[1], 0.25);
  const wav = encodeWav([out, out], 44100);
  const bytes = new Uint8Array(wav instanceof ArrayBuffer ? wav : await wav.arrayBuffer());
  assert.equal(bytes.length, 44 + 8 * 2 * 2);
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), "WAVE");
});
