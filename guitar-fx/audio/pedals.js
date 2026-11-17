import { DRIVE_DOMAIN, dbToGain, driveGain, driveMakeup, fromUnit, makeDriveCurve, makeReverbImpulse } from './dsp.js';

const TIME_CONSTANT = 0.02;

/** Smoothly move an AudioParam (or set it instantly when building the graph). */
export function glide(ctx, param, value, tc = TIME_CONSTANT, immediate = false) {
  if (!param || !Number.isFinite(value)) return;
  if (immediate) { param.value = value; return; }
  param.setTargetAtTime(value, ctx.currentTime, tc);
}

const gainNode = (ctx, value = 1) => { const node = ctx.createGain(); node.gain.value = value; return node; };
const filter = (ctx, type, frequency, q = 0.707, gain = 0) => {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  node.gain.value = gain;
  return node;
};
const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes; };
const pct = value => value / 100;

function workletPedal(ctx, processor, keyMap = {}) {
  const node = new AudioWorkletNode(ctx, processor);
  return {
    input: node,
    output: node,
    set(key, value, immediate) { glide(ctx, node.parameters.get(keyMap[key] || key), value, 0.01, immediate); },
  };
}

export const PEDALS = [
  {
    id: 'gate', name: 'Noise Gate', short: 'Gate', kind: 'Dynamics', color: '#b8c0cc',
    params: [
      { key: 'threshold', label: 'Thresh', min: -90, max: -20, def: -62, unit: 'db' },
      { key: 'release', label: 'Release', min: 10, max: 500, def: 90, unit: 'ms', scale: 'log' },
    ],
    create: ctx => workletPedal(ctx, 'stompbox-gate'),
  },
  {
    id: 'comp', name: 'Compressor', short: 'Comp', kind: 'Sustain', color: '#5aa2ff',
    params: [
      { key: 'threshold', label: 'Thresh', min: -50, max: 0, def: -26, unit: 'db' },
      { key: 'ratio', label: 'Ratio', min: 1.5, max: 20, def: 4, unit: 'ratio', scale: 'log' },
      { key: 'attack', label: 'Attack', min: 0.5, max: 80, def: 10, unit: 'ms', scale: 'log' },
      { key: 'level', label: 'Level', min: 0, max: 24, def: 6, unit: 'db' },
    ],
    create: ctx => workletPedal(ctx, 'stompbox-comp', { level: 'makeup' }),
  },
  {
    id: 'wah', name: 'Auto-Wah', short: 'Wah', kind: 'Envelope filter', color: '#ff6f91',
    params: [
      { key: 'sensitivity', label: 'Sens', min: 0, max: 10, def: 6, unit: 'num' },
      { key: 'range', label: 'Range', min: 600, max: 5000, def: 2200, unit: 'hz', scale: 'log' },
      { key: 'resonance', label: 'Reso', min: 1, max: 12, def: 5, unit: 'num', scale: 'log' },
    ],
    create: ctx => workletPedal(ctx, 'stompbox-wah'),
  },
  {
    id: 'drive', name: 'Drive', short: 'Drive', kind: 'Overdrive · distortion · fuzz', color: '#ff8a3d',
    modes: [{ id: 'overdrive', label: 'OD' }, { id: 'distortion', label: 'DIST' }, { id: 'fuzz', label: 'FUZZ' }],
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 10, def: 5, unit: 'num' },
      { key: 'tone', label: 'Tone', min: 0, max: 10, def: 5, unit: 'num' },
      { key: 'level', label: 'Level', min: -12, max: 12, def: 0, unit: 'db' },
    ],
    create(ctx, state) {
      const VOICING = { overdrive: { hp: 220, mid: 5 }, distortion: { hp: 110, mid: 2 }, fuzz: { hp: 70, mid: -1 } };
      const hp = filter(ctx, 'highpass', 160, 0.6);
      const mid = filter(ctx, 'peaking', 780, 0.8, 3);
      const pre = gainNode(ctx, 0.05);
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '4x';
      const dc = filter(ctx, 'highpass', 25, 0.7);
      const tone = filter(ctx, 'lowpass', 4000, 0.5);
      const post = gainNode(ctx, 0.5);
      chain(hp, mid, pre, shaper, dc, tone, post);
      const curves = {};
      const values = { ...state.params };
      let mode = state.mode || 'overdrive';
      const refresh = immediate => {
        const amount = driveGain(mode, values.drive);
        glide(ctx, pre.gain, amount / DRIVE_DOMAIN, 0.03, immediate);
        glide(ctx, post.gain, dbToGain(values.level) * driveMakeup(mode, amount), 0.03, immediate);
        glide(ctx, tone.frequency, fromUnit(values.tone / 10, { min: 900, max: 9000, scale: 'log' }), 0.03, immediate);
      };
      return {
        input: hp,
        output: post,
        set(key, value, immediate) { values[key] = value; refresh(immediate); },
        setMode(next, immediate) {
          mode = VOICING[next] ? next : 'overdrive';
          curves[mode] ??= makeDriveCurve(mode);
          shaper.curve = curves[mode];
          glide(ctx, hp.frequency, VOICING[mode].hp, 0.03, immediate);
          glide(ctx, mid.gain, VOICING[mode].mid, 0.03, immediate);
          refresh(immediate);
        },
      };
    },
  },
  {
    id: 'amp', name: 'Amp EQ', short: 'EQ', kind: 'Tone stack', color: '#f4c04e',
    params: [
      { key: 'bass', label: 'Bass', min: -12, max: 12, def: 0, unit: 'db' },
      { key: 'mid', label: 'Mid', min: -12, max: 12, def: 0, unit: 'db' },
      { key: 'treble', label: 'Treble', min: -12, max: 12, def: 0, unit: 'db' },
      { key: 'level', label: 'Level', min: -12, max: 12, def: 0, unit: 'db' },
    ],
    create(ctx) {
      const bass = filter(ctx, 'lowshelf', 110);
      const mid = filter(ctx, 'peaking', 700, 0.7);
      const treble = filter(ctx, 'highshelf', 3200);
      const level = gainNode(ctx);
      chain(bass, mid, treble, level);
      const map = { bass: bass.gain, mid: mid.gain, treble: treble.gain };
      return {
        input: bass,
        output: level,
        set(key, value, immediate) {
          if (key === 'level') glide(ctx, level.gain, dbToGain(value), TIME_CONSTANT, immediate);
          else glide(ctx, map[key], value, TIME_CONSTANT, immediate);
        },
      };
    },
  },
  {
    id: 'cab', name: 'Cabinet', short: 'Cab', kind: '4×12 speaker sim', color: '#c9925c',
    params: [
      { key: 'body', label: 'Body', min: 0, max: 8, def: 3, unit: 'db' },
      { key: 'bright', label: 'Bright', min: 2200, max: 8000, def: 4800, unit: 'hz', scale: 'log' },
    ],
    create(ctx) {
      const hp = filter(ctx, 'highpass', 85, 0.8);
      const body = filter(ctx, 'peaking', 120, 1.1, 3);
      const boxy = filter(ctx, 'peaking', 450, 1.2, -3);
      const presence = filter(ctx, 'peaking', 2400, 1.4, 2.5);
      const lp1 = filter(ctx, 'lowpass', 4800, 0.9);
      const lp2 = filter(ctx, 'lowpass', 6000, 0.6);
      const out = gainNode(ctx, 1.15);
      chain(hp, body, boxy, presence, lp1, lp2, out);
      return {
        input: hp,
        output: out,
        set(key, value, immediate) {
          if (key === 'body') glide(ctx, body.gain, value, TIME_CONSTANT, immediate);
          if (key === 'bright') { glide(ctx, lp1.frequency, value, TIME_CONSTANT, immediate); glide(ctx, lp2.frequency, value * 1.25, TIME_CONSTANT, immediate); }
        },
      };
    },
  },
  {
    id: 'phaser', name: 'Phaser', short: 'Phase', kind: '4-stage sweep', color: '#b48cff',
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 6, def: 0.5, unit: 'hzlfo', scale: 'log' },
      { key: 'depth', label: 'Depth', min: 0, max: 10, def: 6, unit: 'num' },
      { key: 'color', label: 'Color', min: 200, max: 2400, def: 700, unit: 'hz', scale: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, def: 70, unit: 'pct' },
    ],
    create(ctx) {
      const input = gainNode(ctx);
      const dry = gainNode(ctx, 0.65);
      const wet = gainNode(ctx, 0.35);
      const out = gainNode(ctx);
      const spread = [1, 1.45, 2.3, 3.5];
      const stages = spread.map(m => filter(ctx, 'allpass', 700 * m, 0.6));
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.5;
      const sweep = gainNode(ctx, 1400);
      chain(input, dry, out);
      chain(input, ...stages, wet, out);
      lfo.connect(sweep);
      stages.forEach(stage => sweep.connect(stage.detune));
      lfo.start();
      return {
        input,
        output: out,
        set(key, value, immediate) {
          if (key === 'rate') glide(ctx, lfo.frequency, value, 0.05, immediate);
          if (key === 'depth') glide(ctx, sweep.gain, value * 240, 0.05, immediate);
          if (key === 'color') stages.forEach((stage, i) => glide(ctx, stage.frequency, value * spread[i], 0.05, immediate));
          if (key === 'mix') { const m = pct(value) * 0.5; glide(ctx, dry.gain, 1 - m, TIME_CONSTANT, immediate); glide(ctx, wet.gain, m, TIME_CONSTANT, immediate); }
        },
      };
    },
  },
  {
    id: 'chorus', name: 'Chorus', short: 'Chorus', kind: 'Stereo ensemble', color: '#35d6c0',
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 6, def: 0.8, unit: 'hzlfo', scale: 'log' },
      { key: 'depth', label: 'Depth', min: 0, max: 10, def: 5, unit: 'num' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, def: 50, unit: 'pct' },
    ],
    create(ctx) {
      const input = gainNode(ctx);
      const dry = gainNode(ctx, 0.85);
      const wet = gainNode(ctx, 0.5);
      const out = gainNode(ctx);
      const left = ctx.createDelay(0.05);
      const right = ctx.createDelay(0.05);
      left.delayTime.value = 0.012;
      right.delayTime.value = 0.014;
      const merger = ctx.createChannelMerger(2);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.8;
      const modLeft = gainNode(ctx, 0.0025);
      const modRight = gainNode(ctx, -0.0025);
      chain(input, dry, out);
      input.connect(left); input.connect(right);
      left.connect(merger, 0, 0); right.connect(merger, 0, 1);
      chain(merger, wet, out);
      lfo.connect(modLeft).connect(left.delayTime);
      lfo.connect(modRight).connect(right.delayTime);
      lfo.start();
      return {
        input,
        output: out,
        set(key, value, immediate) {
          if (key === 'rate') glide(ctx, lfo.frequency, value, 0.05, immediate);
          if (key === 'depth') { const d = 0.0004 + value * 0.00045; glide(ctx, modLeft.gain, d, 0.05, immediate); glide(ctx, modRight.gain, -d, 0.05, immediate); }
          if (key === 'mix') { glide(ctx, dry.gain, 1 - pct(value) * 0.3, TIME_CONSTANT, immediate); glide(ctx, wet.gain, pct(value), TIME_CONSTANT, immediate); }
        },
      };
    },
  },
  {
    id: 'tremolo', name: 'Tremolo', short: 'Trem', kind: 'Amplitude LFO', color: '#a6e35c',
    modes: [{ id: 'sine', label: 'SMOOTH' }, { id: 'square', label: 'CHOP' }],
    params: [
      { key: 'rate', label: 'Rate', min: 1, max: 14, def: 5, unit: 'hzlfo', scale: 'log' },
      { key: 'depth', label: 'Depth', min: 0, max: 100, def: 60, unit: 'pct' },
    ],
    create(ctx, state) {
      const vca = gainNode(ctx, 0.7);
      const lfo = ctx.createOscillator();
      const smooth = filter(ctx, 'lowpass', 400, 0.5);
      const depth = gainNode(ctx, 0.3);
      chain(lfo, smooth, depth);
      depth.connect(vca.gain);
      lfo.start();
      let amount = pct(state.params.depth ?? 60) * 0.96;
      return {
        input: vca,
        output: vca,
        set(key, value, immediate) {
          if (key === 'rate') glide(ctx, lfo.frequency, value, 0.05, immediate);
          if (key === 'depth') { amount = pct(value) * 0.96; glide(ctx, vca.gain, 1 - amount / 2, TIME_CONSTANT, immediate); glide(ctx, depth.gain, amount / 2, TIME_CONSTANT, immediate); }
        },
        setMode(mode, immediate) {
          lfo.type = mode === 'square' ? 'square' : 'sine';
          glide(ctx, smooth.frequency, mode === 'square' ? 45 : 400, TIME_CONSTANT, immediate);
        },
      };
    },
  },
  {
    id: 'delay', name: 'Delay', short: 'Delay', kind: 'Analog-style echo', color: '#3fb8ff', tap: true,
    params: [
      { key: 'time', label: 'Time', min: 40, max: 1500, def: 360, unit: 'ms', scale: 'log' },
      { key: 'feedback', label: 'Repeats', min: 0, max: 90, def: 35, unit: 'pct' },
      { key: 'tone', label: 'Tone', min: 800, max: 10000, def: 3500, unit: 'hz', scale: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, def: 30, unit: 'pct' },
    ],
    create(ctx) {
      const input = gainNode(ctx);
      const out = gainNode(ctx);
      const line = ctx.createDelay(2);
      line.delayTime.value = 0.36;
      const tone = filter(ctx, 'lowpass', 3500, 0.5);
      const lowCut = filter(ctx, 'highpass', 90, 0.5);
      const feedback = gainNode(ctx, 0.35);
      const wet = gainNode(ctx, 0.3);
      input.connect(out);
      chain(input, line, tone, wet, out);
      chain(tone, lowCut, feedback, line);
      return {
        input,
        output: out,
        set(key, value, immediate) {
          if (key === 'time') glide(ctx, line.delayTime, value / 1000, 0.06, immediate);
          if (key === 'feedback') glide(ctx, feedback.gain, pct(value), TIME_CONSTANT, immediate);
          if (key === 'tone') glide(ctx, tone.frequency, value, TIME_CONSTANT, immediate);
          if (key === 'mix') glide(ctx, wet.gain, pct(value), TIME_CONSTANT, immediate);
        },
      };
    },
  },
  {
    id: 'reverb', name: 'Reverb', short: 'Verb', kind: 'Stereo room · hall', color: '#8f8cff',
    params: [
      { key: 'decay', label: 'Decay', min: 0.3, max: 8, def: 2.2, unit: 's', scale: 'log' },
      { key: 'tone', label: 'Tone', min: 1500, max: 14000, def: 6000, unit: 'hz', scale: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, def: 25, unit: 'pct' },
    ],
    create(ctx, state) {
      const input = gainNode(ctx);
      const out = gainNode(ctx);
      const lowCut = filter(ctx, 'highpass', 140, 0.6);
      const tone = filter(ctx, 'lowpass', 6000, 0.5);
      const wet = gainNode(ctx, 0.25);
      input.connect(out);
      input.connect(lowCut);
      chain(tone, wet, out);
      let current = null;
      let timer = 0;
      const load = (seconds, immediate) => {
        const channels = makeReverbImpulse(ctx.sampleRate, seconds);
        const buffer = ctx.createBuffer(2, channels[0].length, ctx.sampleRate);
        channels.forEach((data, c) => buffer.getChannelData(c).set(data));
        const convolver = ctx.createConvolver();
        convolver.normalize = true;
        convolver.buffer = buffer;
        const level = gainNode(ctx, immediate ? 1 : 0);
        chain(lowCut, convolver, level, tone);
        if (!immediate) glide(ctx, level.gain, 1, 0.06);
        const previous = current;
        current = { convolver, level };
        if (previous) {
          glide(ctx, previous.level.gain, 0, 0.06);
          setTimeout(() => { lowCut.disconnect(previous.convolver); previous.level.disconnect(); }, 400);
        }
      };
      load(state.params.decay ?? 2.2, true);
      return {
        input,
        output: out,
        set(key, value, immediate) {
          if (key === 'decay' && !immediate) { clearTimeout(timer); timer = setTimeout(() => load(value, false), 180); }
          if (key === 'tone') glide(ctx, tone.frequency, value, TIME_CONSTANT, immediate);
          if (key === 'mix') glide(ctx, wet.gain, pct(value) * 1.2, TIME_CONSTANT, immediate);
        },
        dispose() { clearTimeout(timer); },
      };
    },
  },
];

export const PEDAL_BY_ID = Object.fromEntries(PEDALS.map(def => [def.id, def]));
