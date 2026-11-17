// Backbeat — UI controller.

import { FAMILIES, LEVELS, VOICES } from "./kit.js";
import {
  LENGTH_OPTIONS,
  MAX_STEPS,
  PATTERN_COUNT,
  PATTERN_NAMES,
  PRESETS,
  applyPreset,
  clonePattern,
  decodeState,
  defaultState,
  encodeState,
  levelOf,
  makeCode,
  modOf,
  patternIsEmpty,
  sanitizeState,
} from "./patterns.js";
import { DrumEngine, PROCESSING_DELAY, SampleBank } from "./engine.js";
import { Transport } from "./transport.js";
import { buildMidi, renderWav } from "./export.js";

const STORE_KEY = "backbeat-drums-v1";
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = loadInitialState();
let brush = 3; // step code to paint
let clipboard = null;
let undoSnapshot = null;

function loadInitialState() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const shared = hash.get("s");
  if (shared) {
    const decoded = decodeState(shared);
    history.replaceState(null, "", location.pathname + location.search);
    if (decoded) {
      queueMicrotask(() => toast("Loaded the shared beat."));
      return decoded;
    }
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch {
    /* ignore corrupt or blocked storage */
  }
  return defaultState();
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, 250);
}

const pattern = () => state.patterns[state.current];
const rowByKey = (key) => state.rows.find((r) => r.key === key);

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC({ latencyHint: "interactive" });
const bank = new SampleBank(new URL("../samples", import.meta.url).href);
const engine = new DrumEngine(ctx, bank);
const transport = new Transport(() => ctx, engine, () => state, {
  onPattern: (i) => {
    if (state.chain || i !== state.current) {
      state.current = i;
      renderPatterns();
      renderGrid();
    }
  },
});

if (navigator.audioSession) {
  // iOS 17+: play through the silent switch like a music app
  try {
    navigator.audioSession.type = "playback";
  } catch {
    /* unsupported */
  }
}

function syncEngine() {
  engine.apply({ room: state.room, glue: state.glue, master: state.master, perspective: state.perspective });
  for (const row of state.rows) engine.setRow(row.key, row);
}

// The mix-bus compressors start fully clamped and settle ~0.1 s after the
// audio clock starts running, so the first hits wait for that.
let warmUntil = ctx.state === "running" ? ctx.currentTime + 0.15 : Infinity;
function noteRunning() {
  if (ctx.state === "running" && warmUntil === Infinity) warmUntil = ctx.currentTime + 0.15;
}
const earliest = () => (warmUntil === Infinity ? ctx.currentTime + 0.15 : warmUntil);

let unlocked = false;
async function unlockAudio() {
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      /* resume needs a gesture */
    }
  }
  noteRunning();
  if (!unlocked) {
    // a silent buffer fully unlocks output on older iOS
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start();
    unlocked = true;
  }
}

// voices used by rows, the active patterns first
function neededVoices() {
  const used = new Set();
  const rest = new Set();
  for (const row of state.rows) {
    const inUse = state.patterns.some((p) => p.grid[row.key].slice(0, p.length).some((c) => c));
    (inUse ? used : rest).add(row.voice);
  }
  for (const v of used) rest.delete(v);
  return { used: [...used], rest: [...rest] };
}

let loadState = { done: 0, total: 1, ready: false, error: null };

async function loadKit() {
  const playBtn = $("playBtn");
  playBtn.classList.add("loading");
  try {
    await bank.loadMeta();
    const { used, rest } = neededVoices();
    const firstTotal = bank.fileCount(used);
    loadState = { done: 0, total: Math.max(1, firstTotal), ready: false, error: null };
    updateLoading();
    await bank.load(ctx, used, () => {
      loadState.done += 1;
      updateLoading();
    });
    loadState.ready = true;
    playBtn.classList.remove("loading");
    playBtn.disabled = false;
    updateLoading();
    await bank.load(ctx, rest);
    renderHint();
  } catch (err) {
    console.error(err);
    loadState.error = err;
    playBtn.classList.remove("loading");
    renderHint();
    toast("The drum samples could not be loaded. Check your connection and reload the page.", 6000);
  }
}

function updateLoading() {
  const p = loadState.done / loadState.total;
  $("playBtn").style.setProperty("--progress", String(p));
  renderHint();
}

async function ensureVoice(id) {
  if (bank.isReady(id)) return;
  await bank.load(ctx, [id]);
}

/** Free decoded audio for voices that no row uses any more. */
function releaseUnused() {
  const inUse = new Set(state.rows.map((r) => r.voice));
  for (const id of Object.keys(bank.voices)) if (!inUse.has(id)) bank.release(id);
}

function audition(rowKey, vel = 0.82) {
  unlockAudio();
  const row = rowByKey(rowKey);
  if (!row) return;
  if (!bank.isReady(row.voice)) {
    ensureVoice(row.voice).then(() =>
      engine.trigger(row.voice, row.key, Math.max(ctx.currentTime + 0.01, earliest()), vel),
    );
    return;
  }
  engine.trigger(row.voice, row.key, Math.max(ctx.currentTime + 0.005, earliest()), vel);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
async function togglePlay() {
  if (!loadState.ready) return;
  await unlockAudio();
  if (transport.playing) {
    transport.stop();
  } else {
    transport.start(earliest());
  }
  renderPlay();
  renderPatterns();
}

function renderPlay() {
  const b = $("playBtn");
  b.classList.toggle("playing", transport.playing);
  b.setAttribute("aria-label", transport.playing ? "Stop" : "Play");
}

// tap tempo
let taps = [];
function tap() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 5) taps.shift();
  $("tapBtn").classList.remove("flash");
  void $("tapBtn").offsetWidth;
  $("tapBtn").classList.add("flash");
  if (taps.length >= 2) {
    const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    setBpm(Math.round(60000 / iv));
  }
}

function setBpm(v) {
  state.bpm = Math.min(260, Math.max(30, Math.round(v) || state.bpm));
  $("bpm").value = state.bpm;
  markCustom();
  save();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const cellEls = new Map(); // rowKey -> [buttons]
const ledEls = new Map();
const rulerEls = [];

function buildGrid() {
  const grid = $("grid");
  grid.textContent = "";
  cellEls.clear();
  ledEls.clear();
  rulerEls.length = 0;

  const ruler = document.createElement("div");
  ruler.className = "grid-row ruler";
  const blank = document.createElement("div");
  blank.className = "row-head blank";
  const msPlaceholder = document.createElement("div");
  msPlaceholder.className = "row-ms";
  ruler.append(blank, msPlaceholder);
  for (let s = 0; s < MAX_STEPS; s++) {
    const c = document.createElement("div");
    c.className = "ruler-cell";
    ruler.append(c);
    rulerEls.push(c);
  }
  grid.append(ruler);

  let lastFamily = null;
  for (const row of state.rows) {
    const meta = VOICES[row.voice];
    const fam = FAMILIES[meta.family];
    const el = document.createElement("div");
    el.className = "grid-row";
    el.dataset.row = row.key;
    if (lastFamily && familyGroup(meta.family) !== lastFamily) el.classList.add("family-start");
    lastFamily = familyGroup(meta.family);
    el.style.setProperty("--c", fam.color);

    const head = document.createElement("div");
    head.className = "row-head";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "row-name";
    name.dataset.action = "audition";
    name.title = `${meta.name} — tap to listen`;
    const led = document.createElement("span");
    led.className = "led";
    const txt = document.createElement("span");
    txt.className = "txt";
    txt.textContent = meta.short;
    name.append(led, txt);
    const more = document.createElement("button");
    more.type = "button";
    more.className = "row-more";
    more.dataset.action = "edit";
    more.setAttribute("aria-label", `${meta.name} settings`);
    more.textContent = "⋯";
    head.append(name, more);
    ledEls.set(row.key, led);

    const ms = document.createElement("div");
    ms.className = "row-ms";
    for (const [cls, label, title] of [
      ["m", "M", "Mute"],
      ["s", "S", "Solo"],
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `ms ${cls}`;
      b.dataset.action = cls === "m" ? "mute" : "solo";
      b.textContent = label;
      b.title = `${title} ${meta.name}`;
      b.setAttribute("aria-pressed", "false");
      ms.append(b);
    }

    el.append(head, ms);
    const cells = [];
    for (let s = 0; s < MAX_STEPS; s++) {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "cell";
      c.dataset.step = String(s);
      c.tabIndex = -1;
      el.append(c);
      cells.push(c);
    }
    cellEls.set(row.key, cells);
    grid.append(el);
  }
  renderGrid();
}

function familyGroup(f) {
  return f === "snare" || f === "kick" ? "drums" : f;
}

function renderGrid() {
  const p = pattern();
  const grid = $("grid");
  grid.style.setProperty("--steps", String(p.length));
  const anySolo = state.rows.some((r) => r.solo);
  for (const row of state.rows) {
    const rowEl = grid.querySelector(`[data-row="${row.key}"]`);
    const meta = VOICES[row.voice];
    rowEl.style.setProperty("--c", FAMILIES[meta.family].color);
    rowEl.querySelector(".row-name .txt").textContent = meta.short;
    rowEl.querySelector(".row-name").title = `${meta.name} — tap to listen`;
    rowEl.classList.toggle("muted", row.mute);
    rowEl.classList.toggle("dimmed", anySolo && !row.solo);
    rowEl.querySelector(".ms.m").setAttribute("aria-pressed", String(row.mute));
    rowEl.querySelector(".ms.s").setAttribute("aria-pressed", String(row.solo));
    const cells = cellEls.get(row.key);
    const data = p.grid[row.key];
    for (let s = 0; s < MAX_STEPS; s++) {
      const c = cells[s];
      const code = data[s];
      c.classList.toggle("out", s >= p.length);
      const beatIdx = Math.floor(s / p.division);
      c.classList.toggle("alt", beatIdx % 2 === 1);
      c.classList.toggle("beat-start", s % p.division === 0);
      if (code) {
        c.dataset.l = String(levelOf(code));
        c.dataset.m = String(modOf(code));
      } else {
        delete c.dataset.l;
        delete c.dataset.m;
      }
      c.setAttribute("aria-label", cellLabel(meta, s, code, p));
    }
  }
  rulerEls.forEach((r, s) => {
    const onBeat = s % p.division === 0;
    r.style.display = s < p.length ? "" : "none";
    r.classList.toggle("beat", onBeat);
    r.textContent = onBeat ? String(s / p.division + 1) : p.division === 4 && s % 2 === 0 ? "·" : "";
  });
  $("lengthSel").value = String(p.length);
  $("divisionSel").value = String(p.division);
  renderPatterns();
  lastNow = -1;
}

function cellLabel(meta, s, code, p) {
  const beat = Math.floor(s / p.division) + 1;
  const sub = (s % p.division) + 1;
  const what = code
    ? `${LEVELS[levelOf(code)].label}${modOf(code) === 1 ? " flam" : modOf(code) === 2 ? " roll" : ""}`
    : "empty";
  return `${meta.short}, beat ${beat}.${sub}: ${what}`;
}

function renderPatterns() {
  const wrap = $("patterns");
  if (!wrap.childElementCount) {
    for (let i = 0; i < PATTERN_COUNT; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pat-btn";
      b.textContent = PATTERN_NAMES[i];
      b.dataset.i = String(i);
      b.title = `Pattern ${PATTERN_NAMES[i]} (${i + 1})`;
      wrap.append(b);
    }
  }
  [...wrap.children].forEach((b, i) => {
    b.setAttribute("aria-pressed", String(i === state.current));
    b.classList.toggle("has-notes", !patternIsEmpty(state.patterns[i]));
    b.classList.toggle("queued", transport.playing && transport.queued === i);
    b.classList.toggle("live", transport.playing && (transport.livePattern ?? transport.pattern) === i);
  });
  $("chainBtn").setAttribute("aria-pressed", String(state.chain));
}

function renderControls() {
  $("bpm").value = state.bpm;
  setRange("swing", Math.round(state.swing * 100), `${Math.round(state.swing * 100)}%`);
  setRange("humanize", Math.round(state.humanize * 100), `${Math.round(state.humanize * 100)}%`);
  setRange("room", Math.round(state.room * 100), `${Math.round(state.room * 100)}%`);
  setRange("glue", Math.round(state.glue * 100), `${Math.round(state.glue * 100)}%`);
  setRange("master", Math.round(state.master * 100), `${Math.round(state.master * 100)}%`);
  for (const b of $("perspective").children) b.setAttribute("aria-checked", String(b.dataset.v === state.perspective));
  $("preset").value = state.presetId && PRESETS.some((p) => p.id === state.presetId) ? state.presetId : "custom";
}

function setRange(id, value, text) {
  const el = $(id);
  el.value = value;
  updateFill(el);
  const out = $(`${id}Out`);
  if (out) out.textContent = text;
}

function updateFill(el) {
  const min = Number(el.min);
  const max = Number(el.max);
  el.style.setProperty("--fill", `${((Number(el.value) - min) / (max - min)) * 100}%`);
}

function renderHint() {
  const h = $("hint");
  if (loadState.error) {
    h.textContent = "The drum samples could not be loaded. Check your connection and reload the page.";
  } else if (!loadState.ready) {
    h.textContent = `Loading the drum kit… ${Math.round((loadState.done / loadState.total) * 100)}%`;
  } else {
    h.textContent = isTouch()
      ? "Tap a step to add a hit with the selected dynamic, and tap it again to remove it. Tap a drum name to hear it, or ⋯ for its settings."
      : "Click or drag across steps to add hits with the selected dynamic. Click a hit again, or Shift-click, to remove it. Click a drum name to hear it.";
  }
}

const isTouch = () => matchMedia("(pointer: coarse)").matches;

const BRUSHES = [
  { code: 1, label: "Ghost", h: "30%", o: 0.75 },
  { code: 2, label: "Soft", h: "55%", o: 0.88 },
  { code: 3, label: "Normal", h: "80%", o: 1 },
  { code: 4, label: "Accent", h: "100%", o: 1 },
  { sep: true },
  { code: 13, label: "Flam", h: "80%", o: 1, cls: "flam" },
  { code: 23, label: "Roll", h: "80%", o: 1, cls: "roll" },
];

function buildBrushes() {
  const wrap = $("brushes");
  for (const b of BRUSHES) {
    if (b.sep) {
      const s = document.createElement("span");
      s.className = "brush-sep";
      wrap.append(s);
      continue;
    }
    const el = document.createElement("button");
    el.type = "button";
    el.className = "brush";
    el.setAttribute("role", "radio");
    el.dataset.code = String(b.code);
    const sw = document.createElement("span");
    sw.className = `swatch ${b.cls ?? ""}`;
    sw.style.setProperty("--h", b.h);
    sw.style.setProperty("--o", String(b.o));
    const t = document.createElement("span");
    t.className = "txt";
    t.textContent = b.label;
    el.append(sw, t);
    wrap.append(el);
  }
  renderBrushes();
}

function renderBrushes() {
  for (const el of $("brushes").querySelectorAll(".brush")) {
    el.setAttribute("aria-checked", String(Number(el.dataset.code) === brush));
  }
}

function buildSelects() {
  const preset = $("preset");
  for (const p of PRESETS) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.name} · ${p.bpm}`;
    preset.append(o);
  }
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Your beat";
  preset.append(custom);

  const len = $("lengthSel");
  for (const n of LENGTH_OPTIONS) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = String(n);
    len.append(o);
  }

  const voice = $("rowVoice");
  for (const [fid, fam] of Object.entries(FAMILIES)) {
    const g = document.createElement("optgroup");
    g.label = fam.label;
    for (const [vid, v] of Object.entries(VOICES)) {
      if (v.family !== fid) continue;
      const o = document.createElement("option");
      o.value = vid;
      o.textContent = v.name;
      g.append(o);
    }
    voice.append(g);
  }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
function markCustom() {
  if (state.presetId !== null) {
    state.presetId = null;
    $("preset").value = "custom";
  }
}

function setCell(rowKey, step, code) {
  const p = pattern();
  if (p.grid[rowKey][step] === code) return false;
  p.grid[rowKey][step] = code;
  const c = cellEls.get(rowKey)[step];
  if (code) {
    c.dataset.l = String(levelOf(code));
    c.dataset.m = String(modOf(code));
  } else {
    delete c.dataset.l;
    delete c.dataset.m;
  }
  c.setAttribute("aria-label", cellLabel(VOICES[rowByKey(rowKey).voice], step, code, p));
  markCustom();
  renderPatterns();
  save();
  return true;
}

let drag = null;

function onGridPointerDown(e) {
  const cell = e.target.closest(".cell");
  if (!cell || e.button > 0) return;
  const rowKey = cell.closest(".grid-row").dataset.row;
  const step = Number(cell.dataset.step);
  const current = pattern().grid[rowKey][step];
  const erase = e.shiftKey || current === brush;
  const code = erase ? 0 : brush;
  if (e.pointerType === "touch") {
    drag = { touch: true, rowKey, step, code, x: e.clientX, y: e.clientY };
    return;
  }
  e.preventDefault();
  drag = { touch: false, code, rowKey };
  applyCell(rowKey, step, code);
}

function onGridPointerMove(e) {
  if (!drag || drag.touch) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest && el.closest(".cell");
  if (!cell) return;
  const rowKey = cell.closest(".grid-row").dataset.row;
  applyCell(rowKey, Number(cell.dataset.step), drag.code, false);
}

function onGridPointerUp(e) {
  if (drag && drag.touch) {
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (moved < 10) applyCell(drag.rowKey, drag.step, drag.code);
  }
  drag = null;
}

function applyCell(rowKey, step, code, sound = true) {
  if (step >= pattern().length) return;
  const changed = setCell(rowKey, step, code);
  if (changed && code && sound && !transport.playing) {
    audition(rowKey, LEVELS[levelOf(code)].vel);
  }
}

function onGridKey(e) {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const rowEl = cell.closest(".grid-row");
  const rowKey = rowEl.dataset.row;
  const step = Number(cell.dataset.step);
  const p = pattern();
  const idx = state.rows.findIndex((r) => r.key === rowKey);
  let target = null;
  if (e.key === "ArrowRight") target = [idx, (step + 1) % p.length];
  else if (e.key === "ArrowLeft") target = [idx, (step - 1 + p.length) % p.length];
  else if (e.key === "ArrowDown") target = [Math.min(state.rows.length - 1, idx + 1), step];
  else if (e.key === "ArrowUp") target = [Math.max(0, idx - 1), step];
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    const cur = p.grid[rowKey][step];
    applyCell(rowKey, step, cur === brush ? 0 : brush);
    return;
  } else if (e.key === "Backspace" || e.key === "Delete") {
    setCell(rowKey, step, 0);
    return;
  }
  if (target) {
    e.preventDefault();
    focusCell(state.rows[target[0]].key, target[1]);
  }
}

function focusCell(rowKey, step) {
  for (const cells of cellEls.values()) for (const c of cells) c.tabIndex = -1;
  const c = cellEls.get(rowKey)[step];
  c.tabIndex = 0;
  c.focus();
}

function onRowAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const rowKey = btn.closest(".grid-row")?.dataset.row;
  if (!rowKey) return;
  const row = rowByKey(rowKey);
  switch (btn.dataset.action) {
    case "audition":
      audition(rowKey);
      break;
    case "edit":
      openRowDialog(rowKey);
      break;
    case "mute":
      row.mute = !row.mute;
      renderGrid();
      save();
      break;
    case "solo":
      row.solo = !row.solo;
      renderGrid();
      save();
      break;
    default:
  }
}

function selectPattern(i) {
  if (i === state.current && !transport.playing) return;
  state.current = i;
  if (transport.playing) transport.queue(i);
  renderGrid();
  save();
}

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

function restore(snap) {
  const voicesBefore = state.rows.map((r) => r.voice).join();
  state = sanitizeState(snap);
  if (state.rows.map((r) => r.voice).join() !== voicesBefore) {
    syncEngine();
    bank.load(ctx, state.rows.map((r) => r.voice)).catch(() => {});
  }
  renderControls();
  renderGrid();
  syncEngine();
  save();
}

function loadPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  undoSnapshot = snapshot();
  state = applyPreset(state, preset);
  if (transport.playing) {
    transport.pattern = 0;
    transport.queued = null;
  }
  syncEngine();
  bank.load(ctx, state.rows.map((r) => r.voice)).catch(() => {});
  releaseUnused();
  renderControls();
  renderGrid();
  save();
  toast(`Loaded ${preset.name}.`, 4000, "Undo", () => restore(undoSnapshot));
}

// ---------------------------------------------------------------------------
// Row dialog
// ---------------------------------------------------------------------------
let dialogRow = null;

function openRowDialog(rowKey) {
  dialogRow = rowKey;
  renderRowDialog();
  const d = $("rowDialog");
  if (typeof d.showModal === "function") d.showModal();
  else d.setAttribute("open", "");
}

function renderRowDialog() {
  const row = rowByKey(dialogRow);
  if (!row) return;
  $("rowTitle").textContent = VOICES[row.voice].name;
  $("rowVoice").value = row.voice;
  $("rowVol").value = row.vol;
  updateFill($("rowVol"));
  $("rowVolOut").textContent = `${row.vol > 0 ? "+" : ""}${row.vol.toFixed(1)} dB`;
  $("rowPan").value = Math.round(row.pan * 100);
  updateFill($("rowPan"));
  const pan = Math.round(row.pan * 100);
  $("rowPanOut").textContent = pan === 0 ? "Centre" : pan < 0 ? `${-pan} L` : `${pan} R`;
  $("rowMute").setAttribute("aria-pressed", String(row.mute));
  $("rowSolo").setAttribute("aria-pressed", String(row.solo));
  const p = pattern();
  $("rowDialog").querySelector('[data-fill="half"]').textContent = p.division === 4 ? "Every 8th" : "Shuffle";
}

function rowFill(kind) {
  const row = rowByKey(dialogRow);
  const p = pattern();
  const lvl = brush || 3;
  for (let s = 0; s < p.length; s++) {
    let on = false;
    if (kind === "beat") on = s % p.division === 0;
    else if (kind === "half") on = p.division === 4 ? s % 2 === 0 : s % 3 !== 1;
    else on = true;
    let code = on ? lvl : 0;
    // a touch of natural accent on the beat for repeated strokes
    if (on && kind !== "beat" && levelOf(lvl) === 3 && s % p.division !== 0) code = 2;
    p.grid[row.key][s] = code;
  }
  markCustom();
  renderGrid();
  save();
}

function rowShift(dir) {
  const p = pattern();
  const data = p.grid[dialogRow];
  const part = data.slice(0, p.length);
  const rotated = dir > 0 ? [part[part.length - 1], ...part.slice(0, -1)] : [...part.slice(1), part[0]];
  for (let s = 0; s < p.length; s++) data[s] = rotated[s];
  markCustom();
  renderGrid();
  save();
}

// ---------------------------------------------------------------------------
// Export / share
// ---------------------------------------------------------------------------
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function baseName() {
  const preset = PRESETS.find((p) => p.id === state.presetId);
  const name = (preset ? preset.name : "my-beat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `backbeat-${name}-${state.bpm}bpm`;
}

async function exportWav() {
  const btn = $("wavBtn");
  if (btn.disabled) return;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "Rendering…";
  try {
    await bank.load(ctx, state.rows.map((r) => r.voice));
    const blob = await renderWav(bank, state, { repeats: state.chain ? 2 : 4 });
    download(blob, `${baseName()}.wav`);
    toast(state.chain ? "WAV exported as a seamless loop of the chain, played twice." : "WAV exported as a seamless 4-bar loop.", 3600);
  } catch (err) {
    console.error(err);
    toast("The WAV could not be rendered in this browser.");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function exportMidi() {
  const bytes = buildMidi(state, { repeats: 1 });
  download(new Blob([bytes], { type: "audio/midi" }), `${baseName()}.mid`);
  toast("MIDI exported. It uses General MIDI drum notes on channel 10.");
}

async function share() {
  const url = `${location.origin}${location.pathname}#s=${encodeState(state)}`;
  try {
    if (navigator.share && isTouch()) {
      await navigator.share({ title: "My Backbeat drum pattern", url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast("Link copied. Anyone with it can open your beat.");
  } catch (err) {
    if (err && err.name === "AbortError") return;
    window.prompt("Copy this link:", url);
  }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg, ms = 2600, actionLabel = null, action = null) {
  const t = $("toast");
  t.textContent = msg;
  t.style.pointerEvents = "none";
  if (actionLabel) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = actionLabel;
    b.addEventListener("click", () => {
      action();
      t.classList.remove("show");
    });
    t.append(" ", b);
    t.style.pointerEvents = "auto";
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    t.style.pointerEvents = "none";
  }, ms);
}

// ---------------------------------------------------------------------------
// Animation: playhead, LEDs, meter
// ---------------------------------------------------------------------------
const pendingHits = [];
engine.onHit = (rowKey, when) => {
  if (pendingHits.length < 256) pendingHits.push({ rowKey, when });
};

let lastNow = -1;
let lastPattern = -1;
const meter = $("meter");
const mctx = meter.getContext("2d");
const meterBuf = new Float32Array(engine.analyser ? engine.analyser.fftSize : 0);
let meterLevel = 0;

function frame() {
  const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + PROCESSING_DELAY;
  const t = ctx.currentTime - latency;

  if (transport.playing) {
    const pos = transport.positionAt(t);
    if (pos) {
      const step = pos.pattern === state.current ? pos.step : -1;
      if (step !== lastNow) {
        moveHead(step);
        lastNow = step;
      }
      if (pos.pattern !== lastPattern) {
        lastPattern = pos.pattern;
        transport.livePattern = pos.pattern;
        renderPatterns();
      }
    }
  } else if (lastNow !== -1) {
    moveHead(-1);
    lastNow = -1;
    lastPattern = -1;
    transport.livePattern = null;
    renderPatterns();
  }

  for (let i = pendingHits.length - 1; i >= 0; i--) {
    const h = pendingHits[i];
    if (h.when <= t) {
      const led = ledEls.get(h.rowKey);
      if (led) {
        led.classList.add("on");
        clearTimeout(led._t);
        led._t = setTimeout(() => led.classList.remove("on"), 70);
      }
      pendingHits.splice(i, 1);
    } else if (h.when - t > 2) {
      pendingHits.splice(i, 1);
    }
  }

  if (engine.analyser && meter.offsetParent) {
    engine.analyser.getFloatTimeDomainData(meterBuf);
    let pk = 0;
    for (let i = 0; i < meterBuf.length; i++) pk = Math.max(pk, Math.abs(meterBuf[i]));
    const db = 20 * Math.log10(pk + 1e-6);
    const lvl = Math.max(0, Math.min(1, (db + 48) / 48));
    meterLevel = lvl > meterLevel ? lvl : meterLevel * 0.9 + lvl * 0.1;
    const w = meter.width;
    const h = meter.height;
    mctx.clearRect(0, 0, w, h);
    const g = mctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#8fd8c4");
    g.addColorStop(0.75, "#ffb44a");
    g.addColorStop(1, "#ff7a66");
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, Math.round(w * meterLevel), h);
  }
  requestAnimationFrame(frame);
}

function moveHead(step) {
  for (const cells of cellEls.values()) {
    if (lastNow >= 0) cells[lastNow].classList.remove("now");
    if (step >= 0) cells[step].classList.add("now");
  }
  rulerEls.forEach((r, i) => r.classList.toggle("now", i === step));
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function bindRange(id, apply, fmt) {
  const el = $(id);
  el.addEventListener("input", () => {
    updateFill(el);
    apply(Number(el.value));
    $(`${id}Out`).textContent = fmt(Number(el.value));
    save();
  });
}

function wire() {
  $("playBtn").addEventListener("click", togglePlay);
  $("bpm").addEventListener("change", (e) => setBpm(Number(e.target.value)));
  $("bpmDown").addEventListener("click", () => setBpm(state.bpm - 1));
  $("bpmUp").addEventListener("click", () => setBpm(state.bpm + 1));
  $("tapBtn").addEventListener("click", tap);

  bindRange("swing", (v) => ((state.swing = v / 100), markCustom()), (v) => `${v}%`);
  bindRange("humanize", (v) => (state.humanize = v / 100), (v) => `${v}%`);
  bindRange("room", (v) => ((state.room = v / 100), syncEngine()), (v) => `${v}%`);
  bindRange("glue", (v) => ((state.glue = v / 100), syncEngine()), (v) => `${v}%`);
  bindRange("master", (v) => ((state.master = v / 100), syncEngine()), (v) => `${v}%`);

  $("perspective").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.perspective = b.dataset.v;
    syncEngine();
    renderControls();
    save();
  });

  $("patterns").addEventListener("click", (e) => {
    const b = e.target.closest(".pat-btn");
    if (b) selectPattern(Number(b.dataset.i));
  });
  $("chainBtn").addEventListener("click", () => {
    state.chain = !state.chain;
    renderPatterns();
    save();
    if (state.chain && state.patterns.filter((p) => !patternIsEmpty(p)).length < 2) {
      toast("Chain plays every pattern that has notes, from A to D. Add notes to another pattern to hear it.", 4200);
    }
  });
  $("preset").addEventListener("change", (e) => {
    if (e.target.value !== "custom") loadPreset(e.target.value);
  });

  $("brushes").addEventListener("click", (e) => {
    const b = e.target.closest(".brush");
    if (!b) return;
    brush = Number(b.dataset.code);
    renderBrushes();
  });

  $("lengthSel").addEventListener("change", (e) => {
    pattern().length = Number(e.target.value);
    markCustom();
    renderGrid();
    save();
  });
  $("divisionSel").addEventListener("change", (e) => {
    const p = pattern();
    const div = Number(e.target.value);
    if (div === p.division) return;
    const map = div === 3 ? { 16: 12, 32: 24, 8: 12 } : { 12: 16, 24: 32 };
    p.division = div;
    if (map[p.length]) p.length = map[p.length];
    markCustom();
    renderGrid();
    save();
  });
  $("copyBtn").addEventListener("click", () => {
    clipboard = clonePattern(pattern());
    $("pasteBtn").disabled = false;
    toast(`Copied pattern ${PATTERN_NAMES[state.current]}.`);
  });
  $("pasteBtn").addEventListener("click", () => {
    if (!clipboard) return;
    undoSnapshot = snapshot();
    state.patterns[state.current] = clonePattern(clipboard);
    markCustom();
    renderGrid();
    save();
    toast(`Pasted into pattern ${PATTERN_NAMES[state.current]}.`, 3500, "Undo", () => restore(undoSnapshot));
  });
  $("clearBtn").addEventListener("click", () => {
    if (patternIsEmpty(pattern())) return;
    undoSnapshot = snapshot();
    const p = pattern();
    for (const k of Object.keys(p.grid)) p.grid[k].fill(0);
    markCustom();
    renderGrid();
    save();
    toast(`Cleared pattern ${PATTERN_NAMES[state.current]}.`, 4000, "Undo", () => restore(undoSnapshot));
  });

  const grid = $("grid");
  grid.addEventListener("pointerdown", onGridPointerDown);
  window.addEventListener("pointermove", onGridPointerMove);
  window.addEventListener("pointerup", onGridPointerUp);
  window.addEventListener("pointercancel", () => (drag = null));
  grid.addEventListener("click", onRowAction);
  grid.addEventListener("keydown", onGridKey);
  grid.addEventListener("focusin", (e) => {
    if (e.target.classList.contains("cell")) e.target.tabIndex = 0;
  });
  // keep one cell in the tab order
  cellEls.get(state.rows[0].key)[0].tabIndex = 0;

  // row dialog
  $("rowVoice").addEventListener("change", async (e) => {
    const row = rowByKey(dialogRow);
    row.voice = e.target.value;
    engine.setRow(row.key, row);
    renderGrid();
    renderRowDialog();
    save();
    try {
      await ensureVoice(row.voice);
      releaseUnused();
      audition(row.key);
    } catch {
      toast("That sound could not be loaded.");
    }
  });
  $("rowVol").addEventListener("input", (e) => {
    const row = rowByKey(dialogRow);
    row.vol = Number(e.target.value);
    engine.setRow(row.key, row);
    renderRowDialog();
    save();
  });
  $("rowPan").addEventListener("input", (e) => {
    const row = rowByKey(dialogRow);
    row.pan = Number(e.target.value) / 100;
    engine.setRow(row.key, row);
    renderRowDialog();
    save();
  });
  $("rowMute").addEventListener("click", () => {
    const row = rowByKey(dialogRow);
    row.mute = !row.mute;
    renderRowDialog();
    renderGrid();
    save();
  });
  $("rowSolo").addEventListener("click", () => {
    const row = rowByKey(dialogRow);
    row.solo = !row.solo;
    renderRowDialog();
    renderGrid();
    save();
  });
  $("rowPreview").addEventListener("click", () => audition(dialogRow));
  $("rowClear").addEventListener("click", () => {
    const p = pattern();
    p.grid[dialogRow].fill(0);
    markCustom();
    renderGrid();
    save();
  });
  $("rowDialog").addEventListener("click", (e) => {
    const fill = e.target.closest("[data-fill]");
    if (fill) rowFill(fill.dataset.fill);
    const shift = e.target.closest("[data-shift]");
    if (shift) rowShift(Number(shift.dataset.shift));
    if (e.target === $("rowDialog")) $("rowDialog").close();
  });
  $("aboutBtn").addEventListener("click", () => {
    const d = $("aboutDialog");
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  });
  $("aboutDialog").addEventListener("click", (e) => {
    if (e.target === $("aboutDialog")) $("aboutDialog").close();
  });

  $("wavBtn").addEventListener("click", exportWav);
  $("midiBtn").addEventListener("click", exportMidi);
  $("shareBtn").addEventListener("click", share);

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (document.querySelector("dialog[open]")) return;
    if (e.code === "Space") {
      if (e.target.classList?.contains("cell")) return;
      e.preventDefault();
      togglePlay();
    } else if (e.key === "t" || e.key === "T") {
      tap();
    } else if (/^[1-4]$/.test(e.key)) {
      selectPattern(Number(e.key) - 1);
    }
  });

  // first gesture anywhere unlocks audio (iOS)
  const unlockOnce = () => unlockAudio();
  window.addEventListener("pointerdown", unlockOnce, { once: true, capture: true });
  window.addEventListener("keydown", unlockOnce, { once: true, capture: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx.state !== "running" && transport.playing) ctx.resume();
  });
  if (ctx.addEventListener) {
    ctx.addEventListener("statechange", () => {
      noteRunning();
      if (ctx.state === "interrupted" && transport.playing) {
        transport.stop();
        renderPlay();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildSelects();
buildBrushes();
buildGrid();
renderControls();
renderPatterns();
renderHint();
syncEngine();
wire();
loadKit();
requestAnimationFrame(frame);

// for automated checks
window.__backbeat = { get state() { return state; }, engine, bank, transport, ctx };
