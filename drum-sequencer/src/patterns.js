// Pattern model, groove presets, serialization, and step timing.
// Pure module: no DOM or Web Audio, so it can be unit-tested in Node.

import { DEFAULT_ROWS, LEVELS, ROW_KEYS, VOICES } from "./kit.js";

export const MAX_STEPS = 32;
export const PATTERN_COUNT = 4;
export const PATTERN_NAMES = ["A", "B", "C", "D"];
export const LENGTH_OPTIONS = [8, 12, 16, 24, 32];
export const FLAM_SECONDS = 0.026;

// Step code: level (1 ghost .. 4 accent) + 10 * modifier (0 none, 1 flam, 2 roll).
export const levelOf = (code) => code % 10;
export const modOf = (code) => Math.floor(code / 10);
export const makeCode = (level, mod = 0) => (level ? level + 10 * mod : 0);

const CHAR_TO_CODE = {
  ".": 0, "-": 0,
  g: 1, s: 2, x: 3, X: 4,
  h: 12, f: 13, F: 14,
  q: 22, r: 23, R: 24,
  k: 11, l: 21,
};
const CODE_TO_CHAR = Object.fromEntries(
  Object.entries(CHAR_TO_CODE)
    .filter(([ch]) => ch !== "-")
    .map(([ch, code]) => [code, ch]),
);

export function parseSteps(str) {
  const out = new Array(MAX_STEPS).fill(0);
  [...str.replace(/\s+/g, "")].forEach((ch, i) => {
    if (i < MAX_STEPS) out[i] = CHAR_TO_CODE[ch] ?? 0;
  });
  return out;
}

export function stepsToString(steps, length = MAX_STEPS) {
  return steps
    .slice(0, length)
    .map((c) => CODE_TO_CHAR[c] ?? ".")
    .join("");
}

export function emptyGrid() {
  return Object.fromEntries(ROW_KEYS.map((k) => [k, new Array(MAX_STEPS).fill(0)]));
}

export function emptyPattern(length = 16, division = 4) {
  return { length, division, grid: emptyGrid() };
}

export function patternIsEmpty(p) {
  return Object.values(p.grid).every((row) => row.slice(0, p.length).every((c) => c === 0));
}

export function clonePattern(p) {
  return {
    length: p.length,
    division: p.division,
    grid: Object.fromEntries(Object.entries(p.grid).map(([k, v]) => [k, v.slice()])),
  };
}

// ---------------------------------------------------------------------------
// Presets. Rows: crash crash2 ride bell oh hh hf t1 t2 ft xs sn bd
// '.' rest · g ghost · s soft · x normal · X accent · f/F flam · r/R roll
// ---------------------------------------------------------------------------
export const PRESETS = [
  {
    id: "rock", name: "Rock", bpm: 100, swing: 0.5, length: 16, division: 4,
    patterns: [
      { hh: "X.x.X.x.X.x.X.x.", sn: "....X.......X...", bd: "X.......X.x....." },
      { hh: "X.x.X.x.X.x.X.x.", sn: "....X.......X..g", bd: "X.....x.X.x....." },
      { hh: "X.x.X.x.........", sn: "....X...XsxX....", t1: "............Xx..", ft: "..............XX", bd: "X.......X.....x." },
      { crash: "X...............", hh: "..x.X.x.X.x.X.x.", sn: "....X.......X...", bd: "X.......X.x....." },
    ],
  },
  {
    id: "funk", name: "Funk with ghost notes", bpm: 96, swing: 0.54, length: 16, division: 4,
    patterns: [
      { hh: "XsxsXsxsXsxsXs.s", oh: "..............x.", sn: ".g..X..g.g..X.g.", bd: "X.x....x..x....." },
      { hh: "XsxsXs.sXsxsXs.s", oh: "......x.......x.", sn: ".g..X..g.g..X.gg", bd: "X.x....x.xx....." },
      { hh: "XsxsXsxs........", sn: ".g..X..gXgxgXgxR", bd: "X.x....x..x...x." },
      { crash: "X...............", hh: "..xsXsxsXsxsXs.s", oh: "..............x.", sn: ".g..X..g.g..X.g.", bd: "X.x....x..x....." },
    ],
  },
  {
    id: "disco", name: "Four on the floor", bpm: 122, swing: 0.5, length: 16, division: 4,
    patterns: [
      { hh: "xs.sxs.sxs.sxs.s", oh: "..x...x...x...x.", sn: "....X.......X...", bd: "X...X...X...X..." },
      { hh: "xs.sxs.sxs.sxs.s", oh: "..x...x...x...x.", sn: "....X..g....X.g.", bd: "X...X...X...X..." },
      { hh: "xs.sxs.sxs.s....", oh: "..x...x...x.....", sn: "....X.......XxXx", bd: "X...X...X...X..." },
      { crash: "X...............", hh: ".s.sxs.sxs.sxs.s", oh: "..x...x...x...x.", sn: "....X.......X...", bd: "X...X...X...X..." },
    ],
  },
  {
    id: "boombap", name: "Boom bap", bpm: 90, swing: 0.58, length: 16, division: 4,
    patterns: [
      { hh: "X.s.x.s.X.s.x.s.", sn: "....X.......X...", bd: "X......x..X....." },
      { hh: "X.s.x.s.X.s.x...", oh: "..............x.", sn: "....X.......X..g", bd: "X......x.xX....." },
    ],
  },
  {
    id: "shuffle", name: "Half-time shuffle", bpm: 86, swing: 0.5, length: 12, division: 3,
    patterns: [
      { hh: "X.xX.xX.xX.x", sn: ".g..g.X...g.", bd: "X....x...x.." },
      { hh: "X.xX.xX.xX.x", sn: ".g..g.X..gg.", bd: "X.x..x...x.x" },
      { crash: "X...........", hh: "..xX.xX.xX.x", sn: ".g..g.X...g.", bd: "X....x...x.." },
    ],
  },
  {
    id: "bossa", name: "Bossa nova", bpm: 136, swing: 0.5, length: 32, division: 4,
    patterns: [
      {
        hh: "x.s.x.s.x.s.x.s.x.s.x.s.x.s.x.s.",
        xs: "X.....x.....x.......x.....x.....",
        bd: "X.....s.X.....s.X.....s.X.....s.",
      },
    ],
  },
  {
    id: "jazz", name: "Jazz swing", bpm: 150, swing: 0.5, length: 12, division: 3,
    patterns: [
      { ride: "x..X.xx..X.x", hf: "...x.....x..", sn: ".....g......", bd: "g..g..g..g.." },
      { ride: "x..X.xx..X.x", hf: "...x.....x..", sn: "..g.....g.s.", bd: "g..g..g..g.s" },
    ],
  },
  {
    id: "onedrop", name: "Reggae one drop", bpm: 74, swing: 0.5, length: 12, division: 3,
    patterns: [
      { hh: "x.sx.sx.sx.s", xs: "......X.....", bd: "......X....." },
      { hh: "x.sx.sx.sx..", oh: "...........x", xs: "......X.....", bd: "......X....." },
    ],
  },
  {
    id: "motown", name: "Motown", bpm: 106, swing: 0.5, length: 16, division: 4,
    patterns: [
      { hh: "x.s.x.s.x.s.x.s.", sn: "x...X...x...X...", bd: "X......xX......." },
      { hh: "x.s.x.s.x.s.x.s.", sn: "x...X...x...X.g.", bd: "X......xX.x....x" },
    ],
  },
  {
    id: "train", name: "Train beat", bpm: 120, swing: 0.5, length: 16, division: 4,
    patterns: [
      { hf: "....x.......x...", sn: "gsgsXsgsgsgsXsgs", bd: "X.......X......." },
    ],
  },
  {
    id: "metal", name: "Double-kick metal", bpm: 140, swing: 0.5, length: 16, division: 4,
    voices: { crash2: "china" },
    patterns: [
      { crash: "X...X...X...X...", sn: "....X.......X...", bd: "XxXxXxXxXxXxXxXx" },
      { crash2: "X.x.X.x.X.x.X.x.", sn: "....X.......X...", bd: "XxXxXxXxXxXxXxXx" },
      {
        crash: "X...X...........", sn: "....X...........", t1: "........XxXx....",
        t2: "............Xx..", ft: "..............XX", bd: "XxXxXxXxXxXxXxXx",
      },
    ],
  },
  {
    id: "breakbeat", name: "Breakbeat", bpm: 136, swing: 0.5, length: 32, division: 4,
    patterns: [
      {
        ride: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.",
        sn: "....X..g.g..X..g.g..X..g.g....X.",
        bd: "X.X.......XX....X.X.......X.....",
      },
    ],
  },
  {
    id: "afrobeat", name: "Afrobeat", bpm: 110, swing: 0.52, length: 16, division: 4,
    patterns: [
      { hh: "xsxsxsxsxsx.xsxs", oh: "...........x....", sn: "g..gX.g..g.gX.g.", bd: "X.....x...X..x.." },
    ],
  },
  {
    id: "ballad68", name: "6/8 ballad", bpm: 58, swing: 0.5, length: 12, division: 3,
    patterns: [
      { hh: "XssxssXssxss", sn: "...X.....X..", bd: "X....sX....." },
      { ride: "XssxssXssxss", sn: "...X.....X..", bd: "X....sX....s" },
    ],
  },
  {
    id: "dnb", name: "Drum & bass", bpm: 172, swing: 0.5, length: 16, division: 4,
    patterns: [
      { hh: "x.s.x.s.x.s.x.s.", sn: "....X..g....X...", bd: "X.........X....." },
      { hh: "x.s.x.s.x.s.x.s.", sn: "....X..g.g..X..g", bd: "X.X.......X..x.." },
    ],
  },
];

export function presetPatterns(preset) {
  const pats = [];
  for (let i = 0; i < PATTERN_COUNT; i++) {
    const p = emptyPattern(preset.length, preset.division);
    const src = preset.patterns[i];
    if (src) {
      for (const [key, str] of Object.entries(src)) {
        if (p.grid[key]) p.grid[key] = parseSteps(str);
      }
    }
    pats.push(p);
  }
  return pats;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export function defaultRows() {
  return DEFAULT_ROWS.map((r) => ({ key: r.key, voice: r.voice, vol: 0, pan: 0, mute: false, solo: false }));
}

export function defaultState() {
  const preset = PRESETS[0];
  return {
    v: 1,
    bpm: preset.bpm,
    swing: preset.swing,
    humanize: 0.35,
    room: 0.3,
    glue: 0.35,
    master: 0.8,
    perspective: "drummer",
    chain: false,
    current: 0,
    presetId: preset.id,
    rows: defaultRows(),
    patterns: presetPatterns(preset),
  };
}

export function applyPreset(state, preset) {
  return {
    ...state,
    bpm: preset.bpm,
    swing: preset.swing,
    presetId: preset.id,
    current: 0,
    chain: preset.patterns.length > 1 ? state.chain : false,
    rows: state.rows.map((row) => {
      const def = DEFAULT_ROWS.find((d) => d.key === row.key);
      const voice = preset.voices?.[row.key] ?? (def ? def.voice : row.voice);
      return { ...row, voice };
    }),
    patterns: presetPatterns(preset),
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Validate untrusted state (localStorage or share link) into a safe state. */
export function sanitizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const s = { ...base };
  s.bpm = clamp(Math.round(num(raw.bpm, base.bpm)), 30, 260);
  s.swing = clamp(num(raw.swing, base.swing), 0.5, 0.75);
  s.humanize = clamp(num(raw.humanize, base.humanize), 0, 1);
  s.room = clamp(num(raw.room, base.room), 0, 1);
  s.glue = clamp(num(raw.glue, base.glue), 0, 1);
  s.master = clamp(num(raw.master, base.master), 0, 1);
  s.perspective = raw.perspective === "audience" ? "audience" : "drummer";
  s.chain = Boolean(raw.chain);
  s.current = clamp(Math.round(num(raw.current, 0)), 0, PATTERN_COUNT - 1);
  s.presetId = typeof raw.presetId === "string" ? raw.presetId : null;
  if (Array.isArray(raw.rows)) {
    s.rows = base.rows.map((row) => {
      const r = raw.rows.find((x) => x && x.key === row.key);
      if (!r) return row;
      return {
        key: row.key,
        voice: VOICES[r.voice] ? r.voice : row.voice,
        vol: clamp(num(r.vol, 0), -36, 6),
        pan: clamp(num(r.pan, 0), -1, 1),
        mute: Boolean(r.mute),
        solo: Boolean(r.solo),
      };
    });
  }
  if (Array.isArray(raw.patterns)) {
    s.patterns = base.patterns.map((bp, i) => {
      const rp = raw.patterns[i];
      if (!rp || typeof rp !== "object") return emptyPattern(16, 4);
      const division = rp.division === 3 ? 3 : 4;
      const length = clamp(Math.round(num(rp.length, 16)), 1, MAX_STEPS);
      const grid = emptyGrid();
      if (rp.grid && typeof rp.grid === "object") {
        for (const key of ROW_KEYS) {
          const row = rp.grid[key];
          if (typeof row === "string") grid[key] = parseSteps(row);
          else if (Array.isArray(row)) {
            grid[key] = new Array(MAX_STEPS).fill(0).map((_, j) => {
              const c = Math.round(num(row[j], 0));
              return CODE_TO_CHAR[c] ? c : 0;
            });
          }
        }
      }
      return { length, division, grid };
    });
  }
  return s;
}

/** Compact, URL-safe serialisation for share links. */
export function encodeState(state) {
  const compact = {
    ...state,
    patterns: state.patterns.map((p) => ({
      length: p.length,
      division: p.division,
      grid: Object.fromEntries(
        Object.entries(p.grid)
          .filter(([, row]) => row.some((c) => c))
          .map(([k, row]) => [k, stepsToString(row).replace(/\.+$/, "")]),
      ),
    })),
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState(str) {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitizeState(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
export function stepDuration(bpm, division) {
  return 60 / bpm / division;
}

/** Deterministic, seedable PRNG (mulberry32). */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  // Box-Muller, clipped to +/-2.5 sigma
  const u = Math.max(1e-9, rng());
  const v = rng();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-2.5, Math.min(2.5, g));
}

/**
 * Compute the hits for one step.
 * Returns [{ rowKey, voice, offset, vel }] where offset is seconds relative
 * to the step's grid time (it may be negative for flam grace notes).
 */
export function stepEvents(pattern, rows, step, { bpm, swing = 0.5, humanize = 0, rng = Math.random }) {
  const division = pattern.division;
  const dur = stepDuration(bpm, division);
  const anySolo = rows.some((r) => r.solo);
  const swingOffset = division === 4 && step % 2 === 1 ? (swing - 0.5) * 2 * dur : 0;
  const out = [];
  for (const row of rows) {
    if (row.mute || (anySolo && !row.solo)) continue;
    const code = pattern.grid[row.key]?.[step] ?? 0;
    if (!code) continue;
    const level = LEVELS[levelOf(code)];
    if (!level) continue;
    const mod = modOf(code);
    const jitterT = humanize ? gaussian(rng) * humanize * 0.0065 : 0;
    const jitterV = humanize ? gaussian(rng) * humanize * 0.06 : 0;
    const vel = Math.min(1, Math.max(0.05, level.vel + jitterV));
    const base = swingOffset + jitterT;
    if (mod === 1) {
      out.push({ rowKey: row.key, voice: row.voice, offset: base - FLAM_SECONDS, vel: Math.max(0.12, vel * 0.42) });
      out.push({ rowKey: row.key, voice: row.voice, offset: base, vel });
    } else if (mod === 2) {
      const half = dur / 2;
      out.push({ rowKey: row.key, voice: row.voice, offset: base, vel: vel * 0.94 });
      const j2 = humanize ? gaussian(rng) * humanize * 0.004 : 0;
      out.push({ rowKey: row.key, voice: row.voice, offset: base + half + j2, vel: Math.max(0.1, vel * 0.82) });
    } else {
      out.push({ rowKey: row.key, voice: row.voice, offset: base, vel });
    }
  }
  return out;
}

/** Order in which patterns play: chain skips empty slots; otherwise loop current. */
export function nextPatternIndex(state, current, queued) {
  if (queued !== null && queued !== undefined) return queued;
  if (!state.chain) return current;
  for (let i = 1; i <= PATTERN_COUNT; i++) {
    const idx = (current + i) % PATTERN_COUNT;
    if (!patternIsEmpty(state.patterns[idx])) return idx;
  }
  return current;
}
