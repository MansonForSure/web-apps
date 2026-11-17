import { PEDALS } from './audio/pedals.js';
import { PRESET_BY_ID } from './presets.js';
import { clamp } from './audio/dsp.js';

export const SETTINGS_VERSION = 1;
export const DEFAULT_PRESET = 'clean';
export const CHANNELS = ['mix', 'left', 'right'];

export const MASTER_PARAMS = {
  input: { key: 'input', label: 'Input', min: -24, max: 30, def: 0, unit: 'db' },
  master: { key: 'master', label: 'Master', min: -48, max: 6, def: -6, unit: 'db' },
};

export function defaultPedal(def) {
  return {
    on: false,
    mode: def.modes ? def.modes[0].id : null,
    params: Object.fromEntries(def.params.map(p => [p.key, p.def])),
  };
}

/** Full pedal-state map for a preset (unlisted pedals off, at defaults). */
export function presetPedals(presetId) {
  const preset = PRESET_BY_ID[presetId] || PRESET_BY_ID[DEFAULT_PRESET];
  return Object.fromEntries(PEDALS.map(def => {
    const base = defaultPedal(def);
    const override = preset.pedals[def.id];
    if (!override) return [def.id, base];
    return [def.id, {
      on: true,
      mode: override.mode ?? base.mode,
      params: { ...base.params, ...(override.params || {}) },
    }];
  }));
}

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    preset: DEFAULT_PRESET,
    edited: false,
    input: MASTER_PARAMS.input.def,
    master: MASTER_PARAMS.master.def,
    channel: 'mix',
    deviceId: '',
    pedals: presetPedals(DEFAULT_PRESET),
  };
}

const number = (value, param) => (Number.isFinite(value) ? clamp(value, param.min, param.max) : param.def);

/** Accept stored settings defensively: unknown keys are dropped, values clamped. */
export function sanitizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object' || raw.version !== SETTINGS_VERSION) return base;
  const out = {
    ...base,
    preset: PRESET_BY_ID[raw.preset] ? raw.preset : base.preset,
    edited: Boolean(raw.edited),
    input: number(raw.input, MASTER_PARAMS.input),
    master: number(raw.master, MASTER_PARAMS.master),
    channel: CHANNELS.includes(raw.channel) ? raw.channel : 'mix',
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId.slice(0, 256) : '',
  };
  out.pedals = Object.fromEntries(PEDALS.map(def => {
    const stored = raw.pedals?.[def.id];
    const fallback = base.pedals[def.id];
    if (!stored || typeof stored !== 'object') return [def.id, fallback];
    return [def.id, {
      on: Boolean(stored.on),
      mode: def.modes?.some(m => m.id === stored.mode) ? stored.mode : fallback.mode,
      params: Object.fromEntries(def.params.map(p => [p.key, number(stored.params?.[p.key], p)])),
    }];
  }));
  return out;
}
