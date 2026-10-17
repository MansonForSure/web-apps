/**
 * Streaming, sample-domain onset feature extraction.
 *
 * The extractor deliberately keeps only filter state and the current ~10 ms
 * analysis frame. It never retains raw audio. Frame boundaries are computed
 * from absolute sample counts, so timestamps reflect the AudioContext clock
 * rather than main-thread scheduling.
 */
export class OnsetFeatureExtractor {
  constructor({ sampleRate, frameRate = 100 } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new TypeError('sampleRate must be a positive number');
    }
    if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > sampleRate) {
      throw new TypeError('frameRate must be a positive number no greater than sampleRate');
    }

    this.sampleRate = sampleRate;
    this.frameRate = frameRate;
    this.samplesPerFrame = sampleRate / frameRate;

    // One-pole filters are cheap enough for an AudioWorklet and provide a
    // useful low/mid/high energy split without an FFT allocation every frame.
    this._lowAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate);
    this._midAlpha = 1 - Math.exp((-2 * Math.PI * 1400) / sampleRate);
    this._highAlpha = 1 - Math.exp((-2 * Math.PI * 4200) / sampleRate);
    this.reset();
  }

  reset() {
    this._sampleCount = 0;
    this._frameIndex = 0;
    this._frameEndSample = Math.max(1, Math.round(this.samplesPerFrame));

    this._lowState = 0;
    this._midState = 0;
    this._highState = 0;
    this._previousSample = 0;

    this._sumSquare = 0;
    this._sumDiffSquare = 0;
    this._sumLowSquare = 0;
    this._sumMidSquare = 0;
    this._sumHighSquare = 0;
    this._frameSampleCount = 0;

    // Log energy values from the preceding frame. Starting at the floor means
    // an initial attack can be recognized, while a sustained tone produces
    // only that single attack rather than a false periodic onset train.
    this._previousLog = [-18, -18, -18, -18, -18];
  }

  /**
   * Process a Float32Array (or any indexed sample array) and return completed
   * feature frames. The returned objects contain no audio samples.
   */
  process(samples) {
    if (!samples || typeof samples.length !== 'number') return [];

    const frames = [];
    for (let index = 0; index < samples.length; index += 1) {
      let sample = Number(samples[index]);
      // Bad samples should not poison all subsequent filter state.
      if (!Number.isFinite(sample)) sample = 0;
      // Web Audio normally supplies [-1, 1], but clipping protects the log
      // energy feature if an offline caller provides a malformed buffer.
      sample = Math.max(-4, Math.min(4, sample));
      this._consumeSample(sample);

      this._sampleCount += 1;
      if (this._sampleCount >= this._frameEndSample) {
        frames.push(this._finishFrame());
        this._frameIndex += 1;
        const nominalEnd = Math.round((this._frameIndex + 1) * this.samplesPerFrame);
        this._frameEndSample = Math.max(this._sampleCount + 1, nominalEnd);
      }
    }
    return frames;
  }

  // Alias makes the streaming intent explicit for callers that process blocks.
  processChunk(samples) {
    return this.process(samples);
  }

  _consumeSample(sample) {
    const low = this._lowState + this._lowAlpha * (sample - this._lowState);
    this._lowState = low;

    const midLow = this._midState + this._midAlpha * (sample - this._midState);
    this._midState = midLow;

    const highLow = this._highState + this._highAlpha * (sample - this._highState);
    this._highState = highLow;

    const mid = midLow - low;
    const high = sample - highLow;
    const diff = sample - this._previousSample;
    this._previousSample = sample;

    this._sumSquare += sample * sample;
    this._sumDiffSquare += diff * diff;
    this._sumLowSquare += low * low;
    this._sumMidSquare += mid * mid;
    this._sumHighSquare += high * high;
    this._frameSampleCount += 1;
  }

  _finishFrame() {
    const count = Math.max(1, this._frameSampleCount);
    const rms = Math.sqrt(this._sumSquare / count);
    const floor = 1e-12;
    const logs = [
      Math.log(floor + this._sumSquare / count),
      Math.log(floor + this._sumLowSquare / count),
      Math.log(floor + this._sumMidSquare / count),
      Math.log(floor + this._sumHighSquare / count),
      Math.log(floor + this._sumDiffSquare / count),
    ];

    // Positive log-energy change is robust to microphone gain and is a
    // sample-domain analogue of multiband spectral flux. The high/difference
    // channels give attacks more weight than slow level changes.
    const weights = [0.20, 0.14, 0.20, 0.28, 0.18];
    let onset = 0;
    for (let band = 0; band < logs.length; band += 1) {
      onset += weights[band] * Math.max(0, logs[band] - this._previousLog[band]);
      this._previousLog[band] = logs[band];
    }
    // Finite frame windows make a steady sine wave's measured band energy
    // wiggle slightly with phase. Ignore that sub-decibel jitter so a
    // sustained tone yields its initial attack only, while real percussive
    // attacks (typically several log-energy units) remain intact.
    onset = Math.max(0, onset - 0.10);
    // A cap prevents one handling bump from dominating a 12-second tracker
    // window. It does not affect normal percussive attacks.
    onset = Math.min(12, onset);

    const frame = {
      time: this._sampleCount / this.sampleRate,
      onset,
      rms,
    };

    this._sumSquare = 0;
    this._sumDiffSquare = 0;
    this._sumLowSquare = 0;
    this._sumMidSquare = 0;
    this._sumHighSquare = 0;
    this._frameSampleCount = 0;
    return frame;
  }
}

/**
 * Convenience API for deterministic offline analysis. It uses exactly the
 * same stateful extractor as the worklet, including sample-clock timestamps.
 */
export function extractOnsetFeatures(samples, options) {
  const extractor = new OnsetFeatureExtractor(options);
  return extractor.process(samples);
}
