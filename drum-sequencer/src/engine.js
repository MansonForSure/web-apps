// Sample bank (fetch + decode) and the drum engine (voices, chokes, mix bus).

import { VOICES, layerForVelocity, velocityDb } from "./kit.js";
import { createRoomImpulse } from "./reverb.js";

const dbToGain = (db) => Math.pow(10, db / 20);
// Headroom applied to every hit so a full kit hit together stays clean.
const HIT_HEADROOM_DB = -10;
// Look-ahead of the two DynamicsCompressorNodes (glue + limiter), 6 ms each in
// Blink/WebKit/Gecko. Used to align exports and the visual playhead.
export const PROCESSING_DELAY = 0.012;

/**
 * Finds where the transient starts. MP3 decoders differ in how much encoder
 * delay they remove, so the offset is measured on the decoded audio itself.
 */
export function measureOnset(buffer) {
  const sr = buffer.sampleRate;
  const scan = Math.min(buffer.length, Math.floor(sr * 0.25));
  let peak = 0;
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  for (const d of chans) for (let i = 0; i < scan; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak === 0) return 0;
  const thr = peak * 0.02;
  let first = scan;
  for (const d of chans) {
    for (let i = 0; i < first; i++) {
      if (Math.abs(d[i]) > thr) {
        first = i;
        break;
      }
    }
  }
  return Math.max(0, first - Math.floor(sr * 0.0012)) / sr;
}

export class SampleBank {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.meta = null;
    this.voices = {}; // id -> { gainDb, layers: [{ vel, buffers: [{buffer, offset}] }], ready }
    this.loading = new Map();
  }

  async loadMeta() {
    if (this.meta) return this.meta;
    const res = await fetch(`${this.baseUrl}/kit.json`, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Could not load the drum kit (HTTP ${res.status}).`);
    this.meta = await res.json();
    return this.meta;
  }

  isReady(id) {
    return Boolean(this.voices[id]?.ready);
  }

  /** Drop decoded audio for a voice (it reloads from the HTTP cache on demand). */
  release(id) {
    delete this.voices[id];
  }

  fileCount(ids) {
    return ids.reduce((n, id) => {
      const v = this.meta?.voices[id];
      return n + (v ? v.layers.reduce((m, l) => m + l.files.length, 0) : 0);
    }, 0);
  }

  /** Load voices with bounded concurrency; onFile(doneCount) after each file. */
  async load(ctx, ids, onFile = () => {}) {
    await this.loadMeta();
    const jobs = [];
    for (const id of ids) {
      if (this.isReady(id)) continue;
      if (this.loading.has(id)) {
        jobs.push(this.loading.get(id));
        continue;
      }
      const p = this._loadVoice(ctx, id, onFile);
      this.loading.set(id, p);
      jobs.push(p);
    }
    await Promise.all(jobs);
  }

  async _loadVoice(ctx, id, onFile) {
    const meta = this.meta.voices[id];
    if (!meta) throw new Error(`Unknown voice ${id}`);
    const layers = meta.layers.map((l) => ({ vel: l.vel, buffers: new Array(l.files.length) }));
    const tasks = [];
    meta.layers.forEach((l, li) =>
      l.files.forEach((file, fi) => tasks.push({ li, fi, url: `${this.baseUrl}/${id}/${file}` })),
    );
    await runPool(tasks, 4, async (t) => {
      const res = await fetch(t.url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Missing sample ${t.url} (HTTP ${res.status})`);
      const data = await res.arrayBuffer();
      const buffer = await decode(ctx, data);
      layers[t.li].buffers[t.fi] = { buffer, offset: measureOnset(buffer) };
      onFile();
    });
    this.voices[id] = { gainDb: meta.gainDb, layers, ready: true, last: layers.map(() => -1) };
    this.loading.delete(id);
  }
}

function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    // callback form for older Safari; promise form elsewhere
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

async function runPool(items, size, fn) {
  let i = 0;
  const workers = new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export class DrumEngine {
  /**
   * @param {BaseAudioContext} ctx  live AudioContext or OfflineAudioContext
   * @param {SampleBank} bank
   */
  constructor(ctx, bank) {
    this.ctx = ctx;
    this.bank = bank;
    this.rows = new Map(); // rowKey -> { input, panner, send, voice }
    this.active = new Map(); // voiceId -> [{src, gain, start}]
    this.settings = { room: 0.3, glue: 0.35, master: 0.8, perspective: "drummer" };
    this.onHit = null;
    this._build();
  }

  _build() {
    const ctx = this.ctx;
    this.drumBus = ctx.createGain();
    this.reverbIn = ctx.createGain();

    this.glue = ctx.createDynamicsCompressor();
    this.glue.knee.value = 8;
    this.glue.attack.value = 0.014;
    this.glue.release.value = 0.16;

    this.preShape = ctx.createGain();
    this.preShape.gain.value = 0.5;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = softClipCurve(1.4);
    this.shaper.oversample = "4x";
    this.postShape = ctx.createGain();
    this.postShape.gain.value = (2 * Math.tanh(1.4)) / 1.4;
    this.makeup = ctx.createGain();

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createRoomImpulse(ctx);
    this.reverbHp = ctx.createBiquadFilter();
    this.reverbHp.type = "highpass";
    this.reverbHp.frequency.value = 220;
    this.reverbTone = ctx.createBiquadFilter();
    this.reverbTone.type = "highshelf";
    this.reverbTone.frequency.value = 6000;
    this.reverbTone.gain.value = -4;
    this.reverbOut = ctx.createGain();

    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;

    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    this.output = ctx.createGain();

    this.drumBus.connect(this.glue);
    this.glue.connect(this.preShape);
    this.preShape.connect(this.shaper);
    this.shaper.connect(this.postShape);
    this.postShape.connect(this.makeup);
    this.makeup.connect(this.master);

    this.reverbIn.connect(this.reverbHp);
    this.reverbHp.connect(this.convolver);
    this.convolver.connect(this.reverbTone);
    this.reverbTone.connect(this.reverbOut);
    this.reverbOut.connect(this.master);

    this.master.connect(this.limiter);
    this.limiter.connect(this.splitter);
    this._wirePerspective("drummer");
    this.merger.connect(this.output);
    this.output.connect(ctx.destination);

    this.analyser = ctx.createAnalyser ? ctx.createAnalyser() : null;
    if (this.analyser) {
      this.analyser.fftSize = 1024;
      this.output.connect(this.analyser);
    }
    this.apply(this.settings, true);
  }

  _wirePerspective(p) {
    try {
      this.splitter.disconnect();
    } catch {
      /* not yet connected */
    }
    if (p === "audience") {
      this.splitter.connect(this.merger, 0, 1);
      this.splitter.connect(this.merger, 1, 0);
    } else {
      this.splitter.connect(this.merger, 0, 0);
      this.splitter.connect(this.merger, 1, 1);
    }
  }

  apply(settings, immediate = false) {
    const s = { ...this.settings, ...settings };
    const t = this.ctx.currentTime;
    const g = s.glue;
    const set = (param, v) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.02));
    set(this.glue.threshold, -4 - 20 * g);
    set(this.glue.ratio, 1.3 + 2.7 * g);
    set(this.makeup.gain, dbToGain(4 + 6 * g));
    set(this.reverbOut.gain, 0.9 * s.room * s.room + 0.15 * s.room);
    // perceptual master curve
    set(this.master.gain, Math.pow(s.master, 1.6) * 1.25);
    if (s.perspective !== this.settings.perspective) this._wirePerspective(s.perspective);
    this.settings = s;
  }

  /** Configure a row: { voice, vol (dB), pan (-1..1), mute } */
  setRow(key, { voice, vol = 0, pan = 0 }, immediate = false) {
    let row = this.rows.get(key);
    const ctx = this.ctx;
    if (!row) {
      immediate = true;
      const input = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const send = ctx.createGain();
      if (panner) {
        input.connect(panner);
        panner.connect(this.drumBus);
        panner.connect(send);
      } else {
        input.connect(this.drumBus);
        input.connect(send);
      }
      send.connect(this.reverbIn);
      row = { input, panner, send, voice };
      this.rows.set(key, row);
    }
    row.voice = voice;
    const meta = VOICES[voice];
    const t = ctx.currentTime;
    const set = (param, v) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.015));
    set(row.input.gain, dbToGain(vol + (meta?.trim ?? 0)));
    if (row.panner) set(row.panner.pan, pan);
    set(row.send.gain, meta ? meta.send : 0.5);
  }

  /** Schedule a hit. Returns true when the sample was available. */
  trigger(voiceId, rowKey, when, vel) {
    const voice = this.bank.voices[voiceId];
    const meta = VOICES[voiceId];
    const row = this.rows.get(rowKey);
    if (!voice?.ready || !meta || !row) return false;
    const ctx = this.ctx;
    const li = layerForVelocity(voice.layers.length, vel);
    const layer = voice.layers[li];
    const n = layer.buffers.length;
    let pick = Math.floor(Math.random() * n);
    if (n > 1 && pick === voice.last[li]) pick = (pick + 1 + Math.floor(Math.random() * (n - 1))) % n;
    voice.last[li] = pick;
    const { buffer, offset } = layer.buffers[pick];

    if (meta.choke) for (const c of meta.choke) this._choke(c, when);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // tiny natural pitch variation between strokes
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.004;
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(voice.gainDb + velocityDb(vel) + HIT_HEADROOM_DB);
    src.connect(gain);
    gain.connect(row.input);

    const list = this.active.get(voiceId) ?? [];
    list.push({ src, gain, start: when });
    while (list.length > meta.poly) {
      const old = list.shift();
      fadeOut(old, Math.max(when, ctx.currentTime), 0.09);
    }
    this.active.set(voiceId, list);
    src.onended = () => {
      const l = this.active.get(voiceId);
      if (l) {
        const i = l.findIndex((v) => v.src === src);
        if (i >= 0) l.splice(i, 1);
      }
      gain.disconnect();
    };
    src.start(Math.max(when, ctx.currentTime), offset);
    if (this.onHit) this.onHit(rowKey, when, vel);
    return true;
  }

  _choke(voiceId, when) {
    const list = this.active.get(voiceId);
    if (!list) return;
    for (const v of list.slice()) {
      if (v.start < when - 0.001) {
        fadeOut(v, when, 0.035);
        list.splice(list.indexOf(v), 1);
      }
    }
  }

  /** Fade out every sounding voice (transport stop). */
  silence(seconds = 0.12) {
    const t = this.ctx.currentTime;
    for (const list of this.active.values()) {
      for (const v of list) fadeOut(v, t, seconds);
      list.length = 0;
    }
  }
}

function fadeOut(v, when, seconds) {
  try {
    v.gain.gain.cancelScheduledValues(when);
    v.gain.gain.setTargetAtTime(0, when, seconds / 4);
    v.src.stop(when + seconds * 1.5);
  } catch {
    /* already stopped */
  }
}

function softClipCurve(k) {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}
