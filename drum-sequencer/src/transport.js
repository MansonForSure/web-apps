// Look-ahead transport: a worker-driven clock schedules hits slightly ahead
// of the audio clock for sample-accurate timing that survives UI jank.

import { nextPatternIndex, stepDuration, stepEvents } from "./patterns.js";

const LOOKAHEAD = 0.12; // seconds scheduled ahead of the audio clock
const TICK_MS = 25;

function makeTicker(onTick) {
  try {
    const src = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),${TICK_MS});}else{clearInterval(id);id=null;}};`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    return {
      start: () => worker.postMessage("start"),
      stop: () => worker.postMessage("stop"),
    };
  } catch {
    let id = null;
    return {
      start: () => {
        clearInterval(id);
        id = setInterval(onTick, TICK_MS);
      },
      stop: () => clearInterval(id),
    };
  }
}

export class Transport {
  /**
   * @param {() => AudioContext} getCtx
   * @param {import('./engine.js').DrumEngine} engine
   * @param {() => object} getState  returns the live app state
   * @param {{ onPattern?: (i:number)=>void }} hooks
   */
  constructor(getCtx, engine, getState, hooks = {}) {
    this.getCtx = getCtx;
    this.engine = engine;
    this.getState = getState;
    this.hooks = hooks;
    this.playing = false;
    this.queued = null;
    this.visual = [];
    this.ticker = makeTicker(() => this._tick());
  }

  /** @param {number} earliest  audio time before which nothing may sound */
  start(earliest = 0) {
    const ctx = this.getCtx();
    const state = this.getState();
    this.playing = true;
    this.pattern = state.current;
    this.livePattern = null;
    this.step = 0;
    this.queued = null;
    this.visual.length = 0;
    this.nextTime = Math.max(ctx.currentTime + 0.08, earliest);
    this._tick();
    this.ticker.start();
  }

  stop() {
    this.playing = false;
    this.ticker.stop();
    this.queued = null;
    this.visual.length = 0;
    this.engine.silence(0.18);
  }

  queue(index) {
    this.queued = index;
  }

  _tick() {
    if (!this.playing) return;
    const ctx = this.getCtx();
    const horizon = ctx.currentTime + LOOKAHEAD;
    // if the tab was frozen, skip ahead instead of firing a burst of notes
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      this._scheduleStep();
    }
  }

  _scheduleStep() {
    const state = this.getState();
    let pat = state.patterns[this.pattern];
    if (this.step >= pat.length) {
      this.step = 0;
      this._advancePattern(state);
      pat = state.patterns[this.pattern];
    }
    const t = this.nextTime;
    const events = stepEvents(pat, state.rows, this.step, {
      bpm: state.bpm,
      swing: state.swing,
      humanize: state.humanize,
    });
    for (const e of events) this.engine.trigger(e.voice, e.rowKey, t + e.offset, e.vel);
    this.visual.push({ time: t, pattern: this.pattern, step: this.step });
    if (this.visual.length > 128) this.visual.splice(0, this.visual.length - 128);
    this.nextTime += stepDuration(state.bpm, pat.division);
    this.step += 1;
    if (this.step >= pat.length) {
      this.step = 0;
      this._advancePattern(state);
    }
  }

  _advancePattern(state) {
    const next = nextPatternIndex(state, this.pattern, this.queued);
    this.queued = null;
    if (next !== this.pattern) {
      this.pattern = next;
      if (this.hooks.onPattern) this.hooks.onPattern(next);
    }
  }

  /** Visual position for the given audio time (already latency-compensated). */
  positionAt(time) {
    let cur = null;
    while (this.visual.length && this.visual[0].time <= time) cur = this.visual.shift();
    return cur;
  }
}
