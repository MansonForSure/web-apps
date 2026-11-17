// audio.js — every sound in Skyhop is synthesized with the Web Audio API. No audio files.
// Browsers only allow sound after a user gesture, so call unlock() from a click/tap/key.

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  // #region unlock
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      // A gentle compressor keeps overlapping sounds from clipping.
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      // One second of white noise, reused for thuds and whooshes.
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  // #endregion

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  // A single oscillator "blip" with a pitch sweep and a quick envelope.
  // #region tone
  tone({ type = 'sine', freq = 440, to = freq, dur = 0.15, vol = 0.2, delay = 0, attack = 0.005 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  // #endregion

  noise({ dur = 0.1, vol = 0.2, freq = 800, to = freq, q = 0.8, delay = 0, type = 'lowpass' }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  note(semitones, base = 523.25) {
    return base * 2 ** (semitones / 12);
  }

  jump() { this.tone({ type: 'square', freq: 300, to: 620, dur: 0.12, vol: 0.07 }); }
  land(strength = 0.5) { this.noise({ dur: 0.09, vol: 0.12 + strength * 0.2, freq: 500, to: 120 }); }
  // #region collect
  collect(combo = 0) {
    const step = PENTATONIC[Math.min(combo, PENTATONIC.length - 2)];
    this.tone({ type: 'triangle', freq: this.note(step), dur: 0.16, vol: 0.18 });
    this.tone({ type: 'sine', freq: this.note(step + 7), dur: 0.28, vol: 0.14, delay: 0.06 });
  }
  // #endregion
  stomp() {
    this.tone({ type: 'triangle', freq: 540, to: 110, dur: 0.18, vol: 0.25 });
    this.noise({ dur: 0.12, vol: 0.2, freq: 1500, to: 200 });
  }
  hurt() {
    this.tone({ type: 'sawtooth', freq: 240, to: 70, dur: 0.32, vol: 0.14 });
    this.noise({ dur: 0.2, vol: 0.15, freq: 900, to: 150 });
  }
  pad() { this.tone({ type: 'sine', freq: 180, to: 980, dur: 0.38, vol: 0.22 }); }
  crumble() { this.noise({ dur: 0.35, vol: 0.18, freq: 300, to: 60, q: 2 }); }
  fall() { this.tone({ type: 'sine', freq: 700, to: 90, dur: 0.6, vol: 0.12 }); }
  portalOpen() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ type: 'triangle', freq: this.note(s, 392), dur: 0.35, vol: 0.12, delay: i * 0.07 }));
    this.noise({ dur: 0.8, vol: 0.08, freq: 400, to: 4000, type: 'bandpass', q: 3 });
  }
  win() {
    [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone({ type: 'square', freq: this.note(s), dur: 0.16, vol: 0.06, delay: i * 0.1 }));
  }
  lose() {
    [7, 4, 0, -5].forEach((s, i) => this.tone({ type: 'triangle', freq: this.note(s, 392), dur: 0.3, vol: 0.14, delay: i * 0.16 }));
  }
  click() { this.tone({ type: 'square', freq: 900, to: 700, dur: 0.04, vol: 0.05 }); }
}
