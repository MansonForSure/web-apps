import { OnsetFeatureExtractor } from './feature-extractor.js';

// A harmless base permits module-level Node imports used by deterministic
// tests. Browsers always select the real AudioWorkletProcessor base.
const WorkletProcessorBase = typeof AudioWorkletProcessor === 'function'
  ? AudioWorkletProcessor
  : class {};

/**
 * Captures mono microphone input into compact onset/rms features only.
 *
 * AudioWorklet execution is driven by the render quantum and the extractor’s
 * absolute sample-count boundaries. No audio is forwarded or retained, and all
 * outputs are explicitly zeroed so connecting this node cannot monitor the
 * microphone back to speakers.
 */
class BpmInputProcessor extends WorkletProcessorBase {
  constructor(options = {}) {
    super();
    const configuredRate = options.processorOptions?.frameRate;
    this._extractor = new OnsetFeatureExtractor({
      sampleRate,
      frameRate: Number.isFinite(configuredRate) ? configuredRate : 100,
    });
    this._pendingFrames = [];
    this._lastSentTime = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'reset') {
        this._extractor.reset();
        this._pendingFrames = [];
        this._lastSentTime = 0;
      }
    };
  }

  process(inputs, outputs) {
    // The node must never create a microphone monitoring path. Fill all
    // channels even when callers configure an output on the node.
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }

    const input = inputs[0];
    const mono = input && input[0];
    if (!mono || mono.length === 0) return true;

    const frames = this._extractor.process(mono);
    if (frames.length) this._pendingFrames.push(...frames);

    const newest = this._pendingFrames[this._pendingFrames.length - 1];
    // The normal case is 10 frames / ~100 ms. A count bound prevents an
    // unusually delayed port from producing a large feature message.
    if (newest && (newest.time - this._lastSentTime >= 0.095 || this._pendingFrames.length >= 12)) {
      this.port.postMessage({ type: 'features', frames: this._pendingFrames });
      this._lastSentTime = newest.time;
      this._pendingFrames = [];
    }
    return true;
  }
}

// Guarding registration keeps static Node module checks/imports harmless while
// browsers still register exactly the contractually named processor.
if (typeof registerProcessor === 'function') {
  registerProcessor('bpm-input', BpmInputProcessor);
}
