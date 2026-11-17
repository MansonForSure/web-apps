import { PEDALS, glide } from './pedals.js';
import { dbToGain } from './dsp.js';

const WORKLET_URL = new URL('./worklet.js?v=1', import.meta.url);
const SWITCH_TIME = 0.012;

export function loadProcessors(ctx) {
  return ctx.audioWorklet.addModule(WORKLET_URL);
}

/**
 * One pedal in the chain with a click-free crossfade bypass:
 *   input ─ dry ──────────────┐
 *     └── fx.input … fx.output ─ wet ─ output
 * The effect branch is disconnected while bypassed to save phone CPU.
 */
class PedalSlot {
  constructor(ctx, def, state) {
    this.ctx = ctx;
    this.def = def;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.fx = def.create(ctx, state);
    this.input.connect(this.dry).connect(this.output);
    this.fx.output.connect(this.wet).connect(this.output);
    this.linked = false;
    this.on = false;
    this.timer = 0;
    this.dry.gain.value = 1;
    this.wet.gain.value = 0;
    if (this.fx.setMode && state.mode) this.fx.setMode(state.mode, true);
    for (const [key, value] of Object.entries(state.params)) this.fx.set(key, value, true);
    this.setEnabled(Boolean(state.on), true);
  }

  setEnabled(on, immediate = false) {
    clearTimeout(this.timer);
    this.on = on;
    if (on && !this.linked) { this.input.connect(this.fx.input); this.linked = true; }
    glide(this.ctx, this.dry.gain, on ? 0 : 1, SWITCH_TIME, immediate);
    glide(this.ctx, this.wet.gain, on ? 1 : 0, SWITCH_TIME, immediate);
    if (!on && this.linked) {
      const unlink = () => {
        if (this.on || !this.linked) return;
        try { this.input.disconnect(this.fx.input); } catch { /* Already disconnected. */ }
        this.linked = false;
      };
      if (immediate) unlink(); else this.timer = setTimeout(unlink, 160);
    }
  }

  apply(state) {
    if (this.fx.setMode && state.mode) this.fx.setMode(state.mode, false);
    for (const [key, value] of Object.entries(state.params)) this.fx.set(key, value, false);
    this.setEnabled(Boolean(state.on));
  }

  dispose() {
    clearTimeout(this.timer);
    this.fx.dispose?.();
  }
}

export class Engine {
  constructor(ctx, settings) {
    this.ctx = ctx;
    this.source = null;
    this.splitter = null;
    // Guitar processing is mono until the stereo chorus/reverb stages.
    this.monoIn = ctx.createGain();
    this.monoIn.channelCount = 1;
    this.monoIn.channelCountMode = 'explicit';
    this.monoIn.channelInterpretation = 'speakers';
    this.trim = ctx.createGain();
    this.trim.gain.value = dbToGain(settings.input);
    this.inAnalyser = ctx.createAnalyser();
    this.inAnalyser.fftSize = 1024;
    this.chainIn = ctx.createGain();
    this.allDry = ctx.createGain();
    this.allDry.gain.value = 0;
    this.allWet = ctx.createGain();
    this.masterIn = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = dbToGain(settings.master);
    this.limiter = new AudioWorkletNode(ctx, 'stompbox-limiter');
    this.outAnalyser = ctx.createAnalyser();
    this.outAnalyser.fftSize = 2048;
    this.outAnalyser.smoothingTimeConstant = 0.78;
    this.outAnalyser.minDecibels = -96;
    this.outAnalyser.maxDecibels = -12;

    this.monoIn.connect(this.trim).connect(this.inAnalyser).connect(this.chainIn);
    this.slots = new Map();
    let previous = this.chainIn;
    for (const def of PEDALS) {
      const slot = new PedalSlot(ctx, def, settings.pedals[def.id]);
      previous.connect(slot.input);
      previous = slot.output;
      this.slots.set(def.id, slot);
    }
    previous.connect(this.allWet).connect(this.masterIn);
    this.chainIn.connect(this.allDry).connect(this.masterIn);
    this.masterIn.connect(this.master).connect(this.limiter).connect(this.outAnalyser).connect(ctx.destination);
  }

  connectSource(source, channel = 'mix') {
    this.disconnectSource();
    this.source = source;
    if (channel === 'left' || channel === 'right') {
      this.splitter = this.ctx.createChannelSplitter(2);
      source.connect(this.splitter);
      this.splitter.connect(this.monoIn, channel === 'right' ? 1 : 0);
    } else {
      source.connect(this.monoIn);
    }
  }

  setChannel(channel) {
    if (this.source) this.connectSource(this.source, channel);
  }

  disconnectSource() {
    if (this.source) { try { this.source.disconnect(); } catch { /* Already disconnected. */ } }
    if (this.splitter) { try { this.splitter.disconnect(); } catch { /* Already disconnected. */ } }
    this.source = null;
    this.splitter = null;
  }

  setPedalEnabled(id, on) { this.slots.get(id)?.setEnabled(on); }
  setParam(id, key, value) { this.slots.get(id)?.fx.set(key, value, false); }
  setMode(id, mode) { this.slots.get(id)?.fx.setMode?.(mode, false); }
  applyPedal(id, state) { this.slots.get(id)?.apply(state); }
  setInput(db) { glide(this.ctx, this.trim.gain, dbToGain(db)); }
  setMaster(db) { glide(this.ctx, this.master.gain, dbToGain(db)); }

  setBypassAll(bypass) {
    glide(this.ctx, this.allDry.gain, bypass ? 1 : 0, SWITCH_TIME);
    glide(this.ctx, this.allWet.gain, bypass ? 0 : 1, SWITCH_TIME);
  }

  dispose() {
    this.disconnectSource();
    this.slots.forEach(slot => slot.dispose());
    try { this.outAnalyser.disconnect(); } catch { /* Already disconnected. */ }
  }
}
