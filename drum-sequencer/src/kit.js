// Voice metadata for the Naked Drums kit (Yamaha Recording Custom, multi-mic mix).
// Sample data lives in ../samples/kit.json; this file adds musical names,
// families, behaviour, and General MIDI mapping.

export const FAMILIES = {
  kick: { label: "Kick", color: "#ff8f45" },
  snare: { label: "Snare", color: "#ffc857" },
  hats: { label: "Hi-hats", color: "#8fd8c4" },
  toms: { label: "Toms", color: "#f07a62" },
  cymbals: { label: "Cymbals", color: "#c4b2ff" },
};

// short: grid label; name: full name; gm: General MIDI drum note.
// poly: simultaneous voices before the oldest is faded; choke: voice ids this voice silences.
// send: relative room-ambience send; trim: default mix trim in dB.
export const VOICES = {
  kick: { short: "Kick", name: "Kick 22″", family: "kick", gm: 36, poly: 3, send: 0.25, trim: 0 },
  snare1: { short: "Snare", name: "Snare 1 · crisp", family: "snare", gm: 38, poly: 4, send: 1, trim: -1.5 },
  snare2: { short: "Snare 2", name: "Snare 2 · deep", family: "snare", gm: 40, poly: 4, send: 1, trim: -1.5 },
  sidestick: { short: "X-stick", name: "Cross-stick", family: "snare", gm: 37, poly: 3, send: 0.8, trim: 3 },
  hh_closed: {
    short: "Hi-hat", name: "Hi-hat closed", family: "hats", gm: 42, poly: 3, send: 0.35, trim: 1,
    choke: ["hh_open", "hh_half"],
  },
  hh_tight: {
    short: "HH tight", name: "Hi-hat tight", family: "hats", gm: 42, poly: 3, send: 0.35, trim: 5,
    choke: ["hh_open", "hh_half"],
  },
  hh_half: {
    short: "HH half", name: "Hi-hat half-open", family: "hats", gm: 46, poly: 1, send: 0.45, trim: -1,
    choke: ["hh_open", "hh_half"],
  },
  hh_open: {
    short: "HH open", name: "Hi-hat open", family: "hats", gm: 46, poly: 1, send: 0.45, trim: -2,
    choke: ["hh_open", "hh_half"],
  },
  hh_pedal: {
    short: "HH foot", name: "Hi-hat foot", family: "hats", gm: 44, poly: 2, send: 0.3, trim: 4,
    choke: ["hh_open", "hh_half"],
  },
  tom1: { short: "Tom 10″", name: "Rack tom 10″", family: "toms", gm: 50, poly: 3, send: 0.9, trim: -1 },
  tom2: { short: "Tom 12″", name: "Rack tom 12″", family: "toms", gm: 48, poly: 3, send: 0.9, trim: -1 },
  tom3: { short: "Tom 13″", name: "Rack tom 13″", family: "toms", gm: 47, poly: 3, send: 0.9, trim: -1 },
  tom4: { short: "Tom 14″", name: "Floor tom 14″", family: "toms", gm: 45, poly: 3, send: 0.9, trim: -1 },
  tom5: { short: "Floor", name: "Floor tom 16″", family: "toms", gm: 43, poly: 3, send: 0.9, trim: -1 },
  ride: { short: "Ride", name: "Ride", family: "cymbals", gm: 51, poly: 4, send: 0.5, trim: 1.5 },
  ride_bell: { short: "Bell", name: "Ride bell", family: "cymbals", gm: 53, poly: 3, send: 0.5, trim: -1 },
  crash1: { short: "Crash L", name: "Crash left", family: "cymbals", gm: 49, poly: 3, send: 0.6, trim: -3 },
  crash2: { short: "Crash R", name: "Crash right", family: "cymbals", gm: 57, poly: 3, send: 0.6, trim: -3 },
  china: { short: "China", name: "China", family: "cymbals", gm: 52, poly: 3, send: 0.6, trim: -4 },
  splash: { short: "Splash", name: "Splash", family: "cymbals", gm: 55, poly: 3, send: 0.6, trim: -4 },
};

export const VOICE_ORDER = Object.keys(VOICES);

// Default rows. `key` is a stable row identifier used by presets.
export const DEFAULT_ROWS = [
  { key: "crash", voice: "crash1" },
  { key: "crash2", voice: "crash2" },
  { key: "ride", voice: "ride" },
  { key: "bell", voice: "ride_bell" },
  { key: "oh", voice: "hh_open" },
  { key: "hh", voice: "hh_closed" },
  { key: "hf", voice: "hh_pedal" },
  { key: "t1", voice: "tom1" },
  { key: "t2", voice: "tom2" },
  { key: "ft", voice: "tom5" },
  { key: "xs", voice: "sidestick" },
  { key: "sn", voice: "snare1" },
  { key: "bd", voice: "kick" },
];

export const ROW_KEYS = DEFAULT_ROWS.map((r) => r.key);

// Velocity levels painted in the grid. Values are 0..1; they select a
// recorded velocity layer and set the playback level.
export const LEVELS = {
  1: { id: "ghost", label: "Ghost", vel: 0.2 },
  2: { id: "soft", label: "Soft", vel: 0.5 },
  3: { id: "normal", label: "Normal", vel: 0.78 },
  4: { id: "accent", label: "Accent", vel: 1.0 },
};

export const MODIFIERS = {
  0: { id: "none", label: "" },
  1: { id: "flam", label: "Flam" },
  2: { id: "roll", label: "Roll" },
};

/**
 * Loudness curve applied on top of the recorded layer (layers are recorded at
 * matched peak level, like the original sampler, which uses amp_veltrack).
 * Returns decibels; 1.0 -> 0 dB, 0.78 -> -2.8 dB, 0.2 -> about -18 dB.
 */
export function velocityDb(vel) {
  const v = Math.min(1, Math.max(0.02, vel));
  return 26 * Math.log10(v);
}

/** Select a velocity layer index the way the SFZ ranges do (equal splits). */
export function layerForVelocity(layerCount, vel) {
  const v127 = Math.round(Math.min(1, Math.max(0, vel)) * 127);
  const idx = Math.floor(((Math.max(1, v127) - 1) / 127) * layerCount);
  return Math.min(layerCount - 1, Math.max(0, idx));
}
