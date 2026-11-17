// Real-time AudioWorklet processors for Stompbox. Self-contained (no imports) so
// every browser can load it with audioWorklet.addModule(). None of these use
// lookahead, so they add no latency beyond the browser's normal audio buffer.

const LN10_OVER_20 = Math.LN10 / 20;
const dbToGain = db => Math.exp(db * LN10_OVER_20);
const timeCoef = (ms, rate) => Math.exp(-1 / (Math.max(ms, 0.01) * 0.001 * rate));
const param = (params, name) => params[name][0];

function linkedPeak(input, i) {
  let peak = 0;
  for (let c = 0; c < input.length; c++) {
    const v = input[c][i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  return peak;
}

function silence(output) {
  for (let c = 0; c < output.length; c++) output[c].fill(0);
}

class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -62, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 90, minValue: 5, maxValue: 2000, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.gain = 0;
    this.hold = 0;
    this.isOpen = false;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) { silence(output); this.env = 0; this.gain = 0; this.isOpen = false; return true; }
    const openLevel = dbToGain(param(params, 'threshold'));
    const closeLevel = openLevel * 0.5; // 6 dB hysteresis avoids chatter on decaying notes
    const envRelease = timeCoef(25, sampleRate);
    const attack = timeCoef(0.6, sampleRate);
    const release = timeCoef(param(params, 'release'), sampleRate);
    const holdSamples = Math.round(0.035 * sampleRate);
    const frames = output[0].length;
    for (let i = 0; i < frames; i++) {
      const peak = linkedPeak(input, i);
      this.env = peak > this.env ? peak : this.env * envRelease;
      if (this.env >= openLevel) { this.isOpen = true; this.hold = holdSamples; }
      else if (this.env < closeLevel) { if (this.hold > 0) this.hold--; else this.isOpen = false; }
      const target = this.isOpen ? 1 : 0;
      this.gain = target + (this.gain - target) * (target > this.gain ? attack : release);
      if (this.gain < 1e-6 && !this.isOpen) this.gain = 0;
      for (let c = 0; c < output.length; c++) output[c][i] = (input[c] || input[0])[i] * this.gain;
    }
    return true;
  }
}

class CompressorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -24, minValue: -60, maxValue: 0, automationRate: 'k-rate' },
      { name: 'ratio', defaultValue: 4, minValue: 1, maxValue: 30, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 8, minValue: 0.1, maxValue: 200, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 180, minValue: 10, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'makeup', defaultValue: 6, minValue: -24, maxValue: 30, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.reduction = 0; // smoothed gain reduction in dB (≤ 0)
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) { silence(output); this.reduction = 0; return true; }
    const threshold = param(params, 'threshold');
    const slope = 1 / Math.max(1, param(params, 'ratio')) - 1;
    const attack = timeCoef(param(params, 'attack'), sampleRate);
    const release = timeCoef(param(params, 'release'), sampleRate);
    const makeup = param(params, 'makeup');
    const knee = 6;
    const frames = output[0].length;
    for (let i = 0; i < frames; i++) {
      const peak = linkedPeak(input, i);
      const over = 20 * Math.log10(peak > 1e-6 ? peak : 1e-6) - threshold;
      let target = 0;
      if (2 * over > knee) target = slope * over;
      else if (2 * over > -knee) target = (slope * (over + knee / 2) ** 2) / (2 * knee);
      const k = target < this.reduction ? attack : release;
      this.reduction = target + (this.reduction - target) * k;
      const gain = dbToGain(this.reduction + makeup);
      for (let c = 0; c < output.length; c++) output[c][i] = (input[c] || input[0])[i] * gain;
    }
    return true;
  }
}

// Envelope-controlled resonant band-pass (auto-wah). Topology-preserving SVF.
class WahProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'sensitivity', defaultValue: 6, minValue: 0, maxValue: 10, automationRate: 'k-rate' },
      { name: 'range', defaultValue: 2200, minValue: 400, maxValue: 6000, automationRate: 'k-rate' },
      { name: 'resonance', defaultValue: 5, minValue: 0.5, maxValue: 20, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.ic1 = new Float64Array(8);
    this.ic2 = new Float64Array(8);
    this.a1 = 1; this.a2 = 0; this.a3 = 0;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) { silence(output); this.env = 0; this.ic1.fill(0); this.ic2.fill(0); return true; }
    const sensGain = 0.6 * 80 ** (param(params, 'sensitivity') / 10);
    const fMin = 260;
    const fMax = Math.max(param(params, 'range'), fMin * 1.5);
    const resonance = Math.max(0.5, param(params, 'resonance'));
    const k = 1 / resonance;
    const makeup = 1.2 * resonance ** 0.28; // narrower bands pass less energy; keep loudness near unity
    const attack = timeCoef(4, sampleRate);
    const release = timeCoef(150, sampleRate);
    const frames = output[0].length;
    const channels = Math.min(output.length, 8);
    for (let i = 0; i < frames; i++) {
      const peak = linkedPeak(input, i);
      this.env = peak + (this.env - peak) * (peak > this.env ? attack : release);
      if ((i & 7) === 0) {
        const control = 1 - Math.exp(-this.env * sensGain);
        const fc = Math.min(fMin * (fMax / fMin) ** control, sampleRate * 0.45);
        const g = Math.tan((Math.PI * fc) / sampleRate);
        this.a1 = 1 / (1 + g * (g + k));
        this.a2 = g * this.a1;
        this.a3 = g * this.a2;
      }
      for (let c = 0; c < channels; c++) {
        const v0 = (input[c] || input[0])[i];
        const v3 = v0 - this.ic2[c];
        const v1 = this.a1 * this.ic1[c] + this.a2 * v3;
        const v2 = this.ic2[c] + this.a2 * this.ic1[c] + this.a3 * v3;
        this.ic1[c] = 2 * v1 - this.ic1[c];
        this.ic2[c] = 2 * v2 - this.ic2[c];
        output[c][i] = makeup * (2 * k * v1 + 0.15 * v2);
      }
    }
    for (let c = channels; c < output.length; c++) output[c].set(output[0]);
    if (!Number.isFinite(this.ic1[0]) || !Number.isFinite(this.ic2[0])) { this.ic1.fill(0); this.ic2.fill(0); }
    return true;
  }
}

// Output safety limiter: instant attack, smooth release, hard ceiling, NaN guard.
class LimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'ceiling', defaultValue: -1, minValue: -24, maxValue: 0, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 120, minValue: 10, maxValue: 2000, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.gain = 1;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) { silence(output); this.gain = 1; return true; }
    const ceiling = dbToGain(param(params, 'ceiling'));
    const release = timeCoef(param(params, 'release'), sampleRate);
    const frames = output[0].length;
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      let finite = true;
      for (let c = 0; c < input.length; c++) {
        const v = input[c][i];
        if (!Number.isFinite(v)) { finite = false; break; }
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      if (!finite) {
        for (let c = 0; c < output.length; c++) output[c][i] = 0;
        continue;
      }
      const target = peak > ceiling ? ceiling / peak : 1;
      this.gain = target < this.gain ? target : target + (this.gain - target) * release;
      for (let c = 0; c < output.length; c++) {
        const y = (input[c] || input[0])[i] * this.gain;
        output[c][i] = y > ceiling ? ceiling : y < -ceiling ? -ceiling : y;
      }
    }
    return true;
  }
}

registerProcessor('stompbox-gate', GateProcessor);
registerProcessor('stompbox-comp', CompressorProcessor);
registerProcessor('stompbox-wah', WahProcessor);
registerProcessor('stompbox-limiter', LimiterProcessor);
