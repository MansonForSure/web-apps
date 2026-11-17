// Export: offline WAV bounce (same engine as live playback) and GM MIDI file.

import { LEVELS, VOICES } from "./kit.js";
import { FLAM_SECONDS, levelOf, modOf, patternIsEmpty, stepDuration, stepEvents } from "./patterns.js";
import { DrumEngine, PROCESSING_DELAY } from "./engine.js";

/** Pattern order for an export: one chain pass, or the current pattern. */
export function exportSequence(state) {
  if (!state.chain) return [state.current];
  const seq = [];
  for (let i = 0; i < state.patterns.length; i++) {
    const idx = (state.current + i) % state.patterns.length;
    if (!patternIsEmpty(state.patterns[idx])) seq.push(idx);
  }
  return seq.length ? seq : [state.current];
}

export function sequenceSeconds(state, seq) {
  return seq.reduce((t, i) => {
    const p = state.patterns[i];
    return t + p.length * stepDuration(state.bpm, p.division);
  }, 0);
}

/**
 * Fold a rendering into a seamless loop of exactly `bodyFrames` frames that
 * starts on the downbeat at `startFrame`: ringing tails after the loop end
 * wrap around to the start, and grace notes before the downbeat wrap to the
 * end, the same way they would sound when the loop repeats.
 */
export function foldLoop(channels, startFrame, bodyFrames, preFrames = 0) {
  return channels.map((src) => {
    const out = new Float32Array(bodyFrames);
    const from = Math.max(0, startFrame - preFrames);
    for (let i = from; i < src.length; i++) {
      const rel = i - startFrame;
      const idx = ((rel % bodyFrames) + bodyFrames) % bodyFrames;
      out[idx] += src[i];
    }
    return out;
  });
}

export async function renderWav(bank, state, { repeats = 4, tail = 5, sampleRate = 44100 } = {}) {
  const seq = exportSequence(state);
  // DynamicsCompressorNode starts fully clamped and releases over ~1 s, so
  // render a silent settling lead that is not part of the file.
  const settle = 1.2;
  const pre = 0.06; // room for flam grace notes and early humanized hits
  const lead = settle + pre;
  const body = sequenceSeconds(state, seq) * repeats;
  const total = lead + body + tail + PROCESSING_DELAY;
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(2, Math.ceil(total * sampleRate), sampleRate);
  const engine = new DrumEngine(ctx, bank);
  engine.apply({ room: state.room, glue: state.glue, master: state.master, perspective: state.perspective }, true);
  for (const row of state.rows) engine.setRow(row.key, row, true);
  let t = lead;
  for (let r = 0; r < repeats; r++) {
    for (const idx of seq) {
      const p = state.patterns[idx];
      const dur = stepDuration(state.bpm, p.division);
      for (let s = 0; s < p.length; s++) {
        const events = stepEvents(p, state.rows, s, { bpm: state.bpm, swing: state.swing, humanize: state.humanize });
        for (const e of events) engine.trigger(e.voice, e.rowKey, Math.max(0, t + e.offset), e.vel);
        t += dur;
      }
    }
  }
  const rendered = await ctx.startRendering();
  const channels = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c));
  const startFrame = Math.round((lead + PROCESSING_DELAY) * sampleRate);
  const bodyFrames = Math.round(body * sampleRate);
  const loop = foldLoop(channels, startFrame, bodyFrames, Math.round(pre * sampleRate));
  return encodeWav(loop, sampleRate);
}

/** 16-bit PCM WAV from Float32 channel arrays (TPDF dithered). */
export function encodeWav(data, sr) {
  const ch = data.length;
  const len = data[0].length;
  const bytes = 44 + len * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, len * ch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const d = (Math.random() - Math.random()) / 32768;
      const v = Math.max(-1, Math.min(1, data[c][i] + d));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return typeof Blob === "undefined" ? view.buffer : new Blob([view], { type: "audio/wav" });
}

// ---------------------------------------------------------------------------
// MIDI (type 0, channel 10, General MIDI drum map)
// ---------------------------------------------------------------------------
function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

export function buildMidi(state, { repeats = 1 } = {}) {
  const PPQ = 480;
  const seq = exportSequence(state);
  const anySolo = state.rows.some((r) => r.solo);
  const notes = [];
  let tick = 0;
  for (let r = 0; r < repeats; r++) {
    for (const idx of seq) {
      const p = state.patterns[idx];
      const tps = PPQ / p.division;
      const flamTicks = Math.round(FLAM_SECONDS * (state.bpm / 60) * PPQ);
      for (let s = 0; s < p.length; s++) {
        const swing = p.division === 4 && s % 2 === 1 ? Math.round((state.swing - 0.5) * 2 * tps) : 0;
        for (const row of state.rows) {
          if (row.mute || (anySolo && !row.solo)) continue;
          const code = p.grid[row.key]?.[s] ?? 0;
          if (!code) continue;
          const vel = LEVELS[levelOf(code)].vel;
          const gm = VOICES[row.voice].gm;
          const at = tick + swing;
          const len = Math.max(30, Math.round(tps / 2));
          const v127 = Math.max(1, Math.min(127, Math.round(vel * 127)));
          if (modOf(code) === 1) {
            notes.push({ at: Math.max(0, at - flamTicks), key: gm, vel: Math.round(v127 * 0.45), len: flamTicks });
            notes.push({ at, key: gm, vel: v127, len });
          } else if (modOf(code) === 2) {
            notes.push({ at, key: gm, vel: v127, len: Math.round(tps / 2) });
            notes.push({ at: at + Math.round(tps / 2), key: gm, vel: Math.round(v127 * 0.85), len: Math.round(tps / 2) });
          } else {
            notes.push({ at, key: gm, vel: v127, len });
          }
        }
        tick += tps;
      }
    }
  }
  const ev = [];
  for (const n of notes) {
    ev.push({ at: n.at, data: [0x99, n.key, n.vel] });
    ev.push({ at: n.at + n.len, data: [0x89, n.key, 0] });
  }
  ev.sort((a, b) => a.at - b.at || a.data[0] - b.data[0]);
  const track = [];
  const usPerQ = Math.round(60000000 / state.bpm);
  const name = [..."Backbeat drums"].map((c) => c.charCodeAt(0));
  track.push(0, 0xff, 0x03, name.length, ...name);
  track.push(0, 0xff, 0x51, 0x03, (usPerQ >> 16) & 0xff, (usPerQ >> 8) & 0xff, usPerQ & 0xff);
  const div = state.patterns[seq[0]].division;
  if (div === 3) track.push(0, 0xff, 0x58, 0x04, 12, 3, 24, 8);
  else track.push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8);
  let last = 0;
  for (const e of ev) {
    track.push(...vlq(e.at - last), ...e.data);
    last = e.at;
  }
  track.push(0, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const tl = track.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (tl >>> 24) & 0xff, (tl >>> 16) & 0xff, (tl >>> 8) & 0xff, tl & 0xff];
  return new Uint8Array([...header, ...trk, ...track]);
}
