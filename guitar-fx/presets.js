// Each preset lists the pedals it switches on, with optional overrides.
// Pedals that are not listed are switched off and reset to their defaults.

export const PRESETS = [
  {
    id: 'clean', name: 'Clean', note: 'Glassy, lightly compressed clean',
    pedals: {
      comp: { params: { threshold: -28, ratio: 3, attack: 14, level: 5 } },
      amp: { params: { bass: 1, mid: 0, treble: 2, level: 0 } },
      reverb: { params: { decay: 1.8, tone: 7000, mix: 18 } },
    },
  },
  {
    id: 'crunch', name: 'Crunch', note: 'Edge-of-breakup rhythm',
    pedals: {
      gate: { params: { threshold: -62, release: 90 } },
      drive: { mode: 'overdrive', params: { drive: 5.5, tone: 5.5, level: -2 } },
      amp: { params: { bass: 2, mid: 2, treble: 1, level: 0 } },
      cab: { params: { body: 3, bright: 5000 } },
      reverb: { params: { decay: 1.4, tone: 6000, mix: 14 } },
    },
  },
  {
    id: 'lead', name: 'Lead', note: 'Singing distortion with echo',
    pedals: {
      gate: { params: { threshold: -58, release: 120 } },
      comp: { params: { threshold: -30, ratio: 4, attack: 20, level: 2 } },
      drive: { mode: 'distortion', params: { drive: 7, tone: 6, level: -5 } },
      amp: { params: { bass: 1, mid: 4, treble: 1, level: 0 } },
      cab: { params: { body: 4, bright: 4600 } },
      delay: { params: { time: 380, feedback: 32, tone: 3200, mix: 24 } },
      reverb: { params: { decay: 2.2, tone: 6000, mix: 18 } },
    },
  },
  {
    id: 'funk', name: 'Funk', note: 'Squashed auto-wah quack',
    pedals: {
      comp: { params: { threshold: -32, ratio: 6, attack: 4, level: 10 } },
      wah: { params: { sensitivity: 6.5, range: 2600, resonance: 6 } },
      amp: { params: { bass: -1, mid: -1, treble: 3, level: 0 } },
      reverb: { params: { decay: 1, tone: 8000, mix: 10 } },
    },
  },
  {
    id: 'ambient', name: 'Ambient', note: 'Wide shimmer and long tails',
    pedals: {
      comp: { params: { threshold: -24, ratio: 2.5, attack: 18, level: 3 } },
      chorus: { params: { rate: 0.4, depth: 6, mix: 40 } },
      delay: { params: { time: 520, feedback: 55, tone: 2800, mix: 38 } },
      reverb: { params: { decay: 6.5, tone: 5200, mix: 45 } },
    },
  },
  {
    id: 'surf', name: 'Surf', note: 'Bright trem and splashy verb',
    pedals: {
      amp: { params: { bass: -1, mid: 0, treble: 4, level: 2 } },
      tremolo: { mode: 'sine', params: { rate: 6.5, depth: 55 } },
      reverb: { params: { decay: 2.8, tone: 9000, mix: 38 } },
    },
  },
  {
    id: 'psych', name: 'Psych Fuzz', note: 'Fuzz, phaser and slapback',
    pedals: {
      gate: { params: { threshold: -55, release: 70 } },
      drive: { mode: 'fuzz', params: { drive: 6.5, tone: 4.5, level: -2 } },
      cab: { params: { body: 5, bright: 4200 } },
      phaser: { params: { rate: 0.35, depth: 7, color: 600, mix: 80 } },
      delay: { params: { time: 300, feedback: 25, tone: 3000, mix: 18 } },
    },
  },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map(preset => [preset.id, preset]));
